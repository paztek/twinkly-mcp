#!/usr/bin/env node
/**
 * twinkly-mcp — bin entry point.
 *
 * Flow: load config (env + CLI + optional file) → build the device manager →
 * assemble the MCP server → start the selected transport (stdio or Streamable
 * HTTP).
 *
 * Logging goes to **stderr only** — on stdio, stdout carries the MCP JSON-RPC
 * stream and must not be polluted.
 */
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { DeviceManager } from './twinkly/device-manager.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { startHttpTransport } from './transport/http.js';

async function main(): Promise<void> {
  const config = loadConfig({ readFile: (path) => readFileSync(path, 'utf8') });
  const logger = createLogger(config.logLevel);
  const deviceManager = new DeviceManager(config);
  const deviceCount = `(${config.devices.length} configured device(s))`;

  if (config.transport === 'http') {
    // A fresh server per session keeps concurrent HTTP clients isolated; the
    // device manager (registry + cached auth tokens) is shared across them.
    const http = await startHttpTransport({
      port: config.port,
      logger,
      createMcpServer: () => createServer({ config, deviceManager, logger }),
    });
    logger.info(`${SERVER_NAME} v${SERVER_VERSION} ready on ${http.url}`, deviceCount);
    return;
  }

  const server = createServer({ config, deviceManager, logger });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`${SERVER_NAME} v${SERVER_VERSION} ready on stdio`, deviceCount);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // stderr is safe; stdout is reserved for the MCP stdio stream.
  process.stderr.write(`[twinkly-mcp] fatal: ${message}\n`);
  process.exitCode = 1;
});
