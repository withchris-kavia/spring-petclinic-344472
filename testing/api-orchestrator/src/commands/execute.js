import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import {
  appendJsonLinesArtifact,
  readJsonArtifact,
  writeJsonArtifact,
  writeTextArtifact
} from "../core/artifacts.js";
import { runGenerateCommand } from "./generate.js";
import { buildMcpHookEnvelope, buildMcpServerDescriptor } from "../adapters/mcp/descriptor.js";
import {
  buildPlaywrightRuntimeDescriptor,
  createPlaywrightRequestContext,
  executeScenarioWithPlaywright
} from "../adapters/playwright/runtime.js";

function buildEndpointMap(catalog) {
  return new Map((catalog.endpoints ?? []).map((endpoint) => [endpoint.id, endpoint]));
}

function matchesScenarioFilter(scenario, filterTerms) {
  if (filterTerms.length === 0) {
    return true;
  }

  const searchable = [
    scenario.id,
    scenario.title,
    scenario.category,
    scenario.type,
    ...(scenario.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return filterTerms.some((term) => searchable.includes(term.toLowerCase()));
}

function selectScenarios(generated, environment) {
  const filtered = (generated.scenarios ?? []).filter((scenario) =>
    matchesScenarioFilter(scenario, environment.scenarioFilter)
  );

  if (environment.scenarioLimit) {
    return filtered.slice(0, environment.scenarioLimit);
  }

  return filtered;
}

function partitionScenarios(scenarios, manifest) {
  const serialIds = new Set(manifest?.execution?.serialScenarioIds ?? []);
  const serial = [];
  const parallel = [];

  for (const scenario of scenarios) {
    if (serialIds.has(scenario.id) || scenario.executionHints?.parallelizable === false) {
      serial.push(scenario);
    }
    else {
      parallel.push(scenario);
    }
  }

  return { serial, parallel };
}

function summarizeResults(results, selectedScenarioCount, durationMs) {
  const byStatus = {};
  const byCategory = {};
  const byType = {};
  const slowest = [...results]
    .sort((left, right) => (right.invocationSummary?.maxLatencyMs ?? 0) - (left.invocationSummary?.maxLatencyMs ?? 0))
    .slice(0, 10)
    .map((result) => ({
      scenarioId: result.scenarioId,
      title: result.title,
      category: result.category,
      status: result.status,
      maxLatencyMs: result.invocationSummary?.maxLatencyMs ?? 0,
      avgLatencyMs: result.invocationSummary?.avgLatencyMs ?? 0
    }));

  for (const result of results) {
    byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
    byType[result.type] = (byType[result.type] ?? 0) + 1;

    byCategory[result.category] = byCategory[result.category] ?? {
      passed: 0,
      failed: 0,
      error: 0
    };
    byCategory[result.category][result.status] = (byCategory[result.category][result.status] ?? 0) + 1;
  }

  const passed = byStatus.passed ?? 0;
  const failed = (byStatus.failed ?? 0) + (byStatus.error ?? 0);

  return {
    selectedScenarioCount,
    completedScenarioCount: results.length,
    passedScenarioCount: passed,
    failedScenarioCount: failed,
    passRate: selectedScenarioCount > 0 ? Number((passed / selectedScenarioCount).toFixed(4)) : 0,
    durationMs,
    byStatus,
    byCategory,
    byType,
    slowest
  };
}

async function runWithConcurrency(items, concurrency, worker, shouldStop) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function runner() {
    while (currentIndex < items.length && !shouldStop()) {
      const scenarioIndex = currentIndex;
      currentIndex += 1;
      results[scenarioIndex] = await worker(items[scenarioIndex], scenarioIndex);
    }
  }

  const runnerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: runnerCount }, () => runner()));

  return results.filter(Boolean);
}

// PUBLIC_INTERFACE
/**
 * Executes generated scenarios through the Playwright API runtime, emits MCP hook events,
 * and writes structured execution artifacts, logs, and summaries for CI/local workflows.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPaths: {
 *     discoveryCatalog: string,
 *     scenarios: string,
 *     manifest: string,
 *     executionPlan: string,
 *     scenarioResults: string,
 *     executionSummary: string,
 *     structuredLog: string
 *   },
 *   summary: {
 *     selectedScenarioCount: number,
 *     completedScenarioCount: number,
 *     passedScenarioCount: number,
 *     failedScenarioCount: number,
 *     passRate: number,
 *     durationMs: number,
 *     byStatus: Record<string, number>
 *   }
 * }>} Execution result with artifact locations and aggregate outcomes.
 */
export async function runExecuteCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const discoveryArtifactPath = path.resolve(paths.discoveryRoot, "api-catalog.json");
  const scenarioArtifactPath = path.resolve(paths.generatedRoot, "generated-scenarios.json");
  const manifestArtifactPath = path.resolve(paths.generatedRoot, "scenario-manifest.json");
  const executionPlanPath = path.resolve(paths.executionRoot, "execution-plan.json");
  const scenarioResultsPath = path.resolve(paths.executionRoot, "scenario-results.json");
  const executionSummaryPath = path.resolve(paths.executionRoot, "execution-summary.json");
  const structuredLogPath = path.resolve(paths.logsRoot, "execute-events.jsonl");

  try {
    await readJsonArtifact(scenarioArtifactPath);
    await readJsonArtifact(manifestArtifactPath);
    await readJsonArtifact(discoveryArtifactPath);
  }
  catch {
    await runGenerateCommand();
  }

  const [catalog, generated, manifest] = await Promise.all([
    readJsonArtifact(discoveryArtifactPath),
    readJsonArtifact(scenarioArtifactPath),
    readJsonArtifact(manifestArtifactPath)
  ]);

  const endpointMap = buildEndpointMap(catalog);
  const selectedScenarios = selectScenarios(generated, environment);
  const playwrightDescriptor = buildPlaywrightRuntimeDescriptor(environment);
  const mcpDescriptor = buildMcpServerDescriptor(environment);
  const { serial, parallel } = partitionScenarios(selectedScenarios, manifest);
  const executionPlan = {
    command: "execute",
    createdAt: new Date().toISOString(),
    targetBaseUrl: environment.targetBaseUrl,
    ciMode: environment.ciMode,
    selection: {
      requestedScenarioCount: generated.scenarios?.length ?? 0,
      selectedScenarioCount: selectedScenarios.length,
      filterTerms: environment.scenarioFilter,
      limit: environment.scenarioLimit
    },
    execution: {
      serialScenarioIds: serial.map((scenario) => scenario.id),
      parallelScenarioIds: parallel.map((scenario) => scenario.id),
      workerCount: environment.parallelism,
      failFast: environment.failFast
    },
    playwright: playwrightDescriptor,
    mcp: mcpDescriptor,
    artifactInputs: {
      discoveryCatalog: discoveryArtifactPath,
      scenarios: scenarioArtifactPath,
      manifest: manifestArtifactPath
    }
  };

  await writeJsonArtifact(executionPlanPath, executionPlan);
  await writeTextArtifact(structuredLogPath, "");

  const startedAt = new Date().toISOString();
  const executionStartedMs = Date.now();
  let stopRequested = false;

  async function logEvent(event) {
    await appendJsonLinesArtifact(structuredLogPath, event);
  }

  await logEvent({
    timestamp: startedAt,
    level: "info",
    component: "execute-command",
    event: "execution_started",
    selectedScenarioCount: selectedScenarios.length,
    parallelWorkerCount: environment.parallelism
  });

  await logEvent(buildMcpHookEnvelope({
    descriptor: mcpDescriptor,
    stage: "execution_started",
    status: "emitted",
    detail: {
      selectedScenarioCount: selectedScenarios.length,
      parallelWorkerCount: environment.parallelism
    }
  }));

  if (selectedScenarios.length === 0) {
    const summary = summarizeResults([], 0, 0);

    await writeJsonArtifact(scenarioResultsPath, {
      format: "scenario-results/v1",
      createdAt: new Date().toISOString(),
      plan: executionPlan,
      results: []
    });
    await writeJsonArtifact(executionSummaryPath, {
      format: "execution-summary/v1",
      createdAt: new Date().toISOString(),
      status: "empty",
      summary
    });

    await logEvent({
      timestamp: new Date().toISOString(),
      level: "warn",
      component: "execute-command",
      event: "execution_finished",
      status: "empty",
      summary
    });

    return {
      command: "execute",
      status: "empty",
      artifactPaths: {
        discoveryCatalog: discoveryArtifactPath,
        scenarios: scenarioArtifactPath,
        manifest: manifestArtifactPath,
        executionPlan: executionPlanPath,
        scenarioResults: scenarioResultsPath,
        executionSummary: executionSummaryPath,
        structuredLog: structuredLogPath
      },
      summary
    };
  }

  const requestContext = await createPlaywrightRequestContext(environment);
  const results = [];

  async function executeSingleScenario(scenario, queueIndex, queueType) {
    const endpoint = endpointMap.get(scenario.endpointId);
    const queuedAt = new Date().toISOString();

    await logEvent({
      timestamp: queuedAt,
      level: "info",
      component: "execute-command",
      event: "scenario_started",
      queueType,
      queueIndex,
      scenarioId: scenario.id,
      endpointId: scenario.endpointId,
      category: scenario.category,
      type: scenario.type,
      title: scenario.title
    });

    await logEvent(buildMcpHookEnvelope({
      descriptor: mcpDescriptor,
      stage: "scenario_started",
      scenario,
      status: "emitted",
      detail: {
        queueType,
        queueIndex
      }
    }));

    const result = await executeScenarioWithPlaywright({
      requestContext,
      environment,
      scenario,
      endpoint,
      mcpDescriptor,
      logEvent
    });

    await logEvent({
      timestamp: new Date().toISOString(),
      level: result.passed ? "info" : result.status === "error" ? "error" : "warn",
      component: "execute-command",
      event: "scenario_finished",
      queueType,
      queueIndex,
      scenarioId: scenario.id,
      endpointId: scenario.endpointId,
      status: result.status,
      durationMs: result.durationMs,
      maxLatencyMs: result.invocationSummary.maxLatencyMs,
      failingChecks: result.failureAnalysis?.failingChecks ?? []
    });

    await logEvent(buildMcpHookEnvelope({
      descriptor: mcpDescriptor,
      stage: result.passed ? "scenario_finished" : "scenario_failure",
      scenario,
      status: result.status,
      detail: {
        durationMs: result.durationMs,
        maxLatencyMs: result.invocationSummary.maxLatencyMs
      }
    }));

    if (!result.passed && environment.failFast) {
      stopRequested = true;
    }

    return result;
  }

  try {
    for (const [index, scenario] of serial.entries()) {
      if (stopRequested) {
        break;
      }

      results.push(await executeSingleScenario(scenario, index, "serial"));
    }

    if (!stopRequested) {
      const parallelResults = await runWithConcurrency(
        parallel,
        environment.parallelism,
        (scenario, index) => executeSingleScenario(scenario, index, "parallel"),
        () => stopRequested
      );
      results.push(...parallelResults);
    }
  }
  finally {
    await requestContext.dispose();
  }

  const summary = summarizeResults(results, selectedScenarios.length, Date.now() - executionStartedMs);
  const status = summary.failedScenarioCount > 0 ? "failed" : "ok";
  const resultPayload = {
    format: "scenario-results/v1",
    createdAt: new Date().toISOString(),
    targetBaseUrl: environment.targetBaseUrl,
    plan: executionPlan,
    results
  };
  const summaryPayload = {
    format: "execution-summary/v1",
    createdAt: new Date().toISOString(),
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    summary,
    artifactPaths: {
      executionPlan: executionPlanPath,
      scenarioResults: scenarioResultsPath,
      structuredLog: structuredLogPath
    }
  };

  await writeJsonArtifact(scenarioResultsPath, resultPayload);
  await writeJsonArtifact(executionSummaryPath, summaryPayload);

  await logEvent({
    timestamp: new Date().toISOString(),
    level: status === "ok" ? "info" : "warn",
    component: "execute-command",
    event: "execution_finished",
    status,
    summary
  });

  await logEvent(buildMcpHookEnvelope({
    descriptor: mcpDescriptor,
    stage: "execution_finished",
    status,
    detail: summary
  }));

  return {
    command: "execute",
    status,
    artifactPaths: {
      discoveryCatalog: discoveryArtifactPath,
      scenarios: scenarioArtifactPath,
      manifest: manifestArtifactPath,
      executionPlan: executionPlanPath,
      scenarioResults: scenarioResultsPath,
      executionSummary: executionSummaryPath,
      structuredLog: structuredLogPath
    },
    summary
  };
}
