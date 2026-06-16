// MCP capabilities and protocol-version negotiation.
//
// The server advertises the protocol versions it can speak, the
// transport features it supports, and the toolsets it has loaded.
// Clients (MCP hosts) consult these during the `initialize` handshake.

import type { ProtocolVersion } from "../types.js";

/** Versions of the MCP spec the server can speak, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2024-11-05",
] as const;

/** Pick the best version the client supports. */
export function negotiateProtocolVersion(requested: string): ProtocolVersion {
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return {
      requested,
      negotiated: requested,
      supported: SUPPORTED_PROTOCOL_VERSIONS,
    };
  }
  // Fall back to the newest stable we support; the client is expected to
  // gracefully disconnect if it cannot accept it.
  const fallback = SUPPORTED_PROTOCOL_VERSIONS[0];
  if (fallback === undefined) {
    throw new Error("no protocol versions configured");
  }
  return {
    requested,
    negotiated: fallback,
    supported: SUPPORTED_PROTOCOL_VERSIONS,
  };
}

export interface ServerCapabilities {
  /** Tools are registered dynamically; clients call `tools/list` to enumerate. */
  readonly tools: { readonly listChanged: true };
  /** Resources are intentionally not exposed in v0.1. */
  readonly resources: { readonly subscribe: false; readonly listChanged: false };
  /** Prompts are intentionally not exposed in v0.1. */
  readonly prompts: { readonly listChanged: false };
  /** Logging is forwarded to Pino and never to the client. */
  readonly logging: Record<string, never>;
}

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
  readonly vendor: string;
}

export const VENDOR = "ghmcp-org";

export interface InitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: ServerCapabilities;
  readonly serverInfo: ServerInfo;
}

export function buildInitializeResult(opts: {
  requestedVersion: string;
  serverName: string;
  serverVersion: string;
}): InitializeResult {
  const negotiated = negotiateProtocolVersion(opts.requestedVersion);
  return {
    protocolVersion: negotiated.negotiated,
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
      logging: {},
    },
    serverInfo: {
      name: opts.serverName,
      version: opts.serverVersion,
      vendor: VENDOR,
    },
  };
}
