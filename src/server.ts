/**
 * MCP server assembly.
 *
 * `createServer` builds the {@link McpServer}, wires the shared
 * {@link ServerContext} (config + device manager + logger), and registers the
 * enabled tools. It does **not** choose or start a transport — that is the
 * bin entry's job (`index.ts`), keeping this module transport-agnostic and
 * unit-testable.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TwinklyMcpConfig } from './config.js';
import type { DeviceManager } from './twinkly/device-manager.js';
import type { Logger } from './logger.js';
import { registerAllTools } from './tools/index.js';

export const SERVER_NAME = 'twinkly-mcp';
export const SERVER_VERSION = '0.0.1';

/** Shared dependencies handed to every tool registrar. */
export interface ServerContext {
  server: McpServer;
  config: TwinklyMcpConfig;
  deviceManager: DeviceManager;
  logger: Logger;
}

export interface CreateServerOptions {
  config: TwinklyMcpConfig;
  deviceManager: DeviceManager;
  logger: Logger;
}

/** Build a fully-configured MCP server with all enabled tools registered. */
export function createServer(options: CreateServerOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Control Twinkly smart lights.\n' +
        '- Start with list_devices to see device names; pass one as the `device` argument on any tool ' +
        '(omit it to use the default device). Use discover_devices if a device is missing.\n' +
        '- Use get_state to read the current mode, brightness, saturation, and color before changing things.\n' +
        '- set_power toggles on/off; set_color also switches to color mode so the color shows immediately; ' +
        'set_effect / set_movie select and start a predefined effect or saved movie.\n' +
        '- Some tools may be absent depending on server configuration: read-only mode hides every ' +
        'state-changing tool, a tool allow-list can hide whole groups, and admin tools (set_name, set_timer) ' +
        'appear only when explicitly enabled.',
    },
  );

  const ctx: ServerContext = {
    server,
    config: options.config,
    deviceManager: options.deviceManager,
    logger: options.logger,
  };

  registerAllTools(ctx);

  return server;
}
