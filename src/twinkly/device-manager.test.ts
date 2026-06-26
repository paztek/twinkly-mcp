import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TwinklyClient } from '@twinklyjs/twinkly';
import { FetchError } from '@twinklyjs/twinkly';
import { DeviceManager, type DeviceManagerDeps } from './device-manager.js';
import { TwinklyError } from '../errors.js';

/** A minimal stand-in for TwinklyClient that records the IP it was built with. */
interface FakeClient {
  ip: string;
}

function makeDeps(overrides: Partial<DeviceManagerDeps> = {}): {
  deps: DeviceManagerDeps;
  createClient: ReturnType<typeof vi.fn>;
} {
  const createClient = vi.fn((ip: string) => ({ ip }) as unknown as TwinklyClient);
  return {
    createClient,
    deps: { createClient, ...overrides },
  };
}

describe('DeviceManager — registry & resolution', () => {
  it('lists configured devices', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager(
      { devices: [{ name: 'tree', ip: '10.0.0.1' }, { name: 'window', ip: '10.0.0.2' }] },
      deps,
    );
    expect(mgr.listDevices()).toEqual([
      { name: 'tree', ip: '10.0.0.1', source: 'config', isDefault: false },
      { name: 'window', ip: '10.0.0.2', source: 'config', isDefault: false },
    ]);
    expect(mgr.has('tree')).toBe(true);
    expect(mgr.has('nope')).toBe(false);
  });

  it('resolves an explicit device name to a client', () => {
    const { deps, createClient } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    const resolved = mgr.resolve('tree');
    expect(resolved.name).toBe('tree');
    expect(resolved.ip).toBe('10.0.0.1');
    expect((resolved.client as unknown as FakeClient).ip).toBe('10.0.0.1');
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('creates each client lazily and reuses it', () => {
    const { deps, createClient } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    expect(createClient).not.toHaveBeenCalled();
    const first = mgr.resolve('tree').client;
    const second = mgr.resolve('tree').client;
    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('throws device_not_found for an unknown name', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    try {
      mgr.resolve('ghost');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TwinklyError);
      expect((err as TwinklyError).code).toBe('device_not_found');
      expect((err as TwinklyError).message).toContain('tree');
    }
  });
});

describe('DeviceManager — default resolution', () => {
  it('falls back to the sole device when none is specified', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    expect(mgr.resolve().name).toBe('tree');
    expect(mgr.listDevices()[0]?.isDefault).toBe(true);
  });

  it('uses the configured defaultDevice among many', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager(
      {
        devices: [{ name: 'tree', ip: '10.0.0.1' }, { name: 'window', ip: '10.0.0.2' }],
        defaultDevice: 'window',
      },
      deps,
    );
    expect(mgr.resolve().name).toBe('window');
    const window = mgr.listDevices().find((d) => d.name === 'window');
    expect(window?.isDefault).toBe(true);
  });

  it('uses the implicit "default" device among many when no default is set', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager(
      { devices: [{ name: 'default', ip: '10.0.0.1' }, { name: 'window', ip: '10.0.0.2' }] },
      deps,
    );
    expect(mgr.resolve().name).toBe('default');
  });

  it('throws no_device_specified when ambiguous', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager(
      { devices: [{ name: 'tree', ip: '10.0.0.1' }, { name: 'window', ip: '10.0.0.2' }] },
      deps,
    );
    try {
      mgr.resolve();
      expect.unreachable();
    } catch (err) {
      expect((err as TwinklyError).code).toBe('no_device_specified');
    }
  });

  it('throws device_not_found when no devices are configured', () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [] }, deps);
    try {
      mgr.resolve();
      expect.unreachable();
    } catch (err) {
      expect((err as TwinklyError).code).toBe('device_not_found');
    }
  });
});

describe('DeviceManager — withDevice', () => {
  it('returns the operation result', async () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    const result = await mgr.withDevice('tree', async (client) => {
      return (client as unknown as FakeClient).ip;
    });
    expect(result).toBe('10.0.0.1');
  });

  it('maps a FetchError into device_request_failed tagged with the device', async () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    const response = new Response('', { status: 500, statusText: 'Server Error' });
    await expect(
      mgr.withDevice('tree', async () => {
        throw new FetchError('boom', response);
      }),
    ).rejects.toMatchObject({ code: 'device_request_failed', status: 500, device: 'tree' });
  });

  it('maps a network error into device_unreachable', async () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    await expect(
      mgr.withDevice('tree', async () => {
        throw new Error('ECONNREFUSED');
      }),
    ).rejects.toMatchObject({ code: 'device_unreachable', device: 'tree' });
  });

  it('propagates resolution errors before running the operation', async () => {
    const { deps } = makeDeps();
    const mgr = new DeviceManager({ devices: [] }, deps);
    const fn = vi.fn();
    await expect(mgr.withDevice(undefined, fn)).rejects.toBeInstanceOf(TwinklyError);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('DeviceManager — discovery', () => {
  function discoverDeps(devices: { ip: string; port: number; deviceId: string }[]) {
    const { deps, createClient } = makeDeps();
    let nowValue = 1_000;
    const discover = vi.fn(async () => devices);
    return {
      createClient,
      discover,
      setNow: (n: number) => {
        nowValue = n;
      },
      deps: { ...deps, discover, now: () => nowValue, discoveryTtlMs: 5_000 },
    };
  }

  it('adds newly discovered devices to the registry', async () => {
    const { deps, discover } = discoverDeps([{ ip: '10.0.0.9', port: 80, deviceId: 'ABC123' }]);
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    const list = await mgr.discoverDevices();
    expect(discover).toHaveBeenCalledTimes(1);
    expect(list).toContainEqual({
      name: 'ABC123',
      ip: '10.0.0.9',
      source: 'discovered',
      isDefault: false,
    });
  });

  it('does not duplicate a device already known by IP', async () => {
    const { deps } = discoverDeps([{ ip: '10.0.0.1', port: 80, deviceId: 'ABC123' }]);
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    const list = await mgr.discoverDevices();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('tree');
  });

  it('caches results within the TTL and re-runs after force', async () => {
    const { deps, discover, setNow } = discoverDeps([
      { ip: '10.0.0.9', port: 80, deviceId: 'ABC123' },
    ]);
    const mgr = new DeviceManager({ devices: [] }, deps);
    await mgr.discoverDevices();
    setNow(2_000); // within 5s TTL
    await mgr.discoverDevices();
    expect(discover).toHaveBeenCalledTimes(1);
    await mgr.discoverDevices({ force: true });
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('re-runs discovery after the TTL expires', async () => {
    const { deps, discover, setNow } = discoverDeps([
      { ip: '10.0.0.9', port: 80, deviceId: 'ABC123' },
    ]);
    const mgr = new DeviceManager({ devices: [] }, deps);
    await mgr.discoverDevices();
    setNow(10_000); // past 5s TTL
    await mgr.discoverDevices();
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('disambiguates discovered names that collide with existing ones', async () => {
    const { deps } = discoverDeps([{ ip: '10.0.0.9', port: 80, deviceId: 'tree' }]);
    const mgr = new DeviceManager({ devices: [{ name: 'tree', ip: '10.0.0.1' }] }, deps);
    const list = await mgr.discoverDevices();
    const discovered = list.find((d) => d.source === 'discovered');
    expect(discovered?.name).toBe('tree-2');
    expect(discovered?.ip).toBe('10.0.0.9');
  });

  it('wraps discovery failures in a discovery_failed TwinklyError', async () => {
    const { deps, createClient } = makeDeps();
    const mgr = new DeviceManager(
      { devices: [] },
      { ...deps, createClient, discover: async () => {
        throw new Error('socket down');
      } },
    );
    await expect(mgr.discoverDevices()).rejects.toMatchObject({ code: 'discovery_failed' });
  });
});
