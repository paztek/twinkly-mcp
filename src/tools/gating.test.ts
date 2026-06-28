import { describe, expect, it } from 'vitest';
import { parseConfig } from '../config.js';
import { connectHarness } from '../test-utils.js';

/** Connect with the given env and return the sorted list of exposed tool names. */
async function exposedTools(env: Record<string, string>): Promise<string[]> {
  const { client, close } = await connectHarness({
    config: parseConfig({ env: { TWINKLY_IP: '10.0.0.9', ...env } }),
  });
  const { tools } = await client.listTools();
  await close();
  return tools.map((t) => t.name).sort();
}

const ALL_DEFAULT = [
  'discover_devices',
  'get_device_details',
  'get_state',
  'get_summary',
  'list_devices',
  'list_effects',
  'list_movies',
  'set_brightness',
  'set_color',
  'set_effect',
  'set_mode',
  'set_movie',
  'set_power',
  'set_saturation',
].sort();

const READ_ONLY = [
  'discover_devices',
  'get_device_details',
  'get_state',
  'get_summary',
  'list_devices',
  'list_effects',
  'list_movies',
].sort();

describe('tool gating', () => {
  it('exposes the full everyday surface by default (admin hidden)', async () => {
    expect(await exposedTools({})).toEqual(ALL_DEFAULT);
  });

  it('drops every device-mutating tool in read-only mode', async () => {
    expect(await exposedTools({ TWINKLY_READONLY: 'true' })).toEqual(READ_ONLY);
  });

  it('keeps list_effects / list_movies but drops their setters in read-only mode', async () => {
    const tools = await exposedTools({ TWINKLY_READONLY: 'true' });
    expect(tools).toContain('list_effects');
    expect(tools).toContain('list_movies');
    expect(tools).not.toContain('set_effect');
    expect(tools).not.toContain('set_movie');
  });

  it('restricts to the configured tool groups', async () => {
    expect(await exposedTools({ TWINKLY_TOOLS: 'status' })).toEqual([
      'get_device_details',
      'get_state',
      'get_summary',
    ]);
  });

  it('combines a group allow-list with read-only filtering', async () => {
    // color is all writes -> dropped by read-only; status survives.
    expect(await exposedTools({ TWINKLY_TOOLS: 'status,color', TWINKLY_READONLY: 'true' })).toEqual([
      'get_device_details',
      'get_state',
      'get_summary',
    ]);
  });

  it('hides admin tools unless allowAdmin is set', async () => {
    const withoutAdmin = await exposedTools({});
    expect(withoutAdmin).not.toContain('set_name');
    expect(withoutAdmin).not.toContain('set_timer');

    const withAdmin = await exposedTools({ TWINKLY_ALLOW_ADMIN: 'true' });
    expect(withAdmin).toContain('set_name');
    expect(withAdmin).toContain('set_timer');
  });

  it('keeps admin tools hidden in read-only mode even when allowAdmin is set', async () => {
    const tools = await exposedTools({ TWINKLY_ALLOW_ADMIN: 'true', TWINKLY_READONLY: 'true' });
    expect(tools).not.toContain('set_name');
    expect(tools).not.toContain('set_timer');
  });

  it('respects the group allow-list for admin (allowAdmin alone is not enough)', async () => {
    const tools = await exposedTools({ TWINKLY_ALLOW_ADMIN: 'true', TWINKLY_TOOLS: 'power' });
    expect(tools).not.toContain('set_name');
    expect(tools).toContain('set_power');
  });
});
