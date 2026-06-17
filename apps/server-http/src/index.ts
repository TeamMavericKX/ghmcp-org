// Streamable HTTP transport entry point.
//
// Selects the HTTP transport adapter from @ghmcp-org/core. The full
// HTTP server (Fastify bootstrap, request routing, session store) is
// wired up in a later phase. For now the entry point exists so the
// workspace build resolves and tsup has a target to emit.

export const TRANSPORT = 'streamable-http';
