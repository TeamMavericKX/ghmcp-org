// Core types shared across transports, the registry, and tool authors.
// Kept dependency-free so they can be imported by any package.

import type { ZodType } from "zod";

/** MCP tool annotations as declared by the author and enforced by the host. */
export interface McpToolAnnotations {
  /** Tool only reads; never mutates platform state. */
  readonly readOnlyHint?: boolean;
  /** Tool destroys data when called. Host should require explicit consent. */
  readonly destructiveHint?: boolean;
  /** Repeated calls with the same input are no-ops after the first. */
  readonly idempotentHint?: boolean;
  /** Tool calls an external, world-visible system (GitHub, in our case). */
  readonly openWorldHint?: boolean;
  /** Tool accepts a `dryRun` flag and previews its effect without acting. */
  readonly dryRunSupported?: boolean;
}

/** A registered tool, before it is bound to a transport. */
export interface McpToolDefinition<Input = unknown, Output = unknown> {
  /** Stable, lowercase-snake-case name. */
  readonly name: string;
  /** Human-readable, host-rendered summary; never re-interpreted as instructions. */
  readonly description: string;
  /** Zod schema describing the input object. */
  readonly inputSchema: ZodType<Input>;
  /** Optional Zod schema describing the output object. */
  readonly outputSchema?: ZodType<Output>;
  readonly annotations: McpToolAnnotations;
  /** The handler. Pure: should not reach outside `context`. */
  readonly handler: (input: Input, context: ToolContext) => Promise<Output>;
}

/** Per-call context passed to a tool handler. */
export interface ToolContext {
  /** Authenticated principal (subject, scopes, installation id). */
  readonly principal: ToolPrincipal;
  /** When true, the tool must NOT mutate state; it returns its preview instead. */
  readonly dryRun: boolean;
  /** Distributed-tracing span from OTel, if observability is wired. */
  readonly span?: unknown;
  /** Logger, namespaced to the tool. */
  readonly log: ToolLogger;
  /** Abort signal forwarded from the transport. */
  readonly signal: AbortSignal;
}

/** Authenticated principal derived from a validated access token. */
export interface ToolPrincipal {
  /** GitHub login of the user, or bot name for an installation token. */
  readonly login: string;
  /** Numeric GitHub user id. */
  readonly id: number;
  /** Installation id for GitHub App tokens; undefined for OAuth. */
  readonly installationId?: number;
  /** OAuth scopes present on the token, post-validation. */
  readonly scopes: readonly string[];
  /** Tenant (org or user) the call is routed against. */
  readonly tenant: string;
}

/** Minimal logger interface the core expects. Implemented by pino. */
export interface ToolLogger {
  debug(obj: Record<string, unknown>, msg?: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): ToolLogger;
}

/** Result wrapper so handlers can return data plus a structural hint. */
export type ToolResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ToolFailure };

export interface ToolFailure {
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly retriable: boolean;
  readonly cause?: unknown;
}

export type ToolErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "conflict"
  | "unavailable"
  | "internal";

/** Protocol version negotiation. The server supports a range. */
export interface ProtocolVersion {
  readonly requested: string;
  readonly negotiated: string;
  readonly supported: readonly string[];
}
