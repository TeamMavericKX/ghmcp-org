// Error model for the MCP server. All thrown errors should ultimately be
// a subclass of McpError so the transport can map them to JSON-RPC codes
// and structured tool failures uniformly.

import type { ToolErrorCode } from "../types.js";

/** Base class for every error this server throws. */
export abstract class McpError extends Error {
  abstract readonly code: ToolErrorCode;
  abstract readonly retriable: boolean;
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class InvalidInputError extends McpError {
  readonly code = "invalid_input" as const;
  readonly retriable = false;
}

export class UnauthorizedError extends McpError {
  readonly code = "unauthorized" as const;
  readonly retriable = false;
}

export class ForbiddenError extends McpError {
  readonly code = "forbidden" as const;
  readonly retriable = false;
}

export class NotFoundError extends McpError {
  readonly code = "not_found" as const;
  readonly retriable = false;
}

export class RateLimitError extends McpError {
  readonly code = "rate_limited" as const;
  readonly retriable = true;
  /** Seconds the client should wait before retrying, if GitHub told us. */
  readonly retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number, options?: { cause?: unknown }) {
    super(message, options);
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}

export class ConflictError extends McpError {
  readonly code = "conflict" as const;
  readonly retriable = false;
}

export class UnavailableError extends McpError {
  readonly code = "unavailable" as const;
  readonly retriable = true;
}

export class InternalError extends McpError {
  readonly code = "internal" as const;
  readonly retriable = false;
}

/** Map an McpError to a JSON-RPC-shaped payload. */
export function toJsonRpcError(err: McpError): {
  code: number;
  message: string;
  data?: Record<string, unknown>;
} {
  const data: Record<string, unknown> = { retriable: err.retriable };
  if (err instanceof RateLimitError && err.retryAfterSeconds !== undefined) {
    data["retryAfterSeconds"] = err.retryAfterSeconds;
  }
  if (err.cause !== undefined) {
    data["cause"] = String(err.cause);
  }
  return {
    code: jsonRpcCodeFor(err.code),
    message: err.message,
    ...(Object.keys(data).length > 0 ? { data } : {}),
  };
}

function jsonRpcCodeFor(code: ToolErrorCode): number {
  switch (code) {
    case "invalid_input":
      return -32602;
    case "unauthorized":
      return -32001;
    case "forbidden":
      return -32003;
    case "not_found":
      return -32004;
    case "rate_limited":
      return -32005;
    case "conflict":
      return -32009;
    case "unavailable":
      return -32010;
    case "internal":
      return -32603;
  }
}
