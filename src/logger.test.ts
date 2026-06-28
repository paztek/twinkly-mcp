import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';

function capture() {
  const lines: string[] = [];
  return { lines, sink: (line: string) => lines.push(line) };
}

describe('createLogger', () => {
  it('emits messages at or below the configured level', () => {
    const { lines, sink } = capture();
    const log = createLogger('info', sink);

    log.error('e');
    log.warn('w');
    log.info('i');
    log.debug('d');

    expect(lines).toEqual([
      '[twinkly-mcp] error: e',
      '[twinkly-mcp] warn: w',
      '[twinkly-mcp] info: i',
    ]);
  });

  it('suppresses everything but errors at level "error"', () => {
    const { lines, sink } = capture();
    const log = createLogger('error', sink);

    log.error('boom');
    log.warn('nope');
    log.info('nope');
    log.debug('nope');

    expect(lines).toEqual(['[twinkly-mcp] error: boom']);
  });

  it('emits debug only at level "debug"', () => {
    const { lines, sink } = capture();
    const log = createLogger('debug', sink);

    log.debug('detail');

    expect(lines).toEqual(['[twinkly-mcp] debug: detail']);
  });

  it('appends string extras verbatim', () => {
    const { lines, sink } = capture();
    const log = createLogger('info', sink);

    log.info('ready', 'on stdio');

    expect(lines).toEqual(['[twinkly-mcp] info: ready on stdio']);
  });

  it('JSON-stringifies non-string extras', () => {
    const { lines, sink } = capture();
    const log = createLogger('info', sink);

    log.info('config', { devices: 2 });

    expect(lines).toEqual(['[twinkly-mcp] info: config {"devices":2}']);
  });

  it('renders Error extras with their stack', () => {
    const { lines, sink } = capture();
    const log = createLogger('error', sink);
    const err = new Error('kaboom');

    log.error('failed', err);

    expect(lines[0]).toContain('[twinkly-mcp] error: failed');
    expect(lines[0]).toContain('kaboom');
  });

  it('falls back to the message when an Error extra has no stack', () => {
    const { lines, sink } = capture();
    const log = createLogger('error', sink);
    const err = new Error('stackless');
    err.stack = undefined;

    log.error('failed', err);

    expect(lines[0]).toBe('[twinkly-mcp] error: failed stackless');
  });

  describe('default sink', () => {
    afterEach(() => vi.restoreAllMocks());

    it('writes a newline-terminated line to process.stderr', () => {
      const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      const log = createLogger('info');

      log.info('hello');

      expect(write).toHaveBeenCalledWith('[twinkly-mcp] info: hello\n');
    });
  });
});
