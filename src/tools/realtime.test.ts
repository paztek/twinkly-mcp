import { describe, expect, it, vi } from 'vitest';

// Override only the standalone UDP sender; everything else (TwinklyClient,
// discover, FetchError, LEDOperationMode) stays real so the rest of the graph
// is unaffected.
vi.mock('@twinklyjs/twinkly', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@twinklyjs/twinkly')>();
  return { ...actual, sendFrame: vi.fn(async () => {}) };
});

import { sendFrame } from '@twinklyjs/twinkly';
import { parseConfig } from '../config.js';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

const adminConfig = parseConfig({ env: { TWINKLY_IP: '10.0.0.9', TWINKLY_ALLOW_ADMIN: 'true' } });

describe('send_frame tool', () => {
  it('switches to realtime mode and sends the frame over UDP with the device token', async () => {
    const setLEDOperationMode = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = {
      setLEDOperationMode: setLEDOperationMode as never,
      getToken: () => 'tok-123',
    };
    const { client: mcp, close } = await connectHarness({ config: adminConfig, client });

    const nodes = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
    ];
    const result = await mcp.callTool({ name: 'send_frame', arguments: { nodes } });

    expect(setLEDOperationMode).toHaveBeenCalledWith({ mode: 'rt' });
    expect(sendFrame).toHaveBeenCalledWith('10.0.0.9', 'tok-123', nodes);
    expect(result.isError).toBeFalsy();
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('2-pixel');
    await close();
  });

  it('errors when no auth token can be obtained', async () => {
    const client: FakeClient = {
      setLEDOperationMode: (async () => ({ code: 1000 })) as never,
      getToken: () => undefined,
    };
    const { client: mcp, close } = await connectHarness({ config: adminConfig, client });

    const result = await mcp.callTool({ name: 'send_frame', arguments: { nodes: [{ r: 1, g: 2, b: 3 }] } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('token');
    await close();
  });

  it('rejects an empty frame at the schema boundary', async () => {
    const client: FakeClient = { setLEDOperationMode: (async () => ({ code: 1000 })) as never };
    const { client: mcp, close } = await connectHarness({ config: adminConfig, client });

    const result = await mcp.callTool({ name: 'send_frame', arguments: { nodes: [] } });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/validation/i);
    await close();
  });
});
