import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import { writeJsonArtifact } from "../core/artifacts.js";

// PUBLIC_INTERFACE
/**
 * Emits the initial discovery artifact scaffold for future API catalog generation.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPath: string
 * }>} Discovery scaffold result.
 */
export async function runDiscoverCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const artifactPath = path.resolve(paths.discoveryRoot, "discovery-catalog.stub.json");

  const payload = {
    command: "discover",
    createdAt: new Date().toISOString(),
    status: "stub_ready",
    discoveryStrategy: {
      preferredSource: "openapi",
      fallbackSource: "spring-mvc-controller-analysis"
    },
    targetBaseUrl: environment.targetBaseUrl,
    discoveredEndpoints: [],
    notes: [
      "This is the baseline artifact for step 01.00.",
      "Real route discovery will be implemented in step 02.00."
    ]
  };

  await writeJsonArtifact(artifactPath, payload);

  return {
    command: "discover",
    status: "stub_ready",
    artifactPath
  };
}
