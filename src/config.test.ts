import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  IMPLICIT_DEVICE_NAME,
  loadConfig,
  parseConfig,
  resolveConfigPath,
} from './config.js';

describe('parseConfig — defaults', () => {
  it('applies defaults when no sources are given', () => {
    const cfg = parseConfig();
    expect(cfg).toEqual({
      devices: [],
      defaultDevice: undefined,
      discovery: false,
      transport: 'stdio',
      port: 3000,
      readonly: false,
      tools: undefined,
      allowAdmin: false,
      timeoutMs: 10_000,
      logLevel: 'info',
    });
  });
});

describe('parseConfig — environment variables', () => {
  it('reads a single device from TWINKLY_IP', () => {
    const cfg = parseConfig({ env: { TWINKLY_IP: '192.168.1.50' } });
    expect(cfg.devices).toEqual([{ name: IMPLICIT_DEVICE_NAME, ip: '192.168.1.50' }]);
  });

  it('reads a device map from TWINKLY_DEVICES', () => {
    const cfg = parseConfig({
      env: { TWINKLY_DEVICES: '{"tree":"192.168.1.50","window":"192.168.1.51"}' },
    });
    expect(cfg.devices).toEqual([
      { name: 'tree', ip: '192.168.1.50' },
      { name: 'window', ip: '192.168.1.51' },
    ]);
  });

  it('combines TWINKLY_DEVICES and TWINKLY_IP', () => {
    const cfg = parseConfig({
      env: { TWINKLY_DEVICES: '{"tree":"10.0.0.1"}', TWINKLY_IP: '10.0.0.2' },
    });
    expect(cfg.devices).toEqual([
      { name: 'tree', ip: '10.0.0.1' },
      { name: IMPLICIT_DEVICE_NAME, ip: '10.0.0.2' },
    ]);
  });

  it('parses booleans, ints, lists and enums', () => {
    const cfg = parseConfig({
      env: {
        TWINKLY_DISCOVERY: 'true',
        TWINKLY_READONLY: 'yes',
        TWINKLY_ALLOW_ADMIN: 'on',
        TWINKLY_PORT: '8080',
        TWINKLY_TIMEOUT_MS: '5000',
        TWINKLY_TRANSPORT: 'http',
        TWINKLY_TOOLS: 'power, color ,status',
        TWINKLY_LOG_LEVEL: 'debug',
      },
    });
    expect(cfg.discovery).toBe(true);
    expect(cfg.readonly).toBe(true);
    expect(cfg.allowAdmin).toBe(true);
    expect(cfg.port).toBe(8080);
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.transport).toBe('http');
    expect(cfg.tools).toEqual(['power', 'color', 'status']);
    expect(cfg.logLevel).toBe('debug');
  });

  it('treats "false"/"off"/"0" as false', () => {
    for (const v of ['false', 'off', '0', 'no']) {
      expect(parseConfig({ env: { TWINKLY_DISCOVERY: v } }).discovery).toBe(false);
    }
  });

  it('throws on a non-boolean boolean value', () => {
    expect(() => parseConfig({ env: { TWINKLY_DISCOVERY: 'maybe' } })).toThrow(ConfigError);
  });

  it('throws on a non-integer port', () => {
    expect(() => parseConfig({ env: { TWINKLY_PORT: '80.5' } })).toThrow(/integer/);
  });

  it('throws on malformed TWINKLY_DEVICES JSON', () => {
    expect(() => parseConfig({ env: { TWINKLY_DEVICES: 'not json' } })).toThrow(/valid JSON/);
  });

  it('throws when TWINKLY_DEVICES is a JSON array', () => {
    expect(() => parseConfig({ env: { TWINKLY_DEVICES: '["10.0.0.1"]' } })).toThrow(
      /mapping name/,
    );
  });

  it('throws when a device map entry is not a string ip', () => {
    expect(() => parseConfig({ env: { TWINKLY_DEVICES: '{"tree":123}' } })).toThrow(
      /non-empty IP/,
    );
  });
});

describe('parseConfig — CLI flags', () => {
  it('parses --flag value form', () => {
    const cfg = parseConfig({ argv: ['--ip', '10.0.0.9', '--port', '9000'] });
    expect(cfg.devices).toEqual([{ name: IMPLICIT_DEVICE_NAME, ip: '10.0.0.9' }]);
    expect(cfg.port).toBe(9000);
  });

  it('parses --flag=value form', () => {
    const cfg = parseConfig({ argv: ['--ip=10.0.0.9', '--transport=http'] });
    expect(cfg.devices[0]?.ip).toBe('10.0.0.9');
    expect(cfg.transport).toBe('http');
  });

  it('treats a bare flag as boolean true', () => {
    const cfg = parseConfig({ argv: ['--readonly', '--discovery'] });
    expect(cfg.readonly).toBe(true);
    expect(cfg.discovery).toBe(true);
  });

  it('supports repeatable --device name=ip', () => {
    const cfg = parseConfig({
      argv: ['--device', 'tree=10.0.0.1', '--device', 'window=10.0.0.2'],
    });
    expect(cfg.devices).toEqual([
      { name: 'tree', ip: '10.0.0.1' },
      { name: 'window', ip: '10.0.0.2' },
    ]);
  });

  it('throws on a malformed --device', () => {
    expect(() => parseConfig({ argv: ['--device', 'broken'] })).toThrow(/name=ip/);
  });

  it('ignores positional/unknown args without flags', () => {
    const cfg = parseConfig({ argv: ['serve', '--ip', '10.0.0.1', 'extra'] });
    expect(cfg.devices[0]?.ip).toBe('10.0.0.1');
  });
});

describe('parseConfig — precedence (defaults < file < env < cli)', () => {
  it('env overrides file', () => {
    const cfg = parseConfig({
      file: { transport: 'stdio', port: 1111 },
      env: { TWINKLY_PORT: '2222' },
    });
    expect(cfg.transport).toBe('stdio');
    expect(cfg.port).toBe(2222);
  });

  it('cli overrides env and file', () => {
    const cfg = parseConfig({
      file: { port: 1111 },
      env: { TWINKLY_PORT: '2222' },
      argv: ['--port', '3333'],
    });
    expect(cfg.port).toBe(3333);
  });

  it('merges devices across sources, with later sources overriding by name', () => {
    const cfg = parseConfig({
      file: { devices: [{ name: 'tree', ip: '1.1.1.1' }] },
      env: { TWINKLY_DEVICES: '{"window":"2.2.2.2"}' },
      argv: ['--device', 'tree=9.9.9.9'],
    });
    // tree overridden by CLI, window from env, ordering preserved by first-seen.
    expect(cfg.devices).toEqual([
      { name: 'tree', ip: '9.9.9.9' },
      { name: 'window', ip: '2.2.2.2' },
    ]);
  });
});

describe('parseConfig — validation', () => {
  it('rejects an out-of-range port', () => {
    expect(() => parseConfig({ env: { TWINKLY_PORT: '70000' } })).toThrow(ConfigError);
  });

  it('rejects an unknown transport', () => {
    expect(() => parseConfig({ argv: ['--transport', 'carrier-pigeon'] })).toThrow(
      /transport/,
    );
  });

  it('rejects an unknown tool group', () => {
    expect(() => parseConfig({ env: { TWINKLY_TOOLS: 'power,teleport' } })).toThrow(
      ConfigError,
    );
  });

  it('rejects an unknown log level', () => {
    expect(() => parseConfig({ env: { TWINKLY_LOG_LEVEL: 'shout' } })).toThrow(ConfigError);
  });

  it('rejects a non-positive timeout', () => {
    expect(() => parseConfig({ env: { TWINKLY_TIMEOUT_MS: '0' } })).toThrow(ConfigError);
  });

  it('deduplicates devices by name (last wins), within and across sources', () => {
    const cfg = parseConfig({
      file: {
        devices: [
          { name: 'a', ip: '1.1.1.1' },
          { name: 'a', ip: '2.2.2.2' },
        ],
      },
      argv: ['--device', 'a=3.3.3.3'],
    });
    expect(cfg.devices).toEqual([{ name: 'a', ip: '3.3.3.3' }]);
  });

  it('rejects a defaultDevice that does not exist', () => {
    expect(() =>
      parseConfig({ env: { TWINKLY_IP: '1.1.1.1', TWINKLY_DEFAULT_DEVICE: 'ghost' } }),
    ).toThrow(/not among the configured devices/);
  });

  it('accepts a defaultDevice that exists', () => {
    const cfg = parseConfig({
      env: { TWINKLY_DEVICES: '{"tree":"1.1.1.1"}', TWINKLY_DEFAULT_DEVICE: 'tree' },
    });
    expect(cfg.defaultDevice).toBe('tree');
  });
});

describe('resolveConfigPath', () => {
  it('prefers --config=path', () => {
    expect(resolveConfigPath({}, ['--config=/tmp/a.json'])).toBe('/tmp/a.json');
  });

  it('reads --config path (space form)', () => {
    expect(resolveConfigPath({}, ['--config', '/tmp/b.json'])).toBe('/tmp/b.json');
  });

  it('falls back to TWINKLY_CONFIG', () => {
    expect(resolveConfigPath({ TWINKLY_CONFIG: '/tmp/c.json' }, [])).toBe('/tmp/c.json');
  });

  it('CLI flag wins over env', () => {
    expect(resolveConfigPath({ TWINKLY_CONFIG: '/env.json' }, ['--config=/cli.json'])).toBe(
      '/cli.json',
    );
  });

  it('returns undefined when nothing is set', () => {
    expect(resolveConfigPath({}, [])).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('reads and merges a JSON config file', () => {
    const cfg = loadConfig({
      env: { TWINKLY_CONFIG: '/cfg.json', TWINKLY_PORT: '4444' },
      argv: [],
      readFile: () => JSON.stringify({ transport: 'http', port: 1111 }),
    });
    expect(cfg.transport).toBe('http'); // from file
    expect(cfg.port).toBe(4444); // env overrides file
  });

  it('throws a readable error when the file is missing', () => {
    expect(() =>
      loadConfig({
        env: { TWINKLY_CONFIG: '/missing.json' },
        argv: [],
        readFile: () => {
          throw new Error('ENOENT');
        },
      }),
    ).toThrow(/Could not read config file/);
  });

  it('throws when the config file is not valid JSON', () => {
    expect(() =>
      loadConfig({
        env: { TWINKLY_CONFIG: '/bad.json' },
        argv: [],
        readFile: () => 'not json{',
      }),
    ).toThrow(/not valid JSON/);
  });

  it('works with no config file', () => {
    const cfg = loadConfig({ env: { TWINKLY_IP: '1.2.3.4' }, argv: [] });
    expect(cfg.devices).toEqual([{ name: IMPLICIT_DEVICE_NAME, ip: '1.2.3.4' }]);
  });
});
