import { describe, expect, it } from 'vitest';
import { FetchError } from '@twinklyjs/twinkly';
import { TwinklyError, toTwinklyError } from './errors.js';

describe('TwinklyError', () => {
  it('carries code, status, and device', () => {
    const err = new TwinklyError('device_request_failed', 'boom', {
      status: 401,
      device: 'tree',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TwinklyError');
    expect(err.code).toBe('device_request_failed');
    expect(err.status).toBe(401);
    expect(err.device).toBe('tree');
    expect(err.message).toBe('boom');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('root');
    const err = new TwinklyError('device_unreachable', 'wrapped', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('toTwinklyError', () => {
  it('passes through an existing TwinklyError unchanged when device matches', () => {
    const original = new TwinklyError('device_not_found', 'nope', { device: 'tree' });
    expect(toTwinklyError(original, 'tree')).toBe(original);
  });

  it('tags an untagged TwinklyError with the device', () => {
    const original = new TwinklyError('device_request_failed', 'nope', { status: 500 });
    const tagged = toTwinklyError(original, 'tree');
    expect(tagged).not.toBe(original);
    expect(tagged.code).toBe('device_request_failed');
    expect(tagged.status).toBe(500);
    expect(tagged.device).toBe('tree');
  });

  it('maps a FetchError to device_request_failed with the HTTP status', () => {
    const response = new Response('unauthorized', { status: 401, statusText: 'Unauthorized' });
    const fetchErr = new FetchError('Error fetching: 401 Unauthorized', response);
    const err = toTwinklyError(fetchErr, 'tree');
    expect(err.code).toBe('device_request_failed');
    expect(err.status).toBe(401);
    expect(err.device).toBe('tree');
    expect(err.cause).toBe(fetchErr);
  });

  it('maps a generic Error to device_unreachable', () => {
    const netErr = new Error('connect ECONNREFUSED');
    const err = toTwinklyError(netErr, 'tree');
    expect(err.code).toBe('device_unreachable');
    expect(err.device).toBe('tree');
    expect(err.cause).toBe(netErr);
  });

  it('maps a non-Error throw to device_request_failed', () => {
    const err = toTwinklyError('weird string');
    expect(err.code).toBe('device_request_failed');
    expect(err.message).toBe('weird string');
  });
});
