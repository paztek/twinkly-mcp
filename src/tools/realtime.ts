/**
 * Realtime frame tool (Phase 7) — gated behind the `admin` group.
 *
 * `send_frame` pushes a single frame of per-LED RGB values over UDP via
 * twinklyjs's standalone `sendFrame(ip, token, nodes)`, after switching the
 * device into realtime (`rt`) mode so the frame is displayed. It is an advanced,
 * Node-only capability (UDP) and therefore off by default — it shares the admin
 * gate with the other configuration-changing tools.
 */
import { z } from 'zod';
import { LEDOperationMode, sendFrame } from '@twinklyjs/twinkly';
import type { ServerContext } from '../server.js';
import { TwinklyError } from '../errors.js';
import { assertOk } from '../twinkly/format.js';
import { deviceArg, groupEnabled, guard, textResult, writesEnabled } from './shared.js';

/** Upper bound on frame size — a guard against absurd payloads, not a device limit. */
const MAX_NODES = 4096;

const nodeSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
});

/** Register the (gated) realtime tools on the server. */
export function registerRealtimeTools(ctx: ServerContext): void {
  const { server, deviceManager, logger, config } = ctx;
  // groupEnabled enforces the admin gate; send_frame is also a write.
  if (!groupEnabled(config, 'admin') || !writesEnabled(config)) return;

  server.registerTool(
    'send_frame',
    {
      title: 'Send a realtime frame',
      description:
        'Push one frame of per-LED RGB values to a Twinkly device over UDP, switching it into realtime ' +
        'mode first so the frame shows. `nodes` is an ordered array of {r,g,b} (0–255), one per LED. ' +
        'Advanced / admin-gated.',
      inputSchema: {
        ...deviceArg,
        nodes: z
          .array(nodeSchema)
          .min(1)
          .max(MAX_NODES)
          .describe('Ordered per-LED colors as {r,g,b} (0–255), one entry per LED.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, nodes }) =>
      guard(logger, async () => {
        const { name, ip } = deviceManager.resolve(device);
        await deviceManager.withDevice(device, async (client) => {
          // Switching mode is an authenticated call, so it also warms the token
          // the standalone UDP sender needs.
          assertOk(
            await client.setLEDOperationMode({ mode: LEDOperationMode.RT }),
            'Switch to realtime mode',
          );
          const token = client.getToken();
          if (!token) {
            throw new TwinklyError(
              'device_request_failed',
              'Could not obtain an auth token for the realtime frame',
              { device: name },
            );
          }
          await sendFrame(ip, token, nodes);
        });
        return textResult(`Sent a ${nodes.length}-pixel frame to ${name} (realtime mode).`);
      }),
  );
}
