import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TwinklyClient } from '@twinklyjs/twinkly';
import { parseConfig, type TwinklyMcpConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { DeviceManager } from '../twinkly/device-manager.js';
import { createServer } from '../server.js';
import { startHttpTransport, type RunningHttpServer } from './http.js';

/** Start an HTTP-hosted server on an ephemeral port for the given config. */
async function startServer(config: TwinklyMcpConfig): Promise<RunningHttpServer> {
  const logger = createLogger('error', () => {});
  const deviceManager = new DeviceManager(config, {
    createClient: (ip) => ({ ip }) as unknown as TwinklyClient,
  });
  return startHttpTransport({
    port: 0,
    logger,
    createMcpServer: () => createServer({ config, deviceManager, logger }),
  });
}

const singleDevice = parseConfig({ env: { TWINKLY_IP: '10.0.0.9' } });

describe('Streamable HTTP transport', () => {
  it('serves a full MCP session: initialize, list, call', async () => {
    const http = await startServer(singleDevice);
    const client = new Client({ name: 'http-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(http.url));

    try {
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('list_devices');

      const result = await client.callTool({ name: 'list_devices' });
      expect(result.structuredContent).toEqual({
        devices: [{ name: 'default', ip: '10.0.0.9', source: 'config', isDefault: true }],
      });
    } finally {
      await client.close();
      await http.close();
    }
  });

  it('returns 404 for paths other than /mcp', async () => {
    const http = await startServer(singleDevice);
    try {
      const res = await fetch(`http://127.0.0.1:${http.port}/healthz`);
      expect(res.status).toBe(404);
    } finally {
      await http.close();
    }
  });

  it('rejects a non-initialize POST that has no session', async () => {
    const http = await startServer(singleDevice);
    try {
      const res = await fetch(http.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await http.close();
    }
  });

  it('rejects a GET without a known session id', async () => {
    const http = await startServer(singleDevice);
    try {
      const res = await fetch(http.url, { headers: { Accept: 'text/event-stream' } });
      expect(res.status).toBe(404);
    } finally {
      await http.close();
    }
  });

  it('rejects unsupported HTTP methods', async () => {
    const http = await startServer(singleDevice);
    try {
      const res = await fetch(http.url, { method: 'PUT' });
      expect(res.status).toBe(405);
    } finally {
      await http.close();
    }
  });
});
