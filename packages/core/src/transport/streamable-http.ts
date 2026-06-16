// Streamable-HTTP transport adapter.
//
// The MCP SDK owns the wire protocol (POST for messages, GET for SSE
// streams of server->client notifications). This adapter adds:
//   * host/origin allowlist enforcement
//   * bearer-token extraction for OAuth 2.1 / GitHub App auth
//   * a uniform handler signature that the Fastify app can call

import type { IncomingMessage, ServerResponse } from "node:http";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InvalidInputError, UnauthorizedError } from "../errors/index.js";

export interface StreamableHttpOptions {
  /** Allowed `Host` header values; empty allows any. */
  readonly allowedHosts: readonly string[];
  /** Allowed `Origin` header values; empty allows any. */
  readonly allowedOrigins: readonly string[];
  /** Optional auth hook. Throws UnauthorizedError to reject. */
  readonly authenticate: (req: IncomingMessage) => Promise<{
    bearer: string;
    scopes: readonly string[];
  }>;
  /** Build the transport given the per-session auth context. */
  readonly buildTransport: (auth: { bearer: string; scopes: readonly string[] }) => StreamableHTTPServerTransport;
}

/** Validate Host/Origin and return the lowercased host and origin or null. */
export function inspectRequest(
  req: IncomingMessage,
  opts: Pick<StreamableHttpOptions, "allowedHosts" | "allowedOrigins">,
): { host: string; origin: string | null } {
  const hostHeader = req.headers.host ?? "";
  const host = hostHeader.toLowerCase();
  const originHeader = req.headers.origin;
  const origin = typeof originHeader === "string" ? originHeader.toLowerCase() : null;

  if (opts.allowedHosts.length > 0 && !opts.allowedHosts.includes(host)) {
    throw new InvalidInputError(`host not allowed: ${host}`);
  }
  if (origin !== null && opts.allowedOrigins.length > 0 && !opts.allowedOrigins.includes(origin)) {
    throw new InvalidInputError(`origin not allowed: ${origin}`);
  }
  return { host, origin };
}

/** Extract a bearer token from `Authorization: Bearer ...` (case-insensitive). */
export function extractBearer(req: IncomingMessage): string {
  const raw = req.headers.authorization;
  if (typeof raw !== "string") {
    throw new UnauthorizedError("missing authorization header");
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (match === null || match[1] === undefined) {
    throw new UnauthorizedError("malformed authorization header");
  }
  const token = match[1].trim();
  if (token.length === 0) {
    throw new UnauthorizedError("empty bearer token");
  }
  return token;
}

/** Handle one streamable-HTTP request end-to-end. */
export async function handleStreamableHttp(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StreamableHttpOptions,
): Promise<void> {
  const inspected = inspectRequest(req, opts);
  const auth = await opts.authenticate(req);
  if (typeof auth.bearer !== "string" || auth.bearer.length === 0) {
    throw new UnauthorizedError("authentication produced no token");
  }
  // Host/origin are also passed to the SDK transport for logging.
  const transport = opts.buildTransport(auth);
  void inspected; // reserved for future audit logging
  await transport.handleRequest(req, res);
}
