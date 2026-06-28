/**
 * Color, brightness & saturation tools.
 *
 * `set_color` accepts either RGB or HSV and, after storing the color, switches
 * the device into `color` mode so the change is actually visible — "make the
 * lights red" should turn them red, not just preset a value. `set_brightness`
 * and `set_saturation` set absolute 0–100 levels.
 */
import { z } from 'zod';
import { LEDOperationMode } from '@twinklyjs/twinkly';
import type { SetLEDColorRequest } from '@twinklyjs/twinkly';
import type { ServerContext } from '../server.js';
import { assertOk } from '../twinkly/format.js';
import { deviceArg, groupEnabled, guard, invalidInput, textResult, writesEnabled } from './shared.js';

const rgbSchema = z
  .object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
  })
  .describe('RGB color, each channel 0–255.');

const hsvSchema = z
  .object({
    h: z.number().int().min(0).max(359),
    s: z.number().int().min(0).max(255),
    v: z.number().int().min(0).max(255),
  })
  .describe('HSV color: hue 0–359, saturation 0–255, value 0–255.');

/** Register the color / brightness / saturation tools on the server. */
export function registerColorTools(ctx: ServerContext): void {
  const { server, deviceManager, logger, config } = ctx;
  // Every tool here mutates the device, so the whole group is dropped read-only.
  if (!groupEnabled(config, 'color') || !writesEnabled(config)) return;

  server.registerTool(
    'set_color',
    {
      title: 'Set color',
      description:
        'Set a single static color and switch the device into color mode so it shows immediately. ' +
        'Provide exactly one of rgb ({r,g,b}, 0–255) or hsv ({h,s,v}; hue 0–359, sat/val 0–255).',
      inputSchema: {
        ...deviceArg,
        rgb: rgbSchema.optional(),
        hsv: hsvSchema.optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, rgb, hsv }) =>
      guard(logger, async () => {
        if ((rgb && hsv) || (!rgb && !hsv)) {
          return invalidInput('provide exactly one of rgb or hsv.');
        }
        const color: SetLEDColorRequest = rgb
          ? { red: rgb.r, green: rgb.g, blue: rgb.b }
          : { hue: hsv!.h, saturation: hsv!.s, value: hsv!.v };

        const { name } = deviceManager.resolve(device);
        await deviceManager.withDevice(device, async (client) => {
          assertOk(await client.setLEDColor(color), 'Set color');
          assertOk(
            await client.setLEDOperationMode({ mode: LEDOperationMode.COLOR }),
            'Switch to color mode',
          );
        });
        const label = rgb
          ? `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`
          : `HSV(${hsv!.h}, ${hsv!.s}, ${hsv!.v})`;
        return textResult(`Set ${name} to ${label} (color mode).`);
      }),
  );

  server.registerTool(
    'set_brightness',
    {
      title: 'Set brightness',
      description: 'Set the overall brightness of a Twinkly device to an absolute level from 0 to 100.',
      inputSchema: {
        ...deviceArg,
        value: z.number().int().min(0).max(100).describe('Brightness level, 0–100.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, value }) =>
      guard(logger, async () => {
        const { name } = deviceManager.resolve(device);
        const res = await deviceManager.withDevice(device, (client) =>
          client.setLEDBrightness({ mode: 'enabled', type: 'A', value }),
        );
        assertOk(res, 'Set brightness');
        return textResult(`Set ${name} brightness to ${value}.`);
      }),
  );

  server.registerTool(
    'set_saturation',
    {
      title: 'Set saturation',
      description:
        'Set the color saturation of a Twinkly device to an absolute level from 0 (black-and-white) to ' +
        '100 (full color).',
      inputSchema: {
        ...deviceArg,
        value: z.number().int().min(0).max(100).describe('Saturation level, 0–100.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, value }) =>
      guard(logger, async () => {
        const { name } = deviceManager.resolve(device);
        const res = await deviceManager.withDevice(device, (client) =>
          client.setLEDSaturation({ mode: 'enabled', type: 'A', value }),
        );
        assertOk(res, 'Set saturation');
        return textResult(`Set ${name} saturation to ${value}.`);
      }),
  );
}
