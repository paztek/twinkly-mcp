import { describe, expect, it, vi } from 'vitest';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

describe('list_effects tool', () => {
  it('returns the effect inventory and current effect', async () => {
    const client: FakeClient = {
      getLEDEffects: async () => ({ code: 1000, effects_number: 3, unique_ids: ['a', 'b', 'c'] }) as never,
      getCurrentLEDEffect: async () => ({ code: 1000, unique_id: 'b', effect_id: 1 }) as never,
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'list_effects', arguments: {} });

    expect(result.structuredContent).toEqual({
      device: 'default',
      count: 3,
      effectIds: ['a', 'b', 'c'],
      currentEffectId: 1,
    });
    await close();
  });

  it('tolerates a device that cannot report the current effect', async () => {
    const client: FakeClient = {
      getLEDEffects: async () => ({ code: 1000, effects_number: 1, unique_ids: ['a'] }) as never,
      getCurrentLEDEffect: async () => {
        throw new Error('unsupported');
      },
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'list_effects', arguments: {} });

    expect((result.structuredContent as { currentEffectId: unknown }).currentEffectId).toBeNull();
    await close();
  });
});

describe('set_effect tool', () => {
  it('selects an effect and switches to effect mode', async () => {
    const setCurrentLEDEffect = vi.fn(async () => ({ code: 1000 }));
    const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = {
      setCurrentLEDEffect: setCurrentLEDEffect as never,
      setLEDOperationMode: setLEDOperationMode as never,
    };
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_effect', arguments: { effectId: 2 } });

    expect(setCurrentLEDEffect).toHaveBeenCalledWith({ effect_id: 2 });
    expect(setLEDOperationMode).toHaveBeenCalledWith({ mode: 'effect' });
    await close();
  });
});
