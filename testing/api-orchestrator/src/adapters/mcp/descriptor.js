// PUBLIC_INTERFACE
/**
 * Builds a serializable MCP configuration descriptor for the current workspace environment.
 *
 * @param {{
 *   mcpTransport: string,
 *   mcpServerCommand: string,
 *   mcpServerArgs: string[]
 * }} environment - Normalized environment configuration.
 * @returns {{
 *   transport: string,
 *   enabled: boolean,
 *   serverCommand: string | null,
 *   serverArgs: string[]
 * }} Baseline MCP connection metadata.
 */
export function buildMcpServerDescriptor(environment) {
  return {
    transport: environment.mcpTransport,
    enabled: Boolean(environment.mcpServerCommand),
    serverCommand: environment.mcpServerCommand || null,
    serverArgs: environment.mcpServerArgs
  };
}
