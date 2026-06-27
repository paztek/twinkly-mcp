import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { parseConfig, type TwinklyMcpConfig } from './config.js';
import { createLogger } from './logger.js';
import { DeviceManager } from './twinkly/device-manager.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

/** Spin up the real server over an in-memory transport and return a connected client. */
async function connect(config: TwinklyMcpConfig): Promise<Client> {
  const deviceManager = new DeviceManager(config);
  const logger = createLogger('error', () => {});
  const server = createServer({ config, deviceManager, logger });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const twoDevices = parseConfig({
  env: {
    TWINKLY_DEVICES: JSON.stringify({ tree: '10.0.0.1', window: '10.0.0.2' }),
    TWINKLY_DEFAULT_DEVICE: 'window',
  },
});

describe('createServer', () => {
  it('advertises the server name and version on initialize', async () => {
    const client = await connect(parseConfig({ env: { TWINKLY_IP: '10.0.0.9' } }));
    expect(client.getServerVersion()).toMatchObject({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });
    await client.close();
  });

  it('registers list_devices as a read-only tool', async () => {
    const client = await connect(twoDevices);
    const { tools } = await client.listTools();

    const listDevices = tools.find((t) => t.name === 'list_devices');
    expect(listDevices).toBeDefined();
    expect(listDevices?.annotations?.readOnlyHint).toBe(true);
    expect(listDevices?.outputSchema).toBeDefined();

    await client.close();
  });
});

describe('list_devices tool', () => {
  it('returns the configured devices with the default flagged', async () => {
    const client = await connect(twoDevices);

    const result = await client.callTool({ name: 'list_devices' });

    expect(result.structuredContent).toEqual({
      devices: [
        { name: 'tree', ip: '10.0.0.1', source: 'config', isDefault: false },
        { name: 'window', ip: '10.0.0.2', source: 'config', isDefault: true },
      ],
    });

    await client.close();
  });

  it('also returns the inventory as JSON text content', async () => {
    const client = await connect(parseConfig({ env: { TWINKLY_IP: '10.0.0.9' } }));

    const result = await client.callTool({ name: 'list_devices' });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.type).toBe('text');
    const parsed = JSON.parse(content[0]?.text ?? '{}');
    // A single configured device is the implicit default.
    expect(parsed).toEqual({
      devices: [{ name: 'default', ip: '10.0.0.9', source: 'config', isDefault: true }],
    });

    await client.close();
  });

  it('reports an empty inventory when no devices are configured', async () => {
    const client = await connect(parseConfig({}));

    const result = await client.callTool({ name: 'list_devices' });

    expect(result.structuredContent).toEqual({ devices: [] });

    await client.close();
  });
});
