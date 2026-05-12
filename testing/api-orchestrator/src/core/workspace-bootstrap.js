import fs from "node:fs/promises";
import path from "node:path";
import { loadWorkspacePaths } from "../config/environment.js";

// PUBLIC_INTERFACE
/**
 * Creates the baseline folder structure needed by the Node.js orchestration workspace.
 *
 * @param {{
 *   outputDir: string
 * }} environment - Normalized environment configuration.
 * @returns {Promise<{
 *   workspaceRoot: string,
 *   applicationRoot: string,
 *   testsRoot: string,
 *   outputRoot: string,
 *   discoveryRoot: string,
 *   generatedRoot: string,
 *   executionRoot: string,
 *   reportsRoot: string,
 *   logsRoot: string
 * }>} The resolved and created filesystem layout.
 */
export async function bootstrapWorkspace(environment) {
  const paths = loadWorkspacePaths();
  const outputRoot = environment.outputDir;

  const resolvedPaths = {
    ...paths,
    outputRoot,
    discoveryRoot: path.resolve(outputRoot, "discovery"),
    generatedRoot: path.resolve(outputRoot, "generated"),
    executionRoot: path.resolve(outputRoot, "execution"),
    reportsRoot: path.resolve(outputRoot, "reports"),
    logsRoot: path.resolve(outputRoot, "logs")
  };

  await Promise.all(
    Object.values(resolvedPaths).map(async (targetPath) => {
      await fs.mkdir(targetPath, { recursive: true });
    })
  );

  return resolvedPaths;
}
