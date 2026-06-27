/**
 * Tool registrar.
 *
 * `registerAllTools` is the single place the server wires up MCP tools. Each
 * tool group lives in its own module and is registered through here:
 * discovery (`list_devices`, `discover_devices`), status (`get_device_details`,
 * `get_summary`, `get_state`), power (`set_power`, `set_mode`), color
 * (`set_color`, `set_brightness`, `set_saturation`), effects (`list_effects`,
 * `set_effect`), and movies (`list_movies`, `set_movie`). The admin group plus
 * tool-group filtering and read-only / admin gating (driven by `config.tools`,
 * `config.readonly`, `config.allowAdmin`) arrive in Phase 6.
 */
import type { ServerContext } from '../server.js';
import { registerDiscoveryTools } from './discovery.js';
import { registerStatusTools } from './status.js';
import { registerPowerTools } from './power.js';
import { registerColorTools } from './color.js';
import { registerEffectsTools } from './effects.js';
import { registerMoviesTools } from './movies.js';

/** Register every enabled tool group on the server in `ctx`. */
export function registerAllTools(ctx: ServerContext): void {
  registerDiscoveryTools(ctx);
  registerStatusTools(ctx);
  registerPowerTools(ctx);
  registerColorTools(ctx);
  registerEffectsTools(ctx);
  registerMoviesTools(ctx);
}
