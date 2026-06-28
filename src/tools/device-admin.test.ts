import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../config.js';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

/** Admin tools only exist when allowAdmin is on. */
function adminConfig(extra: Record<string, string> = {}) {
  return parseConfig({ env: { TWINKLY_IP: '10.0.0.9', TWINKLY_ALLOW_ADMIN: 'true', ...extra } });
}

describe('set_name tool', () => {
  it('renames the device', async () => {
    const setDeviceName = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { setDeviceName: setDeviceName as never };
    const { client: mcp, close } = await connectHarness({ config: adminConfig(), client });

    const result = await mcp.callTool({ name: 'set_name', arguments: { name: 'Porch' } });

    expect(setDeviceName).toHaveBeenCalledWith({ name: 'Porch' });
    expect(result.isError).toBeFalsy();
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('Porch');
    await close();
  });

  it('rejects a name longer than 32 characters at the schema boundary', async () => {
    const client: FakeClient = { setDeviceName: (async () => ({ code: 1000 })) as never };
    const { client: mcp, close } = await connectHarness({ config: adminConfig(), client });

    const result = await mcp.callTool({
      name: 'set_name',
      arguments: { name: 'x'.repeat(33) },
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/validation/i);
    await close();
  });
});

describe('set_timer tool', () => {
  it('preserves the device clock and applies the on/off times', async () => {
    const getTimer = vi.fn(async () => ({ code: 1000, time_now: 4200, time_on: -1, time_off: -1 }));
    const setTimer = vi.fn(async () => ({ code: 1000 }));
    const client: FakeClient = { getTimer: getTimer as never, setTimer: setTimer as never };
    const { client: mcp, close } = await connectHarness({ config: adminConfig(), client });

    await mcp.callTool({ name: 'set_timer', arguments: { timeOn: 64800, timeOff: 21600 } });

    expect(setTimer).toHaveBeenCalledWith({ time_now: 4200, time_on: 64800, time_off: 21600 });
    await close();
  });
});
