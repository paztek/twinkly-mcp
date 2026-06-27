/**
 * Predefined-effect tools.
 *
 * `list_effects` reports how many built-in effects the device has and which is
 * current; `set_effect` selects one by id and switches into effect mode so it
 * plays right away.
 */
import { z } from 'zod';
import { LEDOperationMode } from '@twinklyjs/twinkly';
import type { ServerContext } from '../server.js';
import { assertOk, effectsShape, formatEffects } from '../twinkly/format.js';
import { deviceArg, guard, jsonResult, optional, textResult } from './shared.js';

/** Register the effects tools on the server. */
export function registerEffectsTools(ctx: ServerContext): void {
  const { server, deviceManager, logger } = ctx;

  server.registerTool(
    'list_effects',
    {
      title: 'List effects',
      description:
        'List the predefined effects available on a Twinkly device (count + ids) and which effect is ' +
        'currently selected. Use set_effect with an effect id to play one.',
      inputSchema: deviceArg,
      outputSchema: effectsShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ device }) =>
      guard(logger, async () => {
        const { effects, current } = await deviceManager.withDevice(device, async (client) => {
          const [effects, current] = await Promise.all([
            client.getLEDEffects(),
            optional(() => client.getCurrentLEDEffect()),
          ]);
          return { effects, current };
        });
        const { name } = deviceManager.resolve(device);
        return jsonResult(formatEffects(name, effects, current));
      }),
  );

  server.registerTool(
    'set_effect',
    {
      title: 'Set effect',
      description:
        'Select a predefined effect by its numeric id and switch the device into effect mode so it plays. ' +
        'Call list_effects first to see how many effects exist (ids start at 0).',
      inputSchema: {
        ...deviceArg,
        effectId: z.number().int().min(0).describe('Effect id to play (0-based).'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, effectId }) =>
      guard(logger, async () => {
        const { name } = deviceManager.resolve(device);
        await deviceManager.withDevice(device, async (client) => {
          assertOk(await client.setCurrentLEDEffect({ effect_id: effectId }), 'Set effect');
          assertOk(
            await client.setLEDOperationMode({ mode: LEDOperationMode.EFFECT }),
            'Switch to effect mode',
          );
        });
        return textResult(`Set ${name} to effect ${effectId}.`);
      }),
  );
}
