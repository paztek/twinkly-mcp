#!/usr/bin/env node
/**
 * twinkly-mcp — bin entry point.
 *
 * Flow: load config (env + CLI + optional file) → build the device manager →
 * assemble the MCP server → start the selected transport. Only stdio is wired
 * up in Phase 3; Streamable HTTP arrives in Phase 7.
 *
 * Logging goes to **stderr only** — on stdio, stdout carries the MCP JSON-RPC
 * stream and must not be polluted.
 */
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { DeviceManager } from './twinkly/device-manager.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig({ readFile: (path) => readFileSync(path, 'utf8') });
  const logger = createLogger(config.logLevel);

  if (config.transport !== 'stdio') {
    throw new ConfigError(
      `Transport "${config.transport}" is not implemented yet (only "stdio" is available). ` +
        'HTTP transport is planned for a later phase.',
    );
  }

  const deviceManager = new DeviceManager(config);
  const server = createServer({ config, deviceManager, logger });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    `${SERVER_NAME} v${SERVER_VERSION} ready on stdio`,
    `(${config.devices.length} configured device(s))`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // stderr is safe; stdout is reserved for the MCP stdio stream.
  process.stderr.write(`[twinkly-mcp] fatal: ${message}\n`);
  process.exitCode = 1;
});
