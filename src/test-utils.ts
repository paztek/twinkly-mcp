/**
 * Test-only harness: spin up the real MCP server over an in-memory transport
 * with the {@link DeviceManager} backed by fake {@link TwinklyClient}s, and
 * return a connected client.
 *
 * Excluded from coverage in `vitest.config.ts` — it is wiring for tests, not
 * shipped code.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Device, DiscoverOptions, TwinklyClient } from '@twinklyjs/twinkly';
import { parseConfig, type TwinklyMcpConfig } from './config.js';
import { createLogger } from './logger.js';
import { DeviceManager } from './twinkly/device-manager.js';
import { createServer } from './server.js';

/** A partial stand-in for a real client — only stub the methods a test needs. */
export type FakeClient = Partial<TwinklyClient>;

export interface HarnessOptions {
  config?: TwinklyMcpConfig;
  /** Fake client used for every resolved device IP. */
  client?: FakeClient;
  /** Per-IP fake clients (takes precedence over `client`). */
  clientsByIp?: Record<string, FakeClient>;
  /** Inject a UDP discovery implementation (for discover_devices tests). */
  discover?: (options?: DiscoverOptions) => Promise<Device[]>;
}

export interface Harness {
  client: Client;
  deviceManager: DeviceManager;
  close: () => Promise<void>;
}

/** Connect a fresh in-memory client/server pair for a single test. */
export async function connectHarness(options: HarnessOptions = {}): Promise<Harness> {
  const config = options.config ?? parseConfig({ env: { TWINKLY_IP: '10.0.0.9' } });

  const createClient = (ip: string): TwinklyClient => {
    const fake = options.clientsByIp?.[ip] ?? options.client ?? {};
    return fake as TwinklyClient;
  };

  const deviceManager = new DeviceManager(config, {
    createClient,
    discover: options.discover,
  });
  const logger = createLogger('error', () => {});
  const server = createServer({ config, deviceManager, logger });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    deviceManager,
    close: () => client.close(),
  };
}
