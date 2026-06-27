/**
 * Power & operation-mode tools.
 *
 * `set_power` is the friendly on/off switch: "off" stops the LEDs, "on"
 * resumes movie playback (Twinkly's conventional powered-on state).
 * `set_mode` is the lower-level escape hatch for selecting any operation mode
 * directly (e.g. `demo`, `color`, `playlist`).
 */
import { z } from 'zod';
import { LEDOperationMode } from '@twinklyjs/twinkly';
import type { ServerContext } from '../server.js';
import { assertOk } from '../twinkly/format.js';
import { deviceArg, guard, textResult } from './shared.js';

/** The operation modes a client may request, mirroring `LEDOperationMode`. */
const MODES = ['off', 'color', 'demo', 'movie', 'rt', 'effect', 'playlist'] as const;

/** Register the power / mode tools on the server. */
export function registerPowerTools(ctx: ServerContext): void {
  const { server, deviceManager, logger } = ctx;

  server.registerTool(
    'set_power',
    {
      title: 'Turn lights on or off',
      description:
        'Turn a Twinkly device on or off. "off" stops the LEDs; "on" resumes movie playback (the usual ' +
        'powered-on state). For a specific mode like a static color or the demo loop, use set_mode.',
      inputSchema: {
        ...deviceArg,
        on: z.boolean().describe('true to turn the lights on (movie mode), false to turn them off.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, on }) =>
      guard(logger, async () => {
        const mode = on ? LEDOperationMode.MOVIE : LEDOperationMode.OFF;
        const { name } = deviceManager.resolve(device);
        const res = await deviceManager.withDevice(device, (client) =>
          client.setLEDOperationMode({ mode }),
        );
        assertOk(res, `Turn ${on ? 'on' : 'off'}`);
        return textResult(`Turned ${name} ${on ? 'on (movie mode)' : 'off'}.`);
      }),
  );

  server.registerTool(
    'set_mode',
    {
      title: 'Set operation mode',
      description:
        'Set the LED operation mode directly. Modes: off, color (static color), demo (built-in loop), ' +
        'movie (a saved movie), effect (a predefined effect — pass effectId), rt (realtime), playlist. ' +
        'To pick which movie/effect plays, use set_movie / set_effect.',
      inputSchema: {
        ...deviceArg,
        mode: z.enum(MODES).describe('The operation mode to switch to.'),
        effectId: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Effect id to play, only used when mode is "effect".'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, mode, effectId }) =>
      guard(logger, async () => {
        const { name } = deviceManager.resolve(device);
        const res = await deviceManager.withDevice(device, (client) =>
          client.setLEDOperationMode({
            mode: mode as LEDOperationMode,
            ...(mode === 'effect' && effectId !== undefined ? { effect_id: effectId } : {}),
          }),
        );
        assertOk(res, `Set mode "${mode}"`);
        return textResult(`Set ${name} to ${mode} mode.`);
      }),
  );
}
