/**
 * Device administration tools — gated behind the `admin` group, which itself
 * is hidden unless `allowAdmin` is on (see {@link groupEnabled}). These change
 * device configuration rather than just the lights, so they stay off by default.
 *
 * Scope is deliberately conservative: rename and on/off timer only. The genuinely
 * risky operations the underlying library exposes (firmware, WiFi/network, MQTT,
 * mic, LED reset) are intentionally **not** surfaced here.
 */
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { assertOk } from '../twinkly/format.js';
import { deviceArg, groupEnabled, guard, textResult, writesEnabled } from './shared.js';

/** Seconds in a day — the exclusive upper bound for a "seconds after midnight" time. */
const SECONDS_PER_DAY = 86_400;

/** Register the (gated) device-admin tools on the server. */
export function registerDeviceAdminTools(ctx: ServerContext): void {
  const { server, deviceManager, logger, config } = ctx;
  // groupEnabled enforces the admin gate; every tool here is also a write.
  if (!groupEnabled(config, 'admin') || !writesEnabled(config)) return;

  server.registerTool(
    'set_name',
    {
      title: 'Rename device',
      description: 'Set the display name of a Twinkly device (at most 32 characters). Admin-gated.',
      inputSchema: {
        ...deviceArg,
        name: z.string().min(1).max(32).describe('New device name, 1–32 characters.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, name }) =>
      guard(logger, async () => {
        const { name: deviceName } = deviceManager.resolve(device);
        const res = await deviceManager.withDevice(device, (client) =>
          client.setDeviceName({ name }),
        );
        assertOk(res, 'Set device name');
        return textResult(`Renamed ${deviceName} to "${name}".`);
      }),
  );

  server.registerTool(
    'set_timer',
    {
      title: 'Set on/off timer',
      description:
        'Schedule daily on/off times for a Twinkly device. Times are seconds after midnight in the ' +
        "device's local timezone (0–86399), or -1 to disable. The device's current clock is preserved. " +
        'Admin-gated.',
      inputSchema: {
        ...deviceArg,
        timeOn: z
          .number()
          .int()
          .min(-1)
          .max(SECONDS_PER_DAY - 1)
          .describe('Seconds after midnight to turn on, or -1 to disable.'),
        timeOff: z
          .number()
          .int()
          .min(-1)
          .max(SECONDS_PER_DAY - 1)
          .describe('Seconds after midnight to turn off, or -1 to disable.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, timeOn, timeOff }) =>
      guard(logger, async () => {
        const { name } = deviceManager.resolve(device);
        await deviceManager.withDevice(device, async (client) => {
          // Reuse the device's own clock so we don't reset its time-of-day.
          const current = await client.getTimer();
          assertOk(
            await client.setTimer({
              time_now: current.time_now,
              time_on: timeOn,
              time_off: timeOff,
            }),
            'Set timer',
          );
        });
        return textResult(`Set ${name} timer (on=${timeOn}, off=${timeOff}).`);
      }),
  );
}
