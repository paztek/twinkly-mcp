/**
 * Tool registrar.
 *
 * `registerAllTools` is the single place the server wires up MCP tools. Each
 * tool group lives in its own module and is registered through here. Phase 3
 * only has the discovery/inventory group (`list_devices`); later phases add
 * status, power, color, effects, movies, and admin groups. Tool-group filtering
 * and read-only / admin gating (driven by `config.tools`, `config.readonly`,
 * `config.allowAdmin`) arrive in Phase 6.
 */
import type { ServerContext } from '../server.js';
import { registerDiscoveryTools } from './discovery.js';

/** Register every enabled tool group on the server in `ctx`. */
export function registerAllTools(ctx: ServerContext): void {
  registerDiscoveryTools(ctx);
}
