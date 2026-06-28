/**
 * Movie tools.
 *
 * `list_movies` reports the movies uploaded to the device and which one is
 * current; `set_movie` selects one by id and switches into movie mode so it
 * plays. (Playlists are reachable via set_mode "playlist"; dedicated playlist
 * authoring is out of scope for the everyday control surface.)
 */
import { z } from 'zod';
import { LEDOperationMode } from '@twinklyjs/twinkly';
import type { ServerContext } from '../server.js';
import { assertOk, formatMovies, moviesShape } from '../twinkly/format.js';
import {
  deviceArg,
  groupEnabled,
  guard,
  jsonResult,
  optional,
  textResult,
  writesEnabled,
} from './shared.js';

/** Register the movie tools on the server. */
export function registerMoviesTools(ctx: ServerContext): void {
  const { server, deviceManager, logger, config } = ctx;
  if (!groupEnabled(config, 'movies')) return;

  server.registerTool(
    'list_movies',
    {
      title: 'List movies',
      description:
        'List the movies (saved animations) uploaded to a Twinkly device — id, name, frames, fps — and ' +
        'which movie is current. Use set_movie with an id to play one.',
      inputSchema: deviceArg,
      outputSchema: moviesShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ device }) =>
      guard(logger, async () => {
        const { movies, current } = await deviceManager.withDevice(device, async (client) => {
          const [movies, current] = await Promise.all([
            client.getMovies(),
            optional(() => client.getCurrentMovie()),
          ]);
          return { movies, current };
        });
        const { name } = deviceManager.resolve(device);
        return jsonResult(formatMovies(name, movies, current));
      }),
  );

  if (!writesEnabled(config)) return;

  server.registerTool(
    'set_movie',
    {
      title: 'Set movie',
      description:
        'Select a saved movie by its numeric id and switch the device into movie mode so it plays. ' +
        'Call list_movies first to see the available ids.',
      inputSchema: {
        ...deviceArg,
        id: z.number().int().min(0).describe('Movie id to play (see list_movies).'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ device, id }) =>
      guard(logger, async () => {
        const { name } = deviceManager.resolve(device);
        await deviceManager.withDevice(device, async (client) => {
          assertOk(await client.setCurrentMovie({ id }), 'Set movie');
          assertOk(
            await client.setLEDOperationMode({ mode: LEDOperationMode.MOVIE }),
            'Switch to movie mode',
          );
        });
        return textResult(`Set ${name} to movie ${id}.`);
      }),
  );
}
