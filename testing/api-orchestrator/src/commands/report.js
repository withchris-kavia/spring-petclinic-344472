import path from "node:path";
import { loadEnvironmentConfig } from "../config/environment.js";
import { bootstrapWorkspace } from "../core/workspace-bootstrap.js";
import {
  readJsonArtifact,
  readTextArtifact,
  writeJsonArtifact,
  writeTextArtifact
} from "../core/artifacts.js";
import { runExecuteCommand } from "./execute.js";

function parseJsonLines(content) {
  return String(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      }
      catch {
        return [];
      }
    });
}

function summarizeLogs(logEntries) {
  const byEvent = {};
  const byLevel = {};

  for (const entry of logEntries) {
    if (entry.event) {
      byEvent[entry.event] = (byEvent[entry.event] ?? 0) + 1;
    }
    if (entry.level) {
      byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
    }
  }

  return {
    totalEntries: logEntries.length,
    byEvent,
    byLevel
  };
}

function buildFailureDigest(results) {
  return results
    .filter((result) => !result.passed)
    .map((result) => ({
      scenarioId: result.scenarioId,
      title: result.title,
      category: result.category,
      status: result.status,
      failingChecks: result.failureAnalysis?.failingChecks ?? [],
      probableCauses: result.failureAnalysis?.probableCauses ?? [],
      nextActions: result.failureAnalysis?.nextActions ?? []
    }));
}

function buildTopProbableCauses(failureDigest) {
  const counts = new Map();

  for (const failure of failureDigest) {
    for (const cause of failure.probableCauses) {
      counts.set(cause, (counts.get(cause) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([cause, count]) => ({ cause, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

function formatPercentage(value) {
  return `${(Number(value ?? 0) * 100).toFixed(2)}%`;
}

function buildMarkdownReport({
  executionSummary,
  logSummary,
  failureDigest,
  topProbableCauses,
  artifactPaths
}) {
  const summary = executionSummary.summary;
  const slowestRows = (summary.slowest ?? [])
    .map((item) => `| ${item.scenarioId} | ${item.category} | ${item.status} | ${item.maxLatencyMs} | ${item.avgLatencyMs} |`)
    .join("\n");
  const failureSections = failureDigest.length === 0
    ? "No scenario failures were recorded.\n"
    : failureDigest.map((failure) => [
      `### ${failure.scenarioId}`,
      "",
      `- Title: ${failure.title}`,
      `- Category: ${failure.category}`,
      `- Status: ${failure.status}`,
      `- Failing checks: ${failure.failingChecks.length > 0 ? failure.failingChecks.join("; ") : "None captured"}`,
      `- Probable causes: ${failure.probableCauses.length > 0 ? failure.probableCauses.join("; ") : "None captured"}`,
      `- Next actions: ${failure.nextActions.length > 0 ? failure.nextActions.join("; ") : "None captured"}`
    ].join("\n")).join("\n\n");
  const topCauseLines = topProbableCauses.length === 0
    ? "- No repeated probable causes were detected."
    : topProbableCauses.map((entry) => `- (${entry.count}) ${entry.cause}`).join("\n");

  return [
    "# API Orchestrator Execution Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Execution status: ${executionSummary.status}`,
    "",
    "## Summary",
    "",
    `- Selected scenarios: ${summary.selectedScenarioCount}`,
    `- Completed scenarios: ${summary.completedScenarioCount}`,
    `- Passed scenarios: ${summary.passedScenarioCount}`,
    `- Failed scenarios: ${summary.failedScenarioCount}`,
    `- Pass rate: ${formatPercentage(summary.passRate)}`,
    `- Duration: ${summary.durationMs}ms`,
    "",
    "## Structured Logs",
    "",
    `- Log file: ${artifactPaths.structuredLog}`,
    `- Total log entries: ${logSummary.totalEntries}`,
    `- Log levels: ${Object.entries(logSummary.byLevel).map(([level, count]) => `${level}=${count}`).join(", ") || "none"}`,
    "",
    "## Slowest Scenarios",
    "",
    "| Scenario ID | Category | Status | Max Latency (ms) | Avg Latency (ms) |",
    "|---|---|---|---:|---:|",
    slowestRows || "| n/a | n/a | n/a | 0 | 0 |",
    "",
    "## Frequent Probable Causes",
    "",
    topCauseLines,
    "",
    "## Failure Details",
    "",
    failureSections,
    "",
    "## Artifacts",
    "",
    `- Execution summary: ${artifactPaths.executionSummary}`,
    `- Scenario results: ${artifactPaths.scenarioResults}`,
    `- Structured log: ${artifactPaths.structuredLog}`,
    `- JSON report: ${artifactPaths.reportJson}`
  ].join("\n");
}

// PUBLIC_INTERFACE
/**
 * Builds structured JSON and Markdown reports from the latest execution artifacts and logs.
 * If execution artifacts are missing, the command runs execution first so reporting remains standalone.
 *
 * @returns {Promise<{
 *   command: string,
 *   status: string,
 *   artifactPaths: {
 *     executionSummary: string,
 *     scenarioResults: string,
 *     structuredLog: string,
 *     reportJson: string,
 *     reportMarkdown: string
 *   },
 *   summary: {
 *     selectedScenarioCount: number,
 *     completedScenarioCount: number,
 *     passedScenarioCount: number,
 *     failedScenarioCount: number,
 *     passRate: number
 *   }
 * }>} Reporting result with synthesized artifact paths and aggregate counts.
 */
export async function runReportCommand() {
  const environment = loadEnvironmentConfig();
  const paths = await bootstrapWorkspace(environment);
  const executionSummaryPath = path.resolve(paths.executionRoot, "execution-summary.json");
  const scenarioResultsPath = path.resolve(paths.executionRoot, "scenario-results.json");
  const structuredLogPath = path.resolve(paths.logsRoot, "execute-events.jsonl");
  const reportJsonPath = path.resolve(paths.reportsRoot, "report-index.json");
  const reportMarkdownPath = path.resolve(paths.reportsRoot, "report.md");

  try {
    await readJsonArtifact(executionSummaryPath);
    await readJsonArtifact(scenarioResultsPath);
    await readTextArtifact(structuredLogPath);
  }
  catch {
    await runExecuteCommand();
  }

  const [executionSummary, scenarioResults, logContent] = await Promise.all([
    readJsonArtifact(executionSummaryPath),
    readJsonArtifact(scenarioResultsPath),
    readTextArtifact(structuredLogPath)
  ]);

  const logEntries = parseJsonLines(logContent);
  const logSummary = summarizeLogs(logEntries);
  const filteredResults = environment.reportIncludePassed
    ? scenarioResults.results ?? []
    : (scenarioResults.results ?? []).filter((result) => !result.passed);
  const failureDigest = buildFailureDigest(scenarioResults.results ?? []);
  const topProbableCauses = buildTopProbableCauses(failureDigest);

  const reportPayload = {
    format: "report-index/v1",
    createdAt: new Date().toISOString(),
    executionStatus: executionSummary.status,
    summary: executionSummary.summary,
    logs: logSummary,
    failureDigest,
    topProbableCauses,
    includedScenarioResultCount: filteredResults.length,
    ci: {
      ready: true,
      suggestedExitCode: executionSummary.status === "ok" ? 0 : 1
    },
    artifactPaths: {
      executionSummary: executionSummaryPath,
      scenarioResults: scenarioResultsPath,
      structuredLog: structuredLogPath,
      reportMarkdown: reportMarkdownPath
    }
  };
  const markdownReport = buildMarkdownReport({
    executionSummary,
    logSummary,
    failureDigest,
    topProbableCauses,
    artifactPaths: {
      executionSummary: executionSummaryPath,
      scenarioResults: scenarioResultsPath,
      structuredLog: structuredLogPath,
      reportJson: reportJsonPath
    }
  });

  await writeJsonArtifact(reportJsonPath, reportPayload);
  await writeTextArtifact(reportMarkdownPath, `${markdownReport}\n`);

  return {
    command: "report",
    status: "ok",
    artifactPaths: {
      executionSummary: executionSummaryPath,
      scenarioResults: scenarioResultsPath,
      structuredLog: structuredLogPath,
      reportJson: reportJsonPath,
      reportMarkdown: reportMarkdownPath
    },
    summary: executionSummary.summary
  };
}
