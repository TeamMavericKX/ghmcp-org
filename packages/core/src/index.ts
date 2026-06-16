// Public surface of @ghmcp-org/core.
// Filled out incrementally in commits 12-19.

export const PACKAGE_NAME = "@ghmcp-org/core";
export const PACKAGE_VERSION = "0.0.0";

export type {
  McpToolAnnotations,
  McpToolDefinition,
  ToolContext,
  ToolPrincipal,
  ToolLogger,
  ToolResult,
  ToolFailure,
  ToolErrorCode,
  ProtocolVersion,
} from "./types.js";
