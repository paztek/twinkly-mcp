import { describe, expect, it, vi } from 'vitest';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

const movies = {
  code: 1000,
  available_frames: 992,
  max_capacity: 992,
  movies: [
    { id: 0, name: 'Sparkle', unique_id: 'm0', descriptor_type: 'rgb_raw', leds_per_frame: 250, frames_number: 60, fps: 10 },
    { id: 1, name: 'Glow', unique_id: 'm1', descriptor_type: 'rgb_raw', leds_per_frame: 250, frames_number: 30, fps: 5 },
  ],
};

describe('list_movies tool', () => {
  it('returns the movie inventory and current movie', async () => {
    const client: FakeClient = {
      getMovies: async () => movies as never,
      getCurrentMovie: async () => ({ code: 1000, id: 1, unique_id: 'm1', name: 'Glow' }) as never,
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'list_movies', arguments: {} });

    expect(result.structuredContent).toEqual({
      device: 'default',
      movies: [
        { id: 0, name: 'Sparkle', uniqueId: 'm0', frames: 60, fps: 10 },
        { id: 1, name: 'Glow', uniqueId: 'm1', frames: 30, fps: 5 },
      ],
      currentMovieId: 1,
    });
    await close();
  });

  it('reports a null current movie when none is set', async () => {
    const client: FakeClient = {
      getMovies: async () => movies as never,
      getCurrentMovie: async () => {
        throw new Error('no movie');
      },
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'list_movies', arguments: {} });

    expect((result.structuredContent as { currentMovieId: unknown }).currentMovieId).toBeNull();
    await close();
  });
});

describe('set_movie tool', () => {
  it('selects a movie and switches to movie mode', async () => {
    const setCurrentMovie = vi.fn(async () => ({ code: 1000 }));
    const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = {
      setCurrentMovie: setCurrentMovie as never,
      setLEDOperationMode: setLEDOperationMode as never,
    };
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_movie', arguments: { id: 1 } });

    expect(setCurrentMovie).toHaveBeenCalledWith({ id: 1 });
    expect(setLEDOperationMode).toHaveBeenCalledWith({ mode: 'movie' });
    await close();
  });
});
