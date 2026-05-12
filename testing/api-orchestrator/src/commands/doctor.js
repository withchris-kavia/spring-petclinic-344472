import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import { writeJsonArtifact } from "../core/artifacts.js";
import { buildMcpServerDescriptor } from "../adapters/mcp/descriptor.js";
import { buildPlaywrightRuntimeDescriptor } from "../adapters/playwright/runtime.js";

// PUBLIC_INTERFACE
/**
 * Validates the baseline workspace structure and writes a readiness summary artifact.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPath: string,
 *   summary: {
 *     workspaceReady: boolean,
 *     targetBaseUrl: string,
 *     outputRoot: string,
 *     mcpEnabled: boolean
 *   }
 * }>} Baseline doctor command result.
 */
export async function runDoctorCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const artifactPath = path.resolve(paths.reportsRoot, "doctor-summary.json");

  const payload = {
    command: "doctor",
    createdAt: new Date().toISOString(),
    workspace: {
      applicationRoot: paths.applicationRoot,
      workspaceRoot: paths.workspaceRoot,
      testsRoot: paths.testsRoot,
      outputRoot: paths.outputRoot
    },
    playwright: buildPlaywrightRuntimeDescriptor(environment),
    mcp: buildMcpServerDescriptor(environment),
    notes: [
      "Workspace scaffold is ready.",
      "No Spring Boot runtime behavior has been modified.",
      "Discovery, generation, execution, and reporting will be expanded in later steps."
    ]
  };

  await writeJsonArtifact(artifactPath, payload);

  return {
    command: "doctor",
    status: "ok",
    artifactPath,
    summary: {
      workspaceReady: true,
      targetBaseUrl: environment.targetBaseUrl,
      outputRoot: paths.outputRoot,
      mcpEnabled: Boolean(environment.mcpServerCommand)
    }
  };
}
