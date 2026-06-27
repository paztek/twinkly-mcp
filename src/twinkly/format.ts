/**
 * Normalize raw `@twinklyjs/twinkly` responses into compact, LLM-friendly
 * shapes — and assert device-level success codes.
 *
 * The library mirrors Twinkly's HTTP API verbatim (snake_case keys, redundant
 * fields, string-encoded numbers). Tools shouldn't hand that to an agent, so
 * every read tool runs its raw response through a `format*` helper here. The
 * zod raw shapes are the single source of truth for the normalized model: tools
 * reuse them as their `outputSchema`, and the formatters return values typed by
 * the very same shape, so the schema and the data can't drift.
 */
import { z } from 'zod';
import type {
  DeviceDetailsResponse,
  GetCurrentLEDEffectResponse,
  GetCurrentMovieResponse,
  GetLEDBrightnessResponse,
  GetLEDColorResponse,
  GetLEDEffectsResponse,
  GetLEDOperationModeResponse,
  GetLEDSaturationResponse,
  GetMoviesResponse,
  GetSummaryResponse,
} from '@twinklyjs/twinkly';
import { TwinklyError } from '../errors.js';

/** Twinkly's "OK" application code (returned in the body on a 2xx response). */
const TWINKLY_OK_CODE = 1000;

/**
 * Throw if a device response carries a non-OK application code. Twinkly answers
 * with HTTP 200 even for logical failures (e.g. code 1104 = "movie not set"),
 * so writes must inspect the body code, not just the HTTP status.
 */
export function assertOk(res: { code: number }, action: string): void {
  if (res.code !== TWINKLY_OK_CODE) {
    throw new TwinklyError(
      'device_request_failed',
      `${action} was rejected by the device (code ${res.code})`,
    );
  }
}

/** Reusable HSV+RGB color block, as the device reports it. */
const colorShape = z.object({
  hue: z.number(),
  saturation: z.number(),
  value: z.number(),
  red: z.number(),
  green: z.number(),
  blue: z.number(),
});

type Color = z.infer<typeof colorShape>;

function toColor(raw: {
  hue: number;
  saturation: number;
  value: number;
  red: number;
  green: number;
  blue: number;
}): Color {
  return {
    hue: raw.hue,
    saturation: raw.saturation,
    value: raw.value,
    red: raw.red,
    green: raw.green,
    blue: raw.blue,
  };
}

/* ── get_device_details ─────────────────────────────────────────────────── */

export const deviceDetailsShape = {
  device: z.string(),
  name: z.string(),
  product: z.string(),
  model: z.string(),
  ledCount: z.number(),
  ledProfile: z.string(),
  frameRate: z.number(),
  hardwareVersion: z.string(),
  firmwareFamily: z.string(),
  mac: z.string(),
  uuid: z.string(),
  uptimeSeconds: z.number(),
  movieCapacity: z.number(),
} as const;

export type DeviceDetails = z.infer<z.ZodObject<typeof deviceDetailsShape>>;

export function formatDeviceDetails(device: string, raw: DeviceDetailsResponse): DeviceDetails {
  const uptime = Number.parseInt(raw.uptime, 10);
  return {
    device,
    name: raw.device_name,
    product: raw.product_name,
    model: raw.product_code,
    ledCount: raw.number_of_led,
    ledProfile: raw.led_profile,
    frameRate: raw.frame_rate,
    hardwareVersion: raw.hardware_version,
    firmwareFamily: raw.fw_family,
    mac: raw.mac,
    uuid: raw.uuid,
    uptimeSeconds: Number.isNaN(uptime) ? 0 : uptime,
    movieCapacity: raw.movie_capacity,
  };
}

/* ── get_summary ────────────────────────────────────────────────────────── */

export const summaryShape = {
  device: z.string(),
  mode: z.string(),
  color: colorShape.nullable(),
  timer: z.object({
    timeNow: z.number(),
    timeOn: z.number(),
    timeOff: z.number(),
    tz: z.string(),
  }),
  music: z.object({
    enabled: z.boolean(),
    active: z.boolean(),
    mode: z.string(),
  }),
  filters: z.array(
    z.object({
      filter: z.string(),
      value: z.number(),
      mode: z.string(),
    }),
  ),
} as const;

export type Summary = z.infer<z.ZodObject<typeof summaryShape>>;

export function formatSummary(device: string, raw: GetSummaryResponse): Summary {
  return {
    device,
    mode: raw.led_mode.mode,
    // `color` only exists since firmware 2.7.1; older devices omit it.
    color: raw.color ? toColor(raw.color) : null,
    timer: {
      timeNow: raw.timer.time_now,
      timeOn: raw.timer.time_on,
      timeOff: raw.timer.time_off,
      tz: raw.timer.tz,
    },
    music: {
      enabled: raw.music.enabled === 1,
      active: raw.music.active === 1,
      mode: raw.music.mode,
    },
    filters: raw.filters.map((f) => ({
      filter: f.filter,
      value: f.config.value,
      mode: f.config.mode,
    })),
  };
}

/* ── get_state (composite) ──────────────────────────────────────────────── */

export const stateShape = {
  device: z.string(),
  mode: z.string(),
  brightness: z.object({ mode: z.string(), value: z.number() }),
  saturation: z.object({ mode: z.string(), value: z.number() }),
  color: colorShape.nullable(),
} as const;

export type State = z.infer<z.ZodObject<typeof stateShape>>;

export interface RawState {
  mode: GetLEDOperationModeResponse;
  brightness: GetLEDBrightnessResponse;
  saturation: GetLEDSaturationResponse;
  /** `null` when the device firmware predates the color endpoint. */
  color: GetLEDColorResponse | null;
}

export function formatState(device: string, raw: RawState): State {
  return {
    device,
    mode: raw.mode.mode,
    brightness: { mode: raw.brightness.mode, value: raw.brightness.value },
    saturation: { mode: raw.saturation.mode, value: raw.saturation.value },
    color: raw.color ? toColor(raw.color) : null,
  };
}

/* ── list_effects ───────────────────────────────────────────────────────── */

export const effectsShape = {
  device: z.string(),
  count: z.number(),
  effectIds: z.array(z.string()),
  currentEffectId: z.number().nullable(),
} as const;

export type Effects = z.infer<z.ZodObject<typeof effectsShape>>;

export function formatEffects(
  device: string,
  raw: GetLEDEffectsResponse,
  current: GetCurrentLEDEffectResponse | null,
): Effects {
  return {
    device,
    count: raw.effects_number,
    effectIds: raw.unique_ids ?? [],
    currentEffectId: current ? current.effect_id : null,
  };
}

/* ── list_movies ────────────────────────────────────────────────────────── */

export const moviesShape = {
  device: z.string(),
  movies: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      uniqueId: z.string(),
      frames: z.number(),
      fps: z.number(),
    }),
  ),
  currentMovieId: z.number().nullable(),
} as const;

export type Movies = z.infer<z.ZodObject<typeof moviesShape>>;

export function formatMovies(
  device: string,
  raw: GetMoviesResponse,
  current: GetCurrentMovieResponse | null,
): Movies {
  return {
    device,
    movies: raw.movies.map((m) => ({
      id: m.id,
      name: m.name,
      uniqueId: m.unique_id,
      frames: m.frames_number,
      fps: m.fps,
    })),
    currentMovieId: current ? current.id : null,
  };
}
