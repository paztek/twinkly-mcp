/**
 * Real-device integration smoke test.
 *
 * Skipped unless `TWINKLY_IP` points at a reachable Twinkly device. It is
 * **read-only** — it registers the server in read-only mode and only calls read
 * tools, so it never changes your lights. Run it against real hardware with:
 *
 *   TWINKLY_IP=192.168.1.50 npx vitest run src/integration.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { parseConfig } from './config.js';
import { createLogger } from './logger.js';
import { DeviceManager } from './twinkly/device-manager.js';
import { createServer } from './server.js';

const ip = process.env.TWINKLY_IP;

describe.skipIf(!ip)('integration smoke (real device)', () => {
  it('connects over MCP and reads device details and state', async () => {
    const config = parseConfig({ env: { TWINKLY_IP: ip, TWINKLY_READONLY: 'true' } });
    const deviceManager = new DeviceManager(config);
    const logger = createLogger('error', () => {});
    const server = createServer({ config, deviceManager, logger });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'integration-smoke', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const details = await client.callTool({ name: 'get_device_details', arguments: {} });
      expect(details.isError).toBeFalsy();
      expect(details.structuredContent).toMatchObject({ device: 'default' });

      const state = await client.callTool({ name: 'get_state', arguments: {} });
      expect(state.isError).toBeFalsy();
      expect((state.structuredContent as { mode: unknown }).mode).toBeTypeOf('string');
    } finally {
      await client.close();
    }
  }, 15_000);
});
