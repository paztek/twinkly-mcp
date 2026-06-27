import { describe, expect, it, vi } from 'vitest';
import type { Device } from '@twinklyjs/twinkly';
import { parseConfig } from '../config.js';
import { connectHarness } from '../test-utils.js';

describe('discover_devices tool', () => {
  it('scans the network and folds new devices into the inventory', async () => {
    const found: Device[] = [{ ip: '10.0.0.50', port: 5555, deviceId: 'TW-AABBCC' }];
    const discover = vi.fn(async () => found);

    const { client, close } = await connectHarness({
      config: parseConfig({ env: { TWINKLY_IP: '10.0.0.9' } }),
      discover,
    });

    const result = await client.callTool({ name: 'discover_devices' });

    expect(discover).toHaveBeenCalledTimes(1);
    expect(result.structuredContent).toEqual({
      devices: [
        { name: 'default', ip: '10.0.0.9', source: 'config', isDefault: true },
        { name: 'TW-AABBCC', ip: '10.0.0.50', source: 'discovered', isDefault: false },
      ],
    });
    await close();
  });

  it('reports a discovery failure as an error result', async () => {
    const discover = vi.fn(async () => {
      throw new Error('no network');
    });
    const { client, close } = await connectHarness({ discover });

    const result = await client.callTool({ name: 'discover_devices' });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('discovery_failed');
    await close();
  });
});
