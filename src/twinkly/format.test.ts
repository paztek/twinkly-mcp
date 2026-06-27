import { describe, expect, it } from 'vitest';
import type {
  DeviceDetailsResponse,
  GetCurrentMovieResponse,
  GetMoviesResponse,
  GetSummaryResponse,
} from '@twinklyjs/twinkly';
import { TwinklyError } from '../errors.js';
import {
  assertOk,
  formatDeviceDetails,
  formatEffects,
  formatMovies,
  formatState,
  formatSummary,
} from './format.js';

describe('assertOk', () => {
  it('passes through a 1000 (OK) code', () => {
    expect(() => assertOk({ code: 1000 }, 'Set color')).not.toThrow();
  });

  it('throws a device_request_failed TwinklyError on a non-OK code', () => {
    try {
      assertOk({ code: 1104 }, 'Set movie');
      throw new Error('expected assertOk to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TwinklyError);
      expect((err as TwinklyError).code).toBe('device_request_failed');
      expect((err as TwinklyError).message).toContain('1104');
    }
  });
});

describe('formatDeviceDetails', () => {
  const raw = {
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
  } as unknown as DeviceDetailsResponse;

  it('maps the curated subset to camelCase fields', () => {
    expect(formatDeviceDetails('tree', raw)).toEqual({
      device: 'tree',
      name: 'Tree',
      product: 'Twinkly',
      model: 'TWS250STP',
      ledCount: 250,
      ledProfile: 'RGB',
      frameRate: 25,
      hardwareVersion: '6',
      firmwareFamily: 'G',
      mac: 'aa:bb:cc:dd:ee:ff',
      uuid: 'uuid-1',
      uptimeSeconds: 3600,
      movieCapacity: 992,
    });
  });

  it('coerces an unparseable uptime to 0', () => {
    const details = formatDeviceDetails('tree', { ...raw, uptime: 'n/a' } as DeviceDetailsResponse);
    expect(details.uptimeSeconds).toBe(0);
  });
});

describe('formatSummary', () => {
  const base = {
    code: 1000,
    led_mode: { mode: 'color', detect_mode: 0, shop_mode: 0 },
    timer: { time_now: 100, time_on: -1, time_off: -1, tz: 'Europe/Paris' },
    music: { enabled: 1, active: 0, mode: 'off', auto_mode: 'off', current_driverset: 0, mood_index: 0 },
    filters: [{ filter: 'brightness', config: { value: 80, mode: 'enabled' } }],
    group: { mode: '', compat_mode: 0 },
    layout: { uuid: 'u' },
    color: { hue: 10, saturation: 20, value: 30, red: 40, green: 50, blue: 60 },
  } as unknown as GetSummaryResponse;

  it('normalizes mode, color, timer, music, and filters', () => {
    expect(formatSummary('tree', base)).toEqual({
      device: 'tree',
      mode: 'color',
      color: { hue: 10, saturation: 20, value: 30, red: 40, green: 50, blue: 60 },
      timer: { timeNow: 100, timeOn: -1, timeOff: -1, tz: 'Europe/Paris' },
      music: { enabled: true, active: false, mode: 'off' },
      filters: [{ filter: 'brightness', value: 80, mode: 'enabled' }],
    });
  });

  it('returns null color on firmware without the color block', () => {
    const summary = formatSummary('tree', { ...base, color: undefined } as unknown as GetSummaryResponse);
    expect(summary.color).toBeNull();
  });
});

describe('formatState', () => {
  it('folds the four reads into one snapshot', () => {
    const state = formatState('tree', {
      mode: { code: 1000, mode: 'movie', shop_mode: 0 },
      brightness: { code: 1000, mode: 'enabled', value: 75 },
      saturation: { code: 1000, mode: 'enabled', value: 100 },
      color: { code: 1000, hue: 0, saturation: 0, value: 255, red: 255, green: 255, blue: 255 },
    });
    expect(state).toEqual({
      device: 'tree',
      mode: 'movie',
      brightness: { mode: 'enabled', value: 75 },
      saturation: { mode: 'enabled', value: 100 },
      color: { hue: 0, saturation: 0, value: 255, red: 255, green: 255, blue: 255 },
    });
  });

  it('reports null color when the color read was skipped', () => {
    const state = formatState('tree', {
      mode: { code: 1000, mode: 'off', shop_mode: 0 },
      brightness: { code: 1000, mode: 'disabled', value: 0 },
      saturation: { code: 1000, mode: 'enabled', value: 100 },
      color: null,
    });
    expect(state.color).toBeNull();
  });
});

describe('formatEffects', () => {
  it('maps the effect list and current effect id', () => {
    expect(
      formatEffects(
        'tree',
        { code: 1000, effects_number: 2, unique_ids: ['a', 'b'] },
        { code: 1000, unique_id: 'a', effect_id: 1 },
      ),
    ).toEqual({ device: 'tree', count: 2, effectIds: ['a', 'b'], currentEffectId: 1 });
  });

  it('tolerates a missing current effect and missing unique_ids', () => {
    expect(
      formatEffects('tree', { code: 1000, effects_number: 0 } as never, null),
    ).toEqual({ device: 'tree', count: 0, effectIds: [], currentEffectId: null });
  });
});

describe('formatMovies', () => {
  const movies = {
    code: 1000,
    available_frames: 992,
    max_capacity: 992,
    movies: [
      { id: 0, name: 'Sparkle', unique_id: 'm0', descriptor_type: 'rgb_raw', leds_per_frame: 250, frames_number: 60, fps: 10 },
    ],
  } as unknown as GetMoviesResponse;

  it('maps movies and the current movie id', () => {
    const current = { code: 1000, id: 0, unique_id: 'm0', name: 'Sparkle' } as GetCurrentMovieResponse;
    expect(formatMovies('tree', movies, current)).toEqual({
      device: 'tree',
      movies: [{ id: 0, name: 'Sparkle', uniqueId: 'm0', frames: 60, fps: 10 }],
      currentMovieId: 0,
    });
  });

  it('reports null current movie when none is set', () => {
    expect(formatMovies('tree', movies, null).currentMovieId).toBeNull();
  });
});
