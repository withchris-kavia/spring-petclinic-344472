import { request as playwrightRequest } from "@playwright/test";
import { evaluateSmartAssertions } from "../../core/smart-assertions.js";
import { analyzeScenarioFailure } from "../../core/failure-analysis.js";
import { buildMcpHookEnvelope } from "../mcp/descriptor.js";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function replacePlaceholdersInString(value, missingEnvironmentVariables) {
  return String(value).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    const replacement = process.env[key];

    if (replacement === undefined) {
      missingEnvironmentVariables.add(key);
      return `{{${key}}}`;
    }

    return replacement;
  });
}

function resolveTemplateValue(value, missingEnvironmentVariables) {
  if (typeof value === "string") {
    return replacePlaceholdersInString(value, missingEnvironmentVariables);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, missingEnvironmentVariables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        resolveTemplateValue(nestedValue, missingEnvironmentVariables)
      ])
    );
  }

  return value;
}

function sanitizeValue(value, keyName = "") {
  if (typeof value === "string") {
    if (/authorization|cookie|token|secret|password|api[-_]?key/i.test(keyName)) {
      return "[REDACTED]";
    }

    return value.length > 800 ? `${value.slice(0, 800)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyName));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeValue(nestedValue, key)])
    );
  }

  return value;
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)])
  );
}

function resolvePathTemplate(pathTemplate, pathParameters = {}) {
  let resolved = pathTemplate;

  for (const [key, value] of Object.entries(pathParameters)) {
    resolved = resolved.replace(
      new RegExp(`\\{${key}\\}`, "g"),
      encodeURIComponent(String(value))
    );
  }

  return resolved;
}

function buildCookieHeader(cookies = {}) {
  const entries = Object.entries(cookies).filter(([, value]) => value !== undefined && value !== null && value !== "");

  if (entries.length === 0) {
    return null;
  }

  return entries.map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`).join("; ");
}

function buildRequestOptions({ scenario, environment, missingEnvironmentVariables }) {
  const requestTemplate = scenario.requestTemplate ?? {};
  const resolvedPathParameters = resolveTemplateValue(
    clone(requestTemplate.pathParameters ?? {}),
    missingEnvironmentVariables
  );
  const resolvedQuery = resolveTemplateValue(clone(requestTemplate.query ?? {}), missingEnvironmentVariables);
  const resolvedHeaders = resolveTemplateValue(clone(requestTemplate.headers ?? {}), missingEnvironmentVariables);
  const resolvedCookies = resolveTemplateValue(clone(requestTemplate.cookies ?? {}), missingEnvironmentVariables);
  const resolvedBody = resolveTemplateValue(clone(requestTemplate.body), missingEnvironmentVariables);
  const bindingStyle = requestTemplate.bindingStyle ?? "none";
  const method = requestTemplate.method ?? scenario.endpointRef?.method ?? "GET";
  const path = resolvePathTemplate(requestTemplate.path ?? scenario.endpointRef?.path ?? "/", resolvedPathParameters);
  const contentType = String(
    resolvedHeaders["content-type"] ??
    resolvedHeaders["Content-Type"] ??
    ""
  ).toLowerCase();

  const headers = normalizeHeaders(resolvedHeaders);
  const cookieHeader = buildCookieHeader(resolvedCookies);

  if (cookieHeader) {
    headers.cookie = headers.cookie ? `${headers.cookie}; ${cookieHeader}` : cookieHeader;
  }

  const options = {
    method,
    failOnStatusCode: false,
    timeout: scenario.executionHints?.timeoutMs ?? environment.timeoutMs,
    maxRedirects: environment.followRedirects ? 10 : 0,
    headers,
    params: resolvedQuery
  };

  if (resolvedBody !== null && resolvedBody !== undefined) {
    if (contentType.includes("application/x-www-form-urlencoded") || bindingStyle === "spring-model-attribute") {
      options.form = resolvedBody;
    }
    else if (contentType.includes("multipart/form-data")) {
      options.multipart = resolvedBody;
    }
    else {
      options.data = resolvedBody;
    }
  }

  return {
    path,
    options,
    requestSnapshot: {
      method,
      path,
      pathParameters: sanitizeValue(resolvedPathParameters),
      query: sanitizeValue(resolvedQuery),
      headers: sanitizeValue(headers),
      cookies: sanitizeValue(resolvedCookies),
      body: sanitizeValue(resolvedBody),
      bindingStyle,
      missingEnvironmentVariables: Array.from(missingEnvironmentVariables)
    }
  };
}

async function executeInvocation({
  requestContext,
  scenario,
  endpoint,
  environment,
  mcpDescriptor,
  logEvent,
  invocationIndex
}) {
  const missingEnvironmentVariables = new Set();
  const startedAt = new Date().toISOString();
  const invocationStartMs = Date.now();
  const prepared = buildRequestOptions({
    scenario,
    environment,
    missingEnvironmentVariables
  });

  await logEvent({
    timestamp: startedAt,
    level: "info",
    component: "playwright-runtime",
    event: "pre_request",
    scenarioId: scenario.id,
    endpointId: endpoint?.id ?? scenario.endpointId,
    invocationIndex,
    request: prepared.requestSnapshot
  });

  await logEvent(buildMcpHookEnvelope({
    descriptor: mcpDescriptor,
    stage: "pre_request",
    scenario,
    status: "emitted",
    detail: {
      invocationIndex,
      request: prepared.requestSnapshot
    }
  }));

  try {
    const response = await requestContext.fetch(prepared.path, prepared.options);
    const bodyText = await response.text();
    const latencyMs = Date.now() - invocationStartMs;
    const responseSnapshot = {
      url: typeof response.url === "function" ? response.url() : `${environment.targetBaseUrl}${prepared.path}`,
      status: response.status(),
      headers: response.headers(),
      bodyText,
      latencyMs
    };
    const assertionResult = evaluateSmartAssertions({
      assertionProfile: scenario.assertions,
      responseSnapshot
    });
    const failureAnalysis = assertionResult.passed
      ? null
      : analyzeScenarioFailure({
        endpoint,
        scenario,
        assertionProfile: scenario.assertions,
        assertionResult,
        responseSnapshot,
        error: null
      });

    await logEvent({
      timestamp: new Date().toISOString(),
      level: assertionResult.passed ? "info" : "warn",
      component: "playwright-runtime",
      event: "post_response",
      scenarioId: scenario.id,
      endpointId: endpoint?.id ?? scenario.endpointId,
      invocationIndex,
      response: {
        status: responseSnapshot.status,
        latencyMs: responseSnapshot.latencyMs,
        headers: sanitizeValue(responseSnapshot.headers),
        bodyPreview: sanitizeValue(bodyText)
      },
      passed: assertionResult.passed
    });

    await logEvent(buildMcpHookEnvelope({
      descriptor: mcpDescriptor,
      stage: "post_response",
      scenario,
      status: assertionResult.passed ? "ok" : "needs_attention",
      detail: {
        invocationIndex,
        responseStatus: responseSnapshot.status,
        latencyMs: responseSnapshot.latencyMs,
        passed: assertionResult.passed
      }
    }));

    return {
      status: assertionResult.passed ? "passed" : "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      requestSnapshot: prepared.requestSnapshot,
      responseSnapshot: {
        ...responseSnapshot,
        headers: sanitizeValue(responseSnapshot.headers),
        bodyPreview: sanitizeValue(bodyText)
      },
      assertionResult,
      failureAnalysis
    };
  }
  catch (error) {
    const latencyMs = Date.now() - invocationStartMs;
    const failureAnalysis = analyzeScenarioFailure({
      endpoint,
      scenario,
      assertionProfile: scenario.assertions,
      assertionResult: {
        passed: false,
        checks: [
          {
            name: "playwright_execution",
            passed: false,
            details: error.message
          }
        ]
      },
      responseSnapshot: {
        status: 0,
        headers: {},
        latencyMs
      },
      error
    });

    await logEvent({
      timestamp: new Date().toISOString(),
      level: "error",
      component: "playwright-runtime",
      event: "scenario_error",
      scenarioId: scenario.id,
      endpointId: endpoint?.id ?? scenario.endpointId,
      invocationIndex,
      error: {
        message: error.message
      }
    });

    await logEvent(buildMcpHookEnvelope({
      descriptor: mcpDescriptor,
      stage: "scenario_failure",
      scenario,
      status: "error",
      detail: {
        invocationIndex,
        error: error.message
      }
    }));

    return {
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      requestSnapshot: prepared.requestSnapshot,
      responseSnapshot: {
        status: 0,
        headers: {},
        bodyPreview: "",
        latencyMs
      },
      assertionResult: {
        passed: false,
        checks: [
          {
            name: "playwright_execution",
            passed: false,
            details: error.message
          }
        ],
        parsedBody: null
      },
      failureAnalysis
    };
  }
}

// PUBLIC_INTERFACE
/**
 * Builds a serializable Playwright runtime descriptor for the current workspace environment.
 *
 * @param {{
 *   targetBaseUrl: string,
 *   timeoutMs: number,
 *   parallelism: number,
 *   headless: boolean,
 *   ignoreHttpsErrors: boolean,
 *   ciMode: boolean,
 *   followRedirects: boolean
 * }} environment - Normalized environment configuration.
 * @returns {{
 *   targetBaseUrl: string,
 *   timeoutMs: number,
 *   parallelism: number,
 *   headless: boolean,
 *   ignoreHttpsErrors: boolean,
 *   ciMode: boolean,
 *   followRedirects: boolean
 * }} Baseline Playwright execution settings.
 */
export function buildPlaywrightRuntimeDescriptor(environment) {
  return {
    targetBaseUrl: environment.targetBaseUrl,
    timeoutMs: environment.timeoutMs,
    parallelism: environment.parallelism,
    headless: environment.headless,
    ignoreHttpsErrors: environment.ignoreHttpsErrors,
    ciMode: environment.ciMode,
    followRedirects: environment.followRedirects
  };
}

// PUBLIC_INTERFACE
/**
 * Creates a Playwright API request context for orchestrated HTTP execution.
 *
 * @param {{
 *   targetBaseUrl: string,
 *   ignoreHttpsErrors: boolean
 * }} environment - Normalized environment configuration.
 * @returns {Promise<import("@playwright/test").APIRequestContext>} Configured Playwright request context.
 */
export async function createPlaywrightRequestContext(environment) {
  return playwrightRequest.newContext({
    baseURL: environment.targetBaseUrl,
    ignoreHTTPSErrors: environment.ignoreHttpsErrors,
    extraHTTPHeaders: {
      "user-agent": "spring-petclinic-api-orchestrator/0.1.0",
      "x-api-orchestrator": "playwright-runtime"
    }
  });
}

// PUBLIC_INTERFACE
/**
 * Executes a generated scenario with the Playwright API runtime, including assertion evaluation,
 * latency capture, and structured failure analysis.
 *
 * @param {{
 *   requestContext: import("@playwright/test").APIRequestContext,
 *   environment: ReturnType<typeof buildPlaywrightRuntimeDescriptor> & Record<string, any>,
 *   scenario: Record<string, any>,
 *   endpoint?: Record<string, any>,
 *   mcpDescriptor: Record<string, any>,
 *   logEvent: (event: Record<string, any>) => Promise<void>
 * }} input - Runtime dependencies, scenario metadata, and logging callback.
 * @returns {Promise<{
 *   scenarioId: string,
 *   endpointId: string | null,
 *   title: string,
 *   category: string,
 *   type: string,
 *   status: "passed" | "failed" | "error",
 *   passed: boolean,
 *   startedAt: string,
 *   finishedAt: string,
 *   durationMs: number,
 *   invocationSummary: {
 *     count: number,
 *     concurrency: number,
 *     iterationCount: number,
 *     avgLatencyMs: number,
 *     maxLatencyMs: number
 *   },
 *   request: Record<string, any>,
 *   response: Record<string, any>,
 *   assertionResult: Record<string, any>,
 *   failureAnalysis: Record<string, any> | null,
 *   invocationResults: Array<Record<string, any>>
 * }>} Structured scenario execution result.
 */
export async function executeScenarioWithPlaywright({
  requestContext,
  environment,
  scenario,
  endpoint,
  mcpDescriptor,
  logEvent
}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const invocationCount = Math.max(
    1,
    (scenario.executionHints?.iterationCount ?? 1) * (scenario.executionHints?.concurrency ?? 1)
  );
  const invocationIndexes = Array.from({ length: invocationCount }, (_, index) => index);

  const invocationResults = await Promise.all(
    invocationIndexes.map((invocationIndex) => executeInvocation({
      requestContext,
      scenario,
      endpoint,
      environment,
      mcpDescriptor,
      logEvent,
      invocationIndex
    }))
  );

  const representativeResult = invocationResults.find((result) => result.status !== "passed") ?? invocationResults[0];
  const latencies = invocationResults
    .map((result) => result.responseSnapshot?.latencyMs ?? 0)
    .filter((latency) => Number.isFinite(latency));
  const maxLatencyMs = latencies.length > 0 ? Math.max(...latencies) : 0;
  const avgLatencyMs = latencies.length > 0
    ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length)
    : 0;
  const status = invocationResults.some((result) => result.status === "error")
    ? "error"
    : invocationResults.every((result) => result.status === "passed")
      ? "passed"
      : "failed";

  return {
    scenarioId: scenario.id,
    endpointId: endpoint?.id ?? scenario.endpointId ?? null,
    title: scenario.title,
    category: scenario.category,
    type: scenario.type,
    status,
    passed: status === "passed",
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    invocationSummary: {
      count: invocationCount,
      concurrency: scenario.executionHints?.concurrency ?? 1,
      iterationCount: scenario.executionHints?.iterationCount ?? 1,
      avgLatencyMs,
      maxLatencyMs
    },
    request: representativeResult?.requestSnapshot ?? {},
    response: representativeResult?.responseSnapshot ?? {},
    assertionResult: representativeResult?.assertionResult ?? {
      passed: false,
      checks: [],
      parsedBody: null
    },
    failureAnalysis: representativeResult?.failureAnalysis ?? null,
    invocationResults: invocationResults.map((result) => ({
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      response: result.responseSnapshot,
      checks: result.assertionResult?.checks ?? []
    }))
  };
}
