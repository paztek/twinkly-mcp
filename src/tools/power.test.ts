import { describe, expect, it, vi } from 'vitest';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

describe('set_power tool', () => {
  it('turns on by switching to movie mode', async () => {
    const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { setLEDOperationMode: setLEDOperationMode as never };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'set_power', arguments: { on: true } });

    expect(setLEDOperationMode).toHaveBeenCalledWith({ mode: 'movie' });
    expect(result.isError).toBeFalsy();
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('on');
    await close();
  });

  it('turns off by switching to off mode', async () => {
    const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { setLEDOperationMode: setLEDOperationMode as never };
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_power', arguments: { on: false } });

    expect(setLEDOperationMode).toHaveBeenCalledWith({ mode: 'off' });
    await close();
  });

  it('surfaces a non-OK device code as an error', async () => {
    const client: FakeClient = { setLEDOperationMode: (async () => ({ code: 1104 })) as never };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'set_power', arguments: { on: true } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('1104');
    await close();
  });
});

describe('set_mode tool', () => {
  it('passes effect_id only for effect mode', async () => {
    const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { setLEDOperationMode: setLEDOperationMode as never };
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_mode', arguments: { mode: 'effect', effectId: 3 } });
    expect(setLEDOperationMode).toHaveBeenLastCalledWith({ mode: 'effect', effect_id: 3 });

    await mcp.callTool({ name: 'set_mode', arguments: { mode: 'demo', effectId: 3 } });
    expect(setLEDOperationMode).toHaveBeenLastCalledWith({ mode: 'demo' });

    await close();
  });

  it('rejects an unknown mode at the schema boundary', async () => {
    const client: FakeClient = { setLEDOperationMode: (async () => ({ code: 1000 })) as never };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'set_mode', arguments: { mode: 'rainbow' } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/validation/i);
    await close();
  });
});
