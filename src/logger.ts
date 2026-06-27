/**
 * Minimal leveled logger that writes to **stderr only**.
 *
 * On the stdio transport, stdout is reserved for the MCP JSON-RPC stream —
 * anything written there corrupts the protocol. Every diagnostic in this
 * server therefore goes through here, which is hard-wired to stderr.
 *
 * The sink is injectable so the bootstrap and tests can capture output without
 * touching the real `process.stderr`.
 */
import { LOG_LEVELS, type TwinklyMcpConfig } from './config.js';

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Numeric ranking; a message is emitted when its level <= the configured level. */
const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/** Where a logger writes a finished line. Defaults to `process.stderr`. */
export type LogSink = (line: string) => void;

export interface Logger {
  error(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  debug(message: string, ...rest: unknown[]): void;
}

const defaultSink: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

function format(level: LogLevel, message: string, rest: unknown[]): string {
  const prefix = `[twinkly-mcp] ${level}: ${message}`;
  if (rest.length === 0) return prefix;
  const extra = rest
    .map((r) => (typeof r === 'string' ? r : safeStringify(r)))
    .join(' ');
  return `${prefix} ${extra}`;
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Create a logger that emits at or below `level`. `sink` is injectable for
 * tests; production passes the default stderr sink.
 */
export function createLogger(
  level: TwinklyMcpConfig['logLevel'],
  sink: LogSink = defaultSink,
): Logger {
  const threshold = LEVEL_RANK[level];
  const log = (msgLevel: LogLevel, message: string, rest: unknown[]): void => {
    if (LEVEL_RANK[msgLevel] <= threshold) {
      sink(format(msgLevel, message, rest));
    }
  };
  return {
    error: (message, ...rest) => log('error', message, rest),
    warn: (message, ...rest) => log('warn', message, rest),
    info: (message, ...rest) => log('info', message, rest),
    debug: (message, ...rest) => log('debug', message, rest),
  };
}
