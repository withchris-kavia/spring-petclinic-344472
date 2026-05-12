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

function parseList(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
 *   applicationRoot: string,
 *   targetBaseUrl: string,
 *   outputDir: string,
 *   timeoutMs: number,
 *   parallelism: number,
 *   headless: boolean,
 *   ignoreHttpsErrors: boolean,
 *   ciMode: boolean,
 *   failFast: boolean,
 *   followRedirects: boolean,
 *   scenarioFilter: string[],
 *   scenarioLimit: number | null,
 *   reportIncludePassed: boolean,
 *   mcpTransport: string,
 *   mcpServerCommand: string,
 *   mcpServerArgs: string[],
 *   discoveryAllowRemote: boolean,
 *   apiSpecCandidatePaths: string[],
 *   apiSpecCandidateUrls: string[],
 *   controllerSourceRoots: string[]
 * }} Normalized orchestration and discovery environment settings.
 */
export function loadEnvironmentConfig() {
  const workspaceRoot = getWorkspaceRoot();
  const applicationRoot = path.resolve(workspaceRoot, "..", "..");
  const outputDir = process.env.API_TEST_OUTPUT_DIR ?? "./artifacts";
  const targetBaseUrl = process.env.API_TEST_TARGET_BASE_URL ?? "http://127.0.0.1:8080";
  const normalizedBaseUrl = targetBaseUrl.replace(/\/$/, "");
  const ciMode = parseBoolean(process.env.CI, false);

  return {
    applicationRoot,
    targetBaseUrl,
    outputDir: path.resolve(workspaceRoot, outputDir),
    timeoutMs: parseInteger(process.env.API_TEST_TIMEOUT_MS, 30_000),
    parallelism: Math.max(parseInteger(process.env.API_TEST_PARALLELISM, ciMode ? 4 : 2), 1),
    headless: parseBoolean(process.env.API_TEST_HEADLESS, true),
    ignoreHttpsErrors: parseBoolean(process.env.API_TEST_IGNORE_HTTPS_ERRORS, false),
    ciMode,
    failFast: parseBoolean(process.env.API_TEST_FAIL_FAST, false),
    followRedirects: parseBoolean(process.env.API_TEST_FOLLOW_REDIRECTS, true),
    scenarioFilter: parseList(process.env.API_TEST_SCENARIO_FILTER, []),
    scenarioLimit: (() => {
      const parsed = parseInteger(process.env.API_TEST_SCENARIO_LIMIT, 0);
      return parsed > 0 ? parsed : null;
    })(),
    reportIncludePassed: parseBoolean(process.env.API_TEST_REPORT_INCLUDE_PASSED, !ciMode),
    mcpTransport: process.env.API_TEST_MCP_TRANSPORT ?? "stdio",
    mcpServerCommand: process.env.API_TEST_MCP_SERVER_COMMAND ?? "",
    mcpServerArgs: (process.env.API_TEST_MCP_SERVER_ARGS ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean),
    discoveryAllowRemote: parseBoolean(process.env.API_TEST_DISCOVERY_ALLOW_REMOTE, true),
    apiSpecCandidatePaths: parseList(process.env.API_TEST_OPENAPI_PATHS, [
      path.resolve(applicationRoot, "openapi.json"),
      path.resolve(applicationRoot, "swagger.json"),
      path.resolve(applicationRoot, "src", "main", "resources", "static", "openapi.json"),
      path.resolve(applicationRoot, "src", "main", "resources", "static", "swagger.json")
    ]),
    apiSpecCandidateUrls: parseList(process.env.API_TEST_OPENAPI_URLS, [
      `${normalizedBaseUrl}/v3/api-docs`,
      `${normalizedBaseUrl}/swagger.json`,
      `${normalizedBaseUrl}/v2/api-docs`,
      `${normalizedBaseUrl}/openapi.json`
    ]),
    controllerSourceRoots: parseList(process.env.API_TEST_CONTROLLER_SOURCE_ROOTS, [
      path.resolve(applicationRoot, "src", "main", "java")
    ])
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
