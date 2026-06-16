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

export {
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  buildInitializeResult,
  VENDOR,
  type ServerCapabilities,
  type ServerInfo,
  type InitializeResult,
} from "./capabilities/index.js";

export {
  inspectRequest,
  extractBearer,
  handleStreamableHttp,
  type StreamableHttpOptions,
} from "./transport/index.js";

export {
  runStdio,
  requireGithubToken,
  type StdioOptions,
} from "./transport/index.js";

export {
  resolveToolset,
  validateSpec,
  SHIPPED_TOOLSETS,
  type ToolsetName,
  type ToolsetSpec,
  type ResolvedToolset,
  type ToolsetConfig,
} from "./toolset/index.js";
