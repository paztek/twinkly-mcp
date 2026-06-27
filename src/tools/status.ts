/**
 * Read-only status tools.
 *
 * `get_device_details` and `get_summary` are thin normalized passthroughs of a
 * single device endpoint; `get_state` is a composite that fans out to the
 * mode / brightness / saturation / color endpoints in parallel and folds them
 * into one snapshot — the everyday "what are the lights doing?" tool.
 */
import type { ServerContext } from '../server.js';
import {
  deviceDetailsShape,
  formatDeviceDetails,
  formatState,
  formatSummary,
  stateShape,
  summaryShape,
} from '../twinkly/format.js';
import { deviceArg, guard, jsonResult, optional } from './shared.js';

/** Register the read-only status tools on the server. */
export function registerStatusTools(ctx: ServerContext): void {
  const { server, deviceManager, logger } = ctx;

  server.registerTool(
    'get_device_details',
    {
      title: 'Get device details',
      description:
        'Get static hardware/firmware details for a Twinkly device: product, model, LED count and profile, ' +
        'MAC, UUID, firmware family, and uptime. Use get_state for the current mode/color/brightness.',
      inputSchema: deviceArg,
      outputSchema: deviceDetailsShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ device }) =>
      guard(logger, async () => {
        const details = await deviceManager.withDevice(device, (client) =>
          client.getDeviceDetails(),
        );
        const { name } = deviceManager.resolve(device);
        return jsonResult(formatDeviceDetails(name, details));
      }),
  );

  server.registerTool(
    'get_summary',
    {
      title: 'Get device summary',
      description:
        'Get a quick overview of a Twinkly device: current mode, color, on/off timer, music state, and ' +
        'active filters (brightness/saturation). Available since firmware 2.5.6.',
      inputSchema: deviceArg,
      outputSchema: summaryShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ device }) =>
      guard(logger, async () => {
        const summary = await deviceManager.withDevice(device, (client) => client.getSummary());
        const { name } = deviceManager.resolve(device);
        return jsonResult(formatSummary(name, summary));
      }),
  );

  server.registerTool(
    'get_state',
    {
      title: 'Get light state',
      description:
        'Get the current state of a Twinkly device in one call: operation mode, brightness, saturation, and ' +
        'color. This is the go-to read tool before changing anything.',
      inputSchema: deviceArg,
      outputSchema: stateShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ device }) =>
      guard(logger, async () => {
        const state = await deviceManager.withDevice(device, async (client) => {
          const [mode, brightness, saturation, color] = await Promise.all([
            client.getLEDOperationMode(),
            client.getLEDBrightness(),
            client.getLEDSaturation(),
            // Color endpoint only exists since firmware 2.7.1 — best-effort.
            optional(() => client.getLEDColor()),
          ]);
          return { mode, brightness, saturation, color };
        });
        const { name } = deviceManager.resolve(device);
        return jsonResult(formatState(name, state));
      }),
  );
}
