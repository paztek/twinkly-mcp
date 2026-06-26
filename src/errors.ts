/**
 * Structured errors for twinkly-mcp.
 *
 * The HTTP layer (`@twinklyjs/twinkly`) throws either a {@link FetchError}
 * (the device answered with a non-2xx status) or a generic `Error`/`TypeError`
 * (the request never completed — DNS failure, connection refused, timeout).
 * Tools should never have to reason about those low-level shapes, so the device
 * manager funnels everything through {@link toTwinklyError}, producing a small,
 * predictable set of codes that map cleanly onto MCP tool errors.
 */
import { FetchError } from '@twinklyjs/twinkly';

export const TWINKLY_ERROR_CODES = [
  /** A `device` was named but no such device is in the registry. */
  'device_not_found',
  /** No `device` given and the default could not be resolved (zero or many). */
  'no_device_specified',
  /** The request never reached the device (network/DNS/timeout). */
  'device_unreachable',
  /** The device answered, but with an error status. */
  'device_request_failed',
  /** UDP discovery failed. */
  'discovery_failed',
] as const;

export type TwinklyErrorCode = (typeof TWINKLY_ERROR_CODES)[number];

export interface TwinklyErrorOptions {
  /** HTTP status code, when the failure came from a device response. */
  status?: number;
  /** Name of the device involved, for context. */
  device?: string;
  /** Underlying error, preserved for logging/debugging. */
  cause?: unknown;
}

/** A normalized, tool-friendly error. */
export class TwinklyError extends Error {
  override readonly name = 'TwinklyError';
  readonly code: TwinklyErrorCode;
  readonly status?: number;
  readonly device?: string;

  constructor(code: TwinklyErrorCode, message: string, options: TwinklyErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.device !== undefined) this.device = options.device;
  }
}

/**
 * Normalize any thrown value into a {@link TwinklyError}.
 *
 * - {@link TwinklyError} passes through (optionally tagged with `device`).
 * - {@link FetchError} → `device_request_failed`, carrying the HTTP status.
 * - Any other `Error` → `device_unreachable` (the request never completed).
 * - Anything else → `device_request_failed` with a stringified message.
 */
export function toTwinklyError(err: unknown, device?: string): TwinklyError {
  if (err instanceof TwinklyError) {
    if (device !== undefined && err.device === undefined) {
      return new TwinklyError(err.code, err.message, {
        status: err.status,
        device,
        cause: err.cause,
      });
    }
    return err;
  }

  if (err instanceof FetchError) {
    const status = err.response?.status;
    return new TwinklyError('device_request_failed', err.message, {
      status,
      device,
      cause: err,
    });
  }

  if (err instanceof Error) {
    return new TwinklyError('device_unreachable', err.message, { device, cause: err });
  }

  return new TwinklyError('device_request_failed', String(err), { device, cause: err });
}
