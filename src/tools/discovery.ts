/**
 * Discovery / inventory tools.
 *
 * Phase 3 ships `list_devices` — the read-only inventory tool that backs the
 * "connectable server" milestone. `discover_devices` (active UDP scan) lands in
 * Phase 4 alongside the other read tools.
 *
 * Tools never touch HTTP or construct clients: `list_devices` only reads the
 * registry the {@link DeviceManager} already holds.
 */
import { z } from 'zod';
import type { DeviceSource } from '../twinkly/device-manager.js';
import type { ServerContext } from '../server.js';

const DEVICE_SOURCES = ['config', 'discovered'] as const satisfies readonly DeviceSource[];

/** zod shape mirroring {@link import('../twinkly/device-manager.js').DeviceInfo }. */
const deviceInfoShape = {
  name: z.string(),
  ip: z.string(),
  source: z.enum(DEVICE_SOURCES),
  isDefault: z.boolean(),
} as const;

/** Register the discovery/inventory tools on the server. */
export function registerDiscoveryTools(ctx: ServerContext): void {
  const { server, deviceManager } = ctx;

  server.registerTool(
    'list_devices',
    {
      title: 'List Twinkly devices',
      description:
        'List the Twinkly devices this server knows about (from configuration and any prior discovery). ' +
        'Returns each device name, IP, where it came from, and which one is used when a tool omits the `device` argument. ' +
        'Use these names as the `device` argument on other tools.',
      // No input: a zero-argument tool. Omitting inputSchema lets clients call
      // it with no `arguments` payload instead of being forced to send `{}`.
      outputSchema: { devices: z.array(z.object(deviceInfoShape)) },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    () => {
      const devices = deviceManager.listDevices();
      return {
        content: [{ type: 'text', text: JSON.stringify({ devices }, null, 2) }],
        structuredContent: { devices },
      };
    },
  );
}
