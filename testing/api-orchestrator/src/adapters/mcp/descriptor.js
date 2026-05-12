const DEFAULT_HOOK_STAGES = [
  "execution_started",
  "scenario_started",
  "pre_request",
  "post_response",
  "scenario_finished",
  "scenario_failure",
  "execution_finished"
];

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
 *   serverArgs: string[],
 *   hookStages: string[]
 * }} Baseline MCP connection metadata.
 */
export function buildMcpServerDescriptor(environment) {
  return {
    transport: environment.mcpTransport,
    enabled: Boolean(environment.mcpServerCommand),
    serverCommand: environment.mcpServerCommand || null,
    serverArgs: environment.mcpServerArgs,
    hookStages: DEFAULT_HOOK_STAGES
  };
}

// PUBLIC_INTERFACE
/**
 * Builds a structured MCP hook envelope that can be emitted into execution logs and reports.
 * These envelopes provide stable integration points for future live MCP client dispatch.
 *
 * @param {{
 *   descriptor: ReturnType<typeof buildMcpServerDescriptor>,
 *   stage: string,
 *   scenario?: { id?: string, endpointId?: string, category?: string, type?: string, title?: string },
 *   status?: string,
 *   detail?: Record<string, any>
 * }} input - Hook metadata and optional scenario context.
 * @returns {{
 *   component: string,
 *   stage: string,
 *   enabled: boolean,
 *   transport: string,
 *   status: string,
 *   scenarioId: string | null,
 *   endpointId: string | null,
 *   timestamp: string,
 *   detail: Record<string, any>
 * }} Structured MCP hook record.
 */
export function buildMcpHookEnvelope({ descriptor, stage, scenario, status = "ready", detail = {} }) {
  return {
    component: "mcp",
    stage,
    enabled: descriptor.enabled,
    transport: descriptor.transport,
    status,
    scenarioId: scenario?.id ?? null,
    endpointId: scenario?.endpointId ?? null,
    timestamp: new Date().toISOString(),
    detail: {
      category: scenario?.category ?? null,
      type: scenario?.type ?? null,
      title: scenario?.title ?? null,
      ...detail
    }
  };
}
