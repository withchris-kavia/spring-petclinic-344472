import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import { writeJsonArtifact } from "../core/artifacts.js";
import { buildMcpServerDescriptor } from "../adapters/mcp/descriptor.js";
import { buildPlaywrightRuntimeDescriptor } from "../adapters/playwright/runtime.js";

// PUBLIC_INTERFACE
/**
 * Emits the initial execution-plan artifact scaffold for future Playwright and MCP-driven runs.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPath: string
 * }>} Execution scaffold result.
 */
export async function runExecuteCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const artifactPath = path.resolve(paths.executionRoot, "execution-plan.stub.json");

  const payload = {
    command: "execute",
    createdAt: new Date().toISOString(),
    status: "stub_ready",
    executionMode: "playwright-plus-mcp",
    playwright: buildPlaywrightRuntimeDescriptor(environment),
    mcp: buildMcpServerDescriptor(environment),
    notes: [
      "This is the baseline artifact for step 01.00.",
      "Real scenario execution and assertions will be implemented in step 04.00."
    ]
  };

  await writeJsonArtifact(artifactPath, payload);

  return {
    command: "execute",
    status: "stub_ready",
    artifactPath
  };
}
