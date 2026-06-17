import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  InvalidInputError,
  McpError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  UnavailableError,
  toJsonRpcError,
} from './errors.js';

describe('McpError subclasses', () => {
  it('InvalidInputError is not retriable and maps to -32602', () => {
    const err = new InvalidInputError('bad input');
    expect(err.code).toBe('invalid_input');
    expect(err.retriable).toBe(false);
    expect(err.name).toBe('InvalidInputError');
    expect(toJsonRpcError(err).code).toBe(-32602);
  });

  it('UnauthorizedError maps to -32001', () => {
    const err = new UnauthorizedError('no token');
    expect(err.code).toBe('unauthorized');
    expect(err.retriable).toBe(false);
    expect(toJsonRpcError(err).code).toBe(-32001);
  });

  it('ForbiddenError maps to -32003', () => {
    const err = new ForbiddenError('not allowed');
    expect(err.code).toBe('forbidden');
    expect(err.retriable).toBe(false);
    expect(toJsonRpcError(err).code).toBe(-32003);
  });

  it('NotFoundError maps to -32004', () => {
    const err = new NotFoundError('missing');
    expect(err.code).toBe('not_found');
    expect(err.retriable).toBe(false);
    expect(toJsonRpcError(err).code).toBe(-32004);
  });

  it('RateLimitError is retriable and maps to -32005 with retry hint', () => {
    const err = new RateLimitError('slow down', 30);
    expect(err.code).toBe('rate_limited');
    expect(err.retriable).toBe(true);
    expect(err.retryAfterSeconds).toBe(30);
    const rpc = toJsonRpcError(err);
    expect(rpc.code).toBe(-32005);
    expect(rpc.data?.retriable).toBe(true);
    expect(rpc.data?.retryAfterSeconds).toBe(30);
  });

  it('RateLimitError omits retryAfterSeconds when undefined', () => {
    const rpc = toJsonRpcError(new RateLimitError('x'));
    expect(rpc.data?.retryAfterSeconds).toBeUndefined();
  });

  it('ConflictError maps to -32009', () => {
    const err = new ConflictError('dup');
    expect(err.code).toBe('conflict');
    expect(err.retriable).toBe(false);
    expect(toJsonRpcError(err).code).toBe(-32009);
  });

  it('UnavailableError is retriable and maps to -32010', () => {
    const err = new UnavailableError('down');
    expect(err.code).toBe('unavailable');
    expect(err.retriable).toBe(true);
    expect(toJsonRpcError(err).code).toBe(-32010);
  });

  it('InternalError maps to -32603', () => {
    const err = new InternalError('boom');
    expect(err.code).toBe('internal');
    expect(err.retriable).toBe(false);
    expect(toJsonRpcError(err).code).toBe(-32603);
  });

  it('preserves the original cause in JSON-RPC data', () => {
    const cause = new Error('upstream');
    const err = new UnavailableError('down', { cause });
    const rpc = toJsonRpcError(err);
    expect(rpc.data?.cause).toBe('Error: upstream');
  });

  it('every McpError is also an Error', () => {
    const err = new InvalidInputError('x');
    expect(err).toBeInstanceOf(McpError);
    expect(err).toBeInstanceOf(Error);
  });
});
