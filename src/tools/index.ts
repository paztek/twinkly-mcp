/**
 * Tool registrar.
 *
 * `registerAllTools` is the single place the server wires up MCP tools. Each
 * tool group lives in its own module and is registered through here. So far:
 * the discovery/inventory group (`list_devices`, `discover_devices`) and the
 * read-only status group (`get_device_details`, `get_summary`, `get_state`);
 * later phases add power, color, effects, movies, and admin groups. Tool-group
 * filtering and read-only / admin gating (driven by `config.tools`,
 * `config.readonly`, `config.allowAdmin`) arrive in Phase 6.
 */
import type { ServerContext } from '../server.js';
import { registerDiscoveryTools } from './discovery.js';
import { registerStatusTools } from './status.js';

/** Register every enabled tool group on the server in `ctx`. */
export function registerAllTools(ctx: ServerContext): void {
  registerDiscoveryTools(ctx);
  registerStatusTools(ctx);
}
