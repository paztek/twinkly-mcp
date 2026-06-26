/**
 * Device registry: the single owner of {@link TwinklyClient} instances.
 *
 * Tools never construct clients or touch HTTP — they ask the manager to
 * resolve a `device` parameter to a client and run an operation through
 * {@link DeviceManager.withDevice}, which centralizes error normalization.
 *
 * Responsibilities:
 *   - hold a name→device registry seeded from config,
 *   - lazily create one client per device and reuse it (so the cached auth
 *     token from `@twinklyjs/twinkly` is reused across calls),
 *   - resolve an optional `device` argument to a concrete device, falling back
 *     to the configured default / sole device / implicit `default`,
 *   - run UDP discovery on demand with a short-lived cache and fold the results
 *     into the registry.
 */
import { TwinklyClient, discover as defaultDiscover } from '@twinklyjs/twinkly';
import type { Device, DiscoverOptions } from '@twinklyjs/twinkly';
import { IMPLICIT_DEVICE_NAME, type TwinklyMcpConfig } from '../config.js';
import { TwinklyError, toTwinklyError } from '../errors.js';

/** Where a registry entry came from. */
export type DeviceSource = 'config' | 'discovered';

/** Public, serializable view of a registered device. */
export interface DeviceInfo {
  name: string;
  ip: string;
  source: DeviceSource;
  /** True when this device is the one used if a tool omits `device`. */
  isDefault: boolean;
}

/** A device resolved to a live client, ready to use. */
export interface ResolvedDevice {
  name: string;
  ip: string;
  client: TwinklyClient;
}

/** Injectable seams, all defaulted to the real implementations. */
export interface DeviceManagerDeps {
  /** Factory for clients (overridden in tests). */
  createClient?: (ip: string) => TwinklyClient;
  /** UDP discovery implementation (overridden in tests). */
  discover?: (options?: DiscoverOptions) => Promise<Device[]>;
  /** Clock, for the discovery cache TTL (overridden in tests). */
  now?: () => number;
  /** How long discovery results stay fresh, in ms. Default 60s. */
  discoveryTtlMs?: number;
}

interface RegistryEntry {
  name: string;
  ip: string;
  source: DeviceSource;
  /** Lazily created on first use, then reused. */
  client?: TwinklyClient;
}

const DEFAULT_DISCOVERY_TTL_MS = 60_000;

export class DeviceManager {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly defaultDevice: string | undefined;

  private readonly createClient: (ip: string) => TwinklyClient;
  private readonly discoverImpl: (options?: DiscoverOptions) => Promise<Device[]>;
  private readonly now: () => number;
  private readonly discoveryTtlMs: number;

  private discoveryCache: { at: number; devices: Device[] } | undefined;

  constructor(config: Pick<TwinklyMcpConfig, 'devices' | 'defaultDevice'>, deps: DeviceManagerDeps = {}) {
    this.createClient = deps.createClient ?? ((ip) => new TwinklyClient({ ip }));
    this.discoverImpl = deps.discover ?? defaultDiscover;
    this.now = deps.now ?? Date.now;
    this.discoveryTtlMs = deps.discoveryTtlMs ?? DEFAULT_DISCOVERY_TTL_MS;
    this.defaultDevice = config.defaultDevice;

    for (const device of config.devices) {
      this.entries.set(device.name, { name: device.name, ip: device.ip, source: 'config' });
    }
  }

  /** All registered devices (config + discovered), in insertion order. */
  listDevices(): DeviceInfo[] {
    const defaultName = this.tryResolveDefaultName();
    return [...this.entries.values()].map((entry) => ({
      name: entry.name,
      ip: entry.ip,
      source: entry.source,
      isDefault: entry.name === defaultName,
    }));
  }

  /** Whether a device with the given name is registered. */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /**
   * Resolve a `device` argument to a live client. Throws {@link TwinklyError}
   * (`device_not_found` / `no_device_specified`) when resolution fails.
   */
  resolve(deviceName?: string): ResolvedDevice {
    const entry = this.entries.get(this.resolveName(deviceName));
    // `resolveName` only ever returns names that exist in the registry.
    if (!entry) {
      throw new TwinklyError('device_not_found', `Unknown device "${deviceName ?? ''}"`);
    }
    return { name: entry.name, ip: entry.ip, client: this.clientFor(entry) };
  }

  /**
   * Run an operation against a resolved device, normalizing any failure into a
   * {@link TwinklyError} tagged with the device name. This is the only path
   * tools should use to talk to a device.
   */
  async withDevice<T>(
    deviceName: string | undefined,
    fn: (client: TwinklyClient) => Promise<T>,
  ): Promise<T> {
    const { name, client } = this.resolve(deviceName);
    try {
      return await fn(client);
    } catch (err) {
      throw toTwinklyError(err, name);
    }
  }

  /**
   * Discover devices on the LAN, caching results for `discoveryTtlMs`. Newly
   * found devices (by IP) are added to the registry under their `deviceId`.
   * Pass `force` to bypass the cache.
   */
  async discoverDevices(options: { force?: boolean } & DiscoverOptions = {}): Promise<DeviceInfo[]> {
    const { force, ...discoverOptions } = options;
    const devices = await this.runDiscovery(force ?? false, discoverOptions);

    const knownIps = new Set([...this.entries.values()].map((e) => e.ip));
    for (const device of devices) {
      if (knownIps.has(device.ip)) continue;
      const name = this.uniqueName(device.deviceId || device.ip);
      this.entries.set(name, { name, ip: device.ip, source: 'discovered' });
      knownIps.add(device.ip);
    }

    return this.listDevices();
  }

  private async runDiscovery(force: boolean, options: DiscoverOptions): Promise<Device[]> {
    const cache = this.discoveryCache;
    if (!force && cache && this.now() - cache.at < this.discoveryTtlMs) {
      return cache.devices;
    }
    let devices: Device[];
    try {
      devices = await this.discoverImpl(options);
    } catch (err) {
      throw new TwinklyError('discovery_failed', `Device discovery failed: ${messageOf(err)}`, {
        cause: err,
      });
    }
    this.discoveryCache = { at: this.now(), devices };
    return devices;
  }

  private clientFor(entry: RegistryEntry): TwinklyClient {
    if (!entry.client) {
      entry.client = this.createClient(entry.ip);
    }
    return entry.client;
  }

  /** Resolve a (possibly absent) device name to a concrete, existing name. */
  private resolveName(deviceName?: string): string {
    if (deviceName !== undefined) {
      if (!this.entries.has(deviceName)) {
        throw new TwinklyError(
          'device_not_found',
          `Unknown device "${deviceName}". Known devices: ${this.deviceNamesLabel()}`,
        );
      }
      return deviceName;
    }

    const fallback = this.tryResolveDefaultName();
    if (fallback) return fallback;

    if (this.entries.size === 0) {
      throw new TwinklyError(
        'device_not_found',
        'No devices configured. Set TWINKLY_IP / TWINKLY_DEVICES or enable discovery.',
      );
    }
    throw new TwinklyError(
      'no_device_specified',
      `Multiple devices are configured and no default is set. Specify one of: ${this.deviceNamesLabel()}`,
    );
  }

  /** The default device name, or `undefined` if it can't be determined. */
  private tryResolveDefaultName(): string | undefined {
    if (this.defaultDevice && this.entries.has(this.defaultDevice)) {
      return this.defaultDevice;
    }
    if (this.entries.size === 1) {
      return this.entries.keys().next().value;
    }
    if (this.entries.has(IMPLICIT_DEVICE_NAME)) {
      return IMPLICIT_DEVICE_NAME;
    }
    return undefined;
  }

  private deviceNamesLabel(): string {
    const names = [...this.entries.keys()];
    return names.length > 0 ? names.join(', ') : '(none)';
  }

  /** Ensure a discovered device name doesn't collide with an existing entry. */
  private uniqueName(base: string): string {
    if (!this.entries.has(base)) return base;
    let i = 2;
    while (this.entries.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
