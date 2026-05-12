import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import { readJsonArtifact, writeJsonArtifact } from "../core/artifacts.js";
import { buildDiscoveredApiCatalog } from "../core/api-discovery.js";
import { generateScenarioArtifacts } from "../core/scenario-generator.js";

// PUBLIC_INTERFACE
/**
 * Generates downstream-ready API testing scenario artifacts from the normalized discovery catalog.
 * If the discovery artifact is missing, the command rebuilds it first so generation can still run
 * in isolation.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPaths: {
 *     discoveryCatalog: string,
 *     scenarios: string,
 *     manifest: string,
 *     fixtures: string
 *   },
 *   summary: {
 *     discoveryRebuilt: boolean,
 *     endpointCount: number,
 *     scenarioCount: number,
 *     byCategory: Record<string, number>
 *   }
 * }>} Generation result containing scenario artifacts for downstream execution.
 */
export async function runGenerateCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const discoveryArtifactPath = path.resolve(paths.discoveryRoot, "api-catalog.json");
  const scenarioArtifactPath = path.resolve(paths.generatedRoot, "generated-scenarios.json");
  const manifestArtifactPath = path.resolve(paths.generatedRoot, "scenario-manifest.json");
  const fixturesArtifactPath = path.resolve(paths.generatedRoot, "scenario-fixtures.json");

  let catalog;
  let discoveryRebuilt = false;

  try {
    catalog = await readJsonArtifact(discoveryArtifactPath);
  }
  catch {
    catalog = await buildDiscoveredApiCatalog(environment);
    await writeJsonArtifact(discoveryArtifactPath, catalog);
    discoveryRebuilt = true;
  }

  const generated = generateScenarioArtifacts(catalog, {
    targetBaseUrl: environment.targetBaseUrl,
    parallelism: environment.parallelism,
    timeoutMs: environment.timeoutMs
  });

  await writeJsonArtifact(scenarioArtifactPath, generated);
  await writeJsonArtifact(manifestArtifactPath, generated.manifest);
  await writeJsonArtifact(fixturesArtifactPath, generated.fixtures);

  return {
    command: "generate",
    status: generated.summary.totalScenarios > 0 ? "ok" : "empty",
    artifactPaths: {
      discoveryCatalog: discoveryArtifactPath,
      scenarios: scenarioArtifactPath,
      manifest: manifestArtifactPath,
      fixtures: fixturesArtifactPath
    },
    summary: {
      discoveryRebuilt,
      endpointCount: generated.summary.endpointsCovered,
      scenarioCount: generated.summary.totalScenarios,
      byCategory: generated.summary.byCategory
    }
  };
}
