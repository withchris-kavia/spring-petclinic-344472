import path from "node:path";
import { fileURLToPath } from "node:url";

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseInteger(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getWorkspaceRoot() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirectory = path.dirname(currentFilePath);
  return path.resolve(currentDirectory, "..", "..");
}

// PUBLIC_INTERFACE
/**
 * Loads normalized configuration for the API testing orchestration workspace from environment variables.
 *
 * @returns {{
 *   targetBaseUrl: string,
 *   outputDir: string,
 *   timeoutMs: number,
 *   parallelism: number,
 *   headless: boolean,
 *   ignoreHttpsErrors: boolean,
 *   mcpTransport: string,
 *   mcpServerCommand: string,
 *   mcpServerArgs: string[]
 * }} Normalized orchestration environment settings.
 */
export function loadEnvironmentConfig() {
  const workspaceRoot = getWorkspaceRoot();
  const outputDir = process.env.API_TEST_OUTPUT_DIR ?? "./artifacts";

  return {
    targetBaseUrl: process.env.API_TEST_TARGET_BASE_URL ?? "http://127.0.0.1:8080",
    outputDir: path.resolve(workspaceRoot, outputDir),
    timeoutMs: parseInteger(process.env.API_TEST_TIMEOUT_MS, 30_000),
    parallelism: Math.max(parseInteger(process.env.API_TEST_PARALLELISM, 2), 1),
    headless: parseBoolean(process.env.API_TEST_HEADLESS, true),
    ignoreHttpsErrors: parseBoolean(process.env.API_TEST_IGNORE_HTTPS_ERRORS, false),
    mcpTransport: process.env.API_TEST_MCP_TRANSPORT ?? "stdio",
    mcpServerCommand: process.env.API_TEST_MCP_SERVER_COMMAND ?? "",
    mcpServerArgs: (process.env.API_TEST_MCP_SERVER_ARGS ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

// PUBLIC_INTERFACE
/**
 * Resolves the important filesystem paths used by the orchestration workspace.
 *
 * @returns {{
 *   workspaceRoot: string,
 *   applicationRoot: string,
 *   testsRoot: string
 * }} Key workspace-relative and application-relative paths.
 */
export function loadWorkspacePaths() {
  const workspaceRoot = getWorkspaceRoot();

  return {
    workspaceRoot,
    applicationRoot: path.resolve(workspaceRoot, "..", ".."),
    testsRoot: path.resolve(workspaceRoot, "tests")
  };
}
