/**
 * Configuration layer for twinkly-mcp.
 *
 * Resolution order (lowest → highest precedence):
 *   defaults  ←  config file  ←  environment variables  ←  CLI flags
 *
 * `parseConfig` is a pure function with all I/O injected, so it is fully
 * unit-testable without touching the real process env, argv, or filesystem.
 * `loadConfig` is the thin production wrapper that wires in the real sources.
 */
import { z } from 'zod';

/** Tool categories that can be selectively enabled via `tools`. */
export const TOOL_GROUPS = [
  'discovery',
  'status',
  'power',
  'color',
  'effects',
  'movies',
  'admin',
] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

export const TRANSPORTS = ['stdio', 'http'] as const;
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

/** A single named Twinkly device. */
const deviceSchema = z.object({
  name: z.string().min(1),
  ip: z.string().min(1),
});
export type DeviceConfig = z.infer<typeof deviceSchema>;

const configSchema = z
  .object({
    devices: z.array(deviceSchema),
    defaultDevice: z.string().min(1).optional(),
    discovery: z.boolean(),
    transport: z.enum(TRANSPORTS),
    port: z.number().int().min(1).max(65535),
    readonly: z.boolean(),
    /** `undefined` means "all groups enabled". */
    tools: z.array(z.enum(TOOL_GROUPS)).optional(),
    allowAdmin: z.boolean(),
    timeoutMs: z.number().int().positive(),
    logLevel: z.enum(LOG_LEVELS),
  })
  .superRefine((cfg, ctx) => {
    // A named default device must actually exist. (Device names are already
    // unique by construction — `mergeDevices` keys them by name.)
    if (cfg.defaultDevice && !cfg.devices.some((d) => d.name === cfg.defaultDevice)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `defaultDevice "${cfg.defaultDevice}" is not among the configured devices`,
        path: ['defaultDevice'],
      });
    }
  });

export type TwinklyMcpConfig = z.infer<typeof configSchema>;

/** Name used for the single device implied by `TWINKLY_IP` / `--ip`. */
export const IMPLICIT_DEVICE_NAME = 'default';

const DEFAULTS = {
  discovery: false,
  transport: 'stdio',
  port: 3000,
  readonly: false,
  allowAdmin: false,
  timeoutMs: 10_000,
  logLevel: 'info',
} as const;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Raw, un-normalized fragment contributed by one source (file/env/cli). */
interface ConfigFragment {
  devices?: DeviceConfig[];
  defaultDevice?: string;
  discovery?: boolean;
  transport?: string;
  port?: number;
  readonly?: boolean;
  tools?: string[];
  allowAdmin?: boolean;
  timeoutMs?: number;
  logLevel?: string;
}

export interface ParseSources {
  /** Parsed contents of a config file, if any. */
  file?: ConfigFragment;
  /** `process.env` (or a stand-in). */
  env?: Record<string, string | undefined>;
  /** CLI args without the `node script` prefix (i.e. `process.argv.slice(2)`). */
  argv?: string[];
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
  throw new ConfigError(`Expected a boolean but got "${value}"`);
}

function parseIntStrict(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new ConfigError(`${label} must be an integer, got "${value}"`);
  }
  return n;
}

function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse `TWINKLY_DEVICES` (a JSON object mapping name → ip) into device records. */
function parseDeviceMap(value: string | undefined): DeviceConfig[] | undefined {
  if (value === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new ConfigError(`TWINKLY_DEVICES must be valid JSON, got: ${value}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('TWINKLY_DEVICES must be a JSON object mapping name → ip');
  }
  return Object.entries(raw as Record<string, unknown>).map(([name, ip]) => {
    if (typeof ip !== 'string' || ip.length === 0) {
      throw new ConfigError(`TWINKLY_DEVICES entry "${name}" must map to a non-empty IP string`);
    }
    return { name, ip };
  });
}

function fragmentFromEnv(env: Record<string, string | undefined>): ConfigFragment {
  const devices: DeviceConfig[] = [];
  const mapped = parseDeviceMap(env.TWINKLY_DEVICES);
  if (mapped) devices.push(...mapped);
  if (env.TWINKLY_IP) {
    devices.push({ name: IMPLICIT_DEVICE_NAME, ip: env.TWINKLY_IP });
  }

  return stripUndefined({
    devices: devices.length > 0 ? devices : undefined,
    defaultDevice: env.TWINKLY_DEFAULT_DEVICE,
    discovery: parseBool(env.TWINKLY_DISCOVERY),
    transport: env.TWINKLY_TRANSPORT,
    port: parseIntStrict(env.TWINKLY_PORT, 'TWINKLY_PORT'),
    readonly: parseBool(env.TWINKLY_READONLY),
    tools: parseList(env.TWINKLY_TOOLS),
    allowAdmin: parseBool(env.TWINKLY_ALLOW_ADMIN),
    timeoutMs: parseIntStrict(env.TWINKLY_TIMEOUT_MS, 'TWINKLY_TIMEOUT_MS'),
    logLevel: env.TWINKLY_LOG_LEVEL,
  });
}

/** Minimal flag parser for the known options. Supports `--flag value` and `--flag=value`. */
function fragmentFromArgv(argv: string[]): ConfigFragment {
  const flags = new Map<string, string | boolean>();
  const devices: DeviceConfig[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    let key: string;
    let value: string | boolean;
    if (eq !== -1) {
      key = body.slice(0, eq);
      value = body.slice(eq + 1);
    } else {
      key = body;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        value = next;
        i++;
      } else {
        value = true; // bare boolean flag
      }
    }

    if (key === 'device') {
      // `--device name=ip`, repeatable
      const str = String(value);
      const sep = str.indexOf('=');
      if (sep === -1) throw new ConfigError(`--device must be "name=ip", got "${str}"`);
      devices.push({ name: str.slice(0, sep), ip: str.slice(sep + 1) });
    } else {
      flags.set(key, value);
    }
  }

  const ip = flags.get('ip');
  if (typeof ip === 'string') {
    devices.push({ name: IMPLICIT_DEVICE_NAME, ip });
  }

  const str = (k: string): string | undefined => {
    const v = flags.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const bool = (k: string): boolean | undefined => (flags.has(k) ? flags.get(k) !== false : undefined);

  return stripUndefined({
    devices: devices.length > 0 ? devices : undefined,
    defaultDevice: str('default-device'),
    discovery: bool('discovery'),
    transport: str('transport'),
    port: parseIntStrict(str('port'), '--port'),
    readonly: bool('readonly'),
    tools: parseList(str('tools')),
    allowAdmin: bool('allow-admin'),
    timeoutMs: parseIntStrict(str('timeout'), '--timeout'),
    logLevel: str('log-level'),
  });
}

function stripUndefined(obj: ConfigFragment): ConfigFragment {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as ConfigFragment;
}

/**
 * Merge device lists by name. Later sources override devices with the same
 * name, while preserving first-seen ordering.
 */
function mergeDevices(...lists: (DeviceConfig[] | undefined)[]): DeviceConfig[] {
  const byName = new Map<string, DeviceConfig>();
  for (const list of lists) {
    for (const device of list ?? []) {
      byName.set(device.name, device);
    }
  }
  return [...byName.values()];
}

/**
 * Merge all sources and validate. Throws {@link ConfigError} with a readable
 * message on any invalid input.
 */
export function parseConfig(sources: ParseSources = {}): TwinklyMcpConfig {
  const file = sources.file ?? {};
  const env = fragmentFromEnv(sources.env ?? {});
  const cli = fragmentFromArgv(sources.argv ?? []);

  const merged = {
    ...DEFAULTS,
    devices: mergeDevices(file.devices, env.devices, cli.devices),
    defaultDevice: cli.defaultDevice ?? env.defaultDevice ?? file.defaultDevice,
    discovery: cli.discovery ?? env.discovery ?? file.discovery ?? DEFAULTS.discovery,
    transport: cli.transport ?? env.transport ?? file.transport ?? DEFAULTS.transport,
    port: cli.port ?? env.port ?? file.port ?? DEFAULTS.port,
    readonly: cli.readonly ?? env.readonly ?? file.readonly ?? DEFAULTS.readonly,
    tools: cli.tools ?? env.tools ?? file.tools,
    allowAdmin: cli.allowAdmin ?? env.allowAdmin ?? file.allowAdmin ?? DEFAULTS.allowAdmin,
    timeoutMs: cli.timeoutMs ?? env.timeoutMs ?? file.timeoutMs ?? DEFAULTS.timeoutMs,
    logLevel: cli.logLevel ?? env.logLevel ?? file.logLevel ?? DEFAULTS.logLevel,
  };

  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${details}`);
  }
  return result.data;
}

/** Resolve which config file path to read, from `--config` or `TWINKLY_CONFIG`. */
export function resolveConfigPath(
  env: Record<string, string | undefined>,
  argv: string[],
): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith('--config=')) return arg.slice('--config='.length);
    if (arg === '--config') return argv[i + 1];
  }
  return env.TWINKLY_CONFIG;
}

export interface LoadConfigDeps {
  env?: Record<string, string | undefined>;
  argv?: string[];
  readFile?: (path: string) => string;
}

/** Production entry point: reads the real env, argv, and (optional) config file. */
export function loadConfig(deps: LoadConfigDeps = {}): TwinklyMcpConfig {
  const env = deps.env ?? process.env;
  const argv = deps.argv ?? process.argv.slice(2);

  let file: ConfigFragment | undefined;
  const path = resolveConfigPath(env, argv);
  if (path) {
    if (!deps.readFile) {
      throw new ConfigError('No file reader available to load config file');
    }
    let contents: string;
    try {
      contents = deps.readFile(path);
    } catch (err) {
      throw new ConfigError(`Could not read config file "${path}": ${(err as Error).message}`);
    }
    try {
      file = JSON.parse(contents) as ConfigFragment;
    } catch {
      throw new ConfigError(`Config file "${path}" is not valid JSON`);
    }
  }

  return parseConfig({ file, env, argv });
}
