/**
 * Shared building blocks for tool modules.
 *
 * Tools never touch HTTP or construct clients — they go through
 * {@link DeviceManager.withDevice}. What they *do* share is the `device`
 * argument, the result envelopes, and turning a thrown {@link TwinklyError}
 * into an MCP error result instead of a protocol-level exception.
 */
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TwinklyError, toTwinklyError } from '../errors.js';
import type { Logger } from '../logger.js';

/** The optional `device` argument every device-targeting tool accepts. */
export const deviceArg = {
  device: z
    .string()
    .optional()
    .describe(
      'Name of the target device (see list_devices). Omit to use the default device.',
    ),
} as const;

/** A JSON-serializable payload returned as both text and structured content. */
export function jsonResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** A plain-text result — used by write tools that need no structured output. */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/** Turn any thrown value into an MCP error result tagged with its Twinkly code. */
export function errorResult(err: unknown, logger: Logger): CallToolResult {
  const e: TwinklyError = err instanceof TwinklyError ? err : toTwinklyError(err);
  const where = e.device ? ` (${e.device})` : '';
  logger.error(`tool error [${e.code}]${where}: ${e.message}`);
  const status = e.status !== undefined ? ` (HTTP ${e.status})` : '';
  return {
    isError: true,
    content: [{ type: 'text', text: `Error [${e.code}]${status}: ${e.message}` }],
  };
}

/**
 * Run a tool body, converting any failure into an MCP error result. This keeps
 * every handler's happy path flat and uniform.
 */
export async function guard(
  logger: Logger,
  body: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await body();
  } catch (err) {
    return errorResult(err, logger);
  }
}

/**
 * Run a device call that may be unsupported on older firmware, returning `null`
 * instead of failing the whole tool. Used for best-effort reads (e.g. the
 * color endpoint, which only exists since firmware 2.7.1).
 */
export async function optional<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
