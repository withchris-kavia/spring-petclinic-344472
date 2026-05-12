import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import { writeJsonArtifact } from "../core/artifacts.js";
import { buildDiscoveredApiCatalog } from "../core/api-discovery.js";

// PUBLIC_INTERFACE
/**
 * Discovers application routes from OpenAPI/Swagger when available, falls back to Spring MVC
 * controller analysis otherwise, and writes the normalized internal API catalog artifact.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPath: string,
 *   summary: {
 *     selectedStrategy: string,
 *     discoveredEndpointCount: number,
 *     apiEndpointCount: number,
 *     webEndpointCount: number
 *   }
 * }>} Discovery result pointing to the generated API catalog.
 */
export async function runDiscoverCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const artifactPath = path.resolve(paths.discoveryRoot, "api-catalog.json");
  const catalog = await buildDiscoveredApiCatalog(environment);

  await writeJsonArtifact(artifactPath, catalog);

  return {
    command: "discover",
    status: catalog.summary.totalEndpoints > 0 ? "ok" : "empty",
    artifactPath,
    summary: {
      selectedStrategy: catalog.discovery.selectedStrategy,
      discoveredEndpointCount: catalog.summary.totalEndpoints,
      apiEndpointCount: catalog.summary.apiEndpoints,
      webEndpointCount: catalog.summary.webEndpoints
    }
  };
}
