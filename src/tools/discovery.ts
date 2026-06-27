/**
 * Discovery / inventory tools.
 *
 * `list_devices` is the read-only inventory tool: it only reads the registry
 * the {@link DeviceManager} already holds. `discover_devices` triggers an
 * active UDP scan of the LAN and folds any newly found devices into that
 * registry. Neither tool constructs a client or touches HTTP directly.
 */
import { z } from 'zod';
import type { DeviceSource } from '../twinkly/device-manager.js';
import type { ServerContext } from '../server.js';
import { guard, jsonResult } from './shared.js';

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
  const { server, deviceManager, logger } = ctx;

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

  server.registerTool(
    'discover_devices',
    {
      title: 'Discover Twinkly devices',
      description:
        'Actively scan the local network (UDP) for Twinkly devices and add any newly found ones to the ' +
        'registry. Returns the full device inventory afterwards. Use this when a device is not yet listed ' +
        'by list_devices.',
      // Zero-argument: omit inputSchema so clients need not send an `arguments` payload.
      outputSchema: { devices: z.array(z.object(deviceInfoShape)) },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    () =>
      guard(logger, async () => {
        const devices = await deviceManager.discoverDevices();
        return jsonResult({ devices });
      }),
  );
}
