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

export {
  createRegistry,
  hashDescription,
  type Registry,
  type RegistryOptions,
  type RegisteredTool,
  type ToolsetName,
} from "./registry/index.js";

export {
  McpError,
  InvalidInputError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ConflictError,
  UnavailableError,
  InternalError,
  toJsonRpcError,
} from "./errors/index.js";
