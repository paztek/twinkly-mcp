import { describe, expect, it, vi } from 'vitest';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

function colorClient() {
  const setLEDColor = vi.fn(async () => ({ code: 1000 }));
  const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
  const client: FakeClient = {
    setLEDColor: setLEDColor as never,
    setLEDOperationMode: setLEDOperationMode as never,
  };
  return { client, setLEDColor, setLEDOperationMode };
}

describe('set_color tool', () => {
  it('sets an RGB color and switches to color mode', async () => {
    const { client, setLEDColor, setLEDOperationMode } = colorClient();
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({
      name: 'set_color',
      arguments: { rgb: { r: 255, g: 0, b: 0 } },
    });

    expect(setLEDColor).toHaveBeenCalledWith({ red: 255, green: 0, blue: 0 });
    expect(setLEDOperationMode).toHaveBeenCalledWith({ mode: 'color' });
    expect(result.isError).toBeFalsy();
    await close();
  });

  it('sets an HSV color', async () => {
    const { client, setLEDColor } = colorClient();
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_color', arguments: { hsv: { h: 120, s: 255, v: 200 } } });

    expect(setLEDColor).toHaveBeenCalledWith({ hue: 120, saturation: 255, value: 200 });
    await close();
  });

  it('rejects when neither rgb nor hsv is given', async () => {
    const { client } = colorClient();
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'set_color', arguments: {} });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('exactly one');
    await close();
  });

  it('rejects when both rgb and hsv are given', async () => {
    const { client } = colorClient();
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({
      name: 'set_color',
      arguments: { rgb: { r: 1, g: 2, b: 3 }, hsv: { h: 1, s: 2, v: 3 } },
    });

    expect(result.isError).toBe(true);
    await close();
  });

  it('rejects an out-of-range channel at the schema boundary', async () => {
    const { client } = colorClient();
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'set_color', arguments: { rgb: { r: 300, g: 0, b: 0 } } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/validation/i);
    await close();
  });
});

describe('set_brightness tool', () => {
  it('sets an absolute brightness level', async () => {
    const setLEDBrightness = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { setLEDBrightness: setLEDBrightness as never };
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_brightness', arguments: { value: 40 } });

    expect(setLEDBrightness).toHaveBeenCalledWith({ mode: 'enabled', type: 'A', value: 40 });
    await close();
  });

  it('rejects a value above 100', async () => {
    const client: FakeClient = { setLEDBrightness: (async () => ({ code: 1000 })) as never };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'set_brightness', arguments: { value: 150 } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/validation/i);
    await close();
  });
});

describe('set_saturation tool', () => {
  it('sets an absolute saturation level', async () => {
    const setLEDSaturation = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { setLEDSaturation: setLEDSaturation as never };
    const { client: mcp, close } = await connectHarness({ client });

    await mcp.callTool({ name: 'set_saturation', arguments: { value: 0 } });

    expect(setLEDSaturation).toHaveBeenCalledWith({ mode: 'enabled', type: 'A', value: 0 });
    await close();
  });
});
