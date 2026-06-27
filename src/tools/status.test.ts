import { describe, expect, it } from 'vitest';
import { FetchError } from '@twinklyjs/twinkly';
import type { FakeClient } from '../test-utils.js';
import { connectHarness } from '../test-utils.js';

const details = {
  code: 1000,
  product_name: 'Twinkly',
  product_code: 'TWS250STP',
  hardware_version: '6',
  fw_family: 'G',
  device_name: 'Tree',
  number_of_led: 250,
  led_profile: 'RGB',
  frame_rate: 25,
  mac: 'aa:bb:cc:dd:ee:ff',
  uuid: 'uuid-1',
  uptime: '3600',
  movie_capacity: 992,
};

describe('get_device_details tool', () => {
  it('returns the normalized device details', async () => {
    const client: FakeClient = { getDeviceDetails: async () => details as never };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'get_device_details', arguments: {} });

    expect(result.structuredContent).toMatchObject({
      device: 'default',
      name: 'Tree',
      model: 'TWS250STP',
      ledCount: 250,
      uptimeSeconds: 3600,
    });
    await close();
  });

  it('surfaces a device request failure as an error result', async () => {
    const client: FakeClient = {
      getDeviceDetails: async () => {
        throw new FetchError('boom', { status: 401 } as Response);
      },
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'get_device_details', arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('device_request_failed');
    expect(text).toContain('HTTP 401');
    await close();
  });
});

describe('get_summary tool', () => {
  it('returns the normalized summary', async () => {
    const summary = {
      code: 1000,
      led_mode: { mode: 'movie', detect_mode: 0, shop_mode: 0 },
      timer: { time_now: 0, time_on: -1, time_off: -1, tz: 'UTC' },
      music: { enabled: 0, active: 0, mode: 'off', auto_mode: 'off', current_driverset: 0, mood_index: 0 },
      filters: [],
      group: { mode: '', compat_mode: 0 },
      layout: { uuid: 'u' },
      color: { hue: 1, saturation: 2, value: 3, red: 4, green: 5, blue: 6 },
    };
    const client: FakeClient = { getSummary: async () => summary as never };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'get_summary', arguments: {} });

    expect(result.structuredContent).toMatchObject({
      device: 'default',
      mode: 'movie',
      color: { hue: 1, blue: 6 },
      music: { enabled: false },
    });
    await close();
  });
});

describe('get_state tool', () => {
  it('folds mode, brightness, saturation, and color into one snapshot', async () => {
    const client: FakeClient = {
      getLEDOperationMode: async () => ({ code: 1000, mode: 'color', shop_mode: 0 }) as never,
      getLEDBrightness: async () => ({ code: 1000, mode: 'enabled', value: 60 }) as never,
      getLEDSaturation: async () => ({ code: 1000, mode: 'enabled', value: 100 }) as never,
      getLEDColor: async () =>
        ({ code: 1000, hue: 0, saturation: 0, value: 255, red: 255, green: 0, blue: 0 }) as never,
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'get_state', arguments: {} });

    expect(result.structuredContent).toEqual({
      device: 'default',
      mode: 'color',
      brightness: { mode: 'enabled', value: 60 },
      saturation: { mode: 'enabled', value: 100 },
      color: { hue: 0, saturation: 0, value: 255, red: 255, green: 0, blue: 0 },
    });
    await close();
  });

  it('degrades gracefully when the color endpoint is unsupported', async () => {
    const client: FakeClient = {
      getLEDOperationMode: async () => ({ code: 1000, mode: 'off', shop_mode: 0 }) as never,
      getLEDBrightness: async () => ({ code: 1000, mode: 'disabled', value: 0 }) as never,
      getLEDSaturation: async () => ({ code: 1000, mode: 'enabled', value: 100 }) as never,
      getLEDColor: async () => {
        throw new FetchError('not found', { status: 404 } as Response);
      },
    };
    const { client: mcp, close } = await connectHarness({ client });

    const result = await mcp.callTool({ name: 'get_state', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { color: unknown }).color).toBeNull();
    await close();
  });
});
