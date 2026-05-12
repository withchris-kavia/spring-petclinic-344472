function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferCommonCauses(endpoint, scenarioCategory) {
  const causes = [
    "Discovery metadata may not fully represent runtime validation or templating behavior.",
    "The target application may require seed data or state setup that the scenario did not provide."
  ];

  if (scenarioCategory === "positive") {
    causes.push(
      "Happy-path fixture values may not satisfy server-side validation constraints.",
      "The route may redirect to a login page, confirmation page, or HTML form flow instead of returning the inferred success shape."
    );
  }

  if (scenarioCategory === "negative") {
    causes.push(
      "The API may normalize invalid identifiers instead of rejecting them with a 4xx status.",
      "Path or query placeholders may need realistic entity references to reach the intended code path."
    );
  }

  if (scenarioCategory === "validation") {
    causes.push(
      "Spring model binding or OpenAPI schema validation may be more permissive than expected.",
      "Form-oriented routes may re-render HTML with inline validation messages rather than returning JSON errors."
    );
  }

  if (scenarioCategory === "authentication") {
    causes.push(
      "The application may use session redirects, CSRF enforcement, or HTML login pages instead of 401 JSON responses.",
      "Auth may be enforced upstream by a proxy, gateway, or Spring security filter not visible in discovery metadata."
    );
  }

  if (scenarioCategory === "security") {
    causes.push(
      "Input sanitization may defer to persistence or template rendering layers, surfacing only under specific payloads.",
      "The server may convert suspicious payloads into validation errors instead of explicit security-denial responses."
    );
  }

  if (scenarioCategory === "edge_case") {
    causes.push(
      "Boundary values may trigger implicit defaults, truncation, or HTML fallback behavior.",
      "Large or unicode inputs may expose encoding, routing, or template-rendering assumptions."
    );
  }

  if (scenarioCategory === "performance") {
    causes.push(
      "The target service may be warming caches, compiling templates, or opening DB connections on first request.",
      "Parallel execution may amplify contention in the database, session store, or template engine."
    );
  }

  if (endpoint.request?.bindingStyle === "spring-model-attribute") {
    causes.push("The route likely expects HTML form fields or multipart data rather than raw JSON.");
  }

  if (endpoint.response?.kind === "html-redirect") {
    causes.push("Redirect-oriented MVC handlers may require following the redirect chain before asserting on the terminal response.");
  }

  return uniqueStrings(causes);
}

function inferDiagnosticChecks(endpoint, assertionProfile) {
  const checks = [
    "Compare the runtime response status, headers, and body against the generated assertion profile.",
    "Verify that the resolved URL and substituted path parameters match the discovered route shape."
  ];

  if (assertionProfile.body.parseAsJson) {
    checks.push("Inspect whether the response body is actually JSON or an HTML error page wrapped in a 200/302 response.");
  }

  if (endpoint.auth?.required) {
    checks.push("Verify token, session, or CSRF setup before classifying the failure as a product defect.");
  }

  if (endpoint.request?.hasBody) {
    checks.push("Inspect request content-type and payload structure to confirm the binding style matches route expectations.");
  }

  if (endpoint.classification?.interactionType === "web") {
    checks.push("Check whether the scenario hit an MVC template flow that expects browser-driven navigation rather than API semantics.");
  }

  return uniqueStrings(checks);
}

// PUBLIC_INTERFACE
/**
 * Builds reusable failure-triage guidance for a generated scenario so downstream execution
 * and reporting can attach actionable remediation hints to assertion failures.
 *
 * @param {{
 *   endpoint: Record<string, any>,
 *   scenario: Record<string, any>,
 *   assertionProfile: Record<string, any>
 * }} input - Endpoint metadata, generated scenario, and smart assertion profile.
 * @returns {{
 *   severity: "low" | "medium" | "high",
 *   commonCauses: string[],
 *   diagnosticChecks: string[],
 *   remediationHints: string[]
 * }} Structured failure-analysis guide for the scenario.
 */
export function buildFailureAnalysisGuide({ endpoint, scenario, assertionProfile }) {
  const remediationHints = [
    "Re-run the scenario with request/response capture enabled and compare against generated fixtures.",
    "If the route is MVC-oriented, validate the response after redirects or browser form submission rather than treating it as a pure JSON API."
  ];

  if (scenario.category === "authentication") {
    remediationHints.push("Capture login redirects, CSRF tokens, or session cookies before concluding the endpoint is unauthenticated.");
  }

  if (scenario.category === "performance") {
    remediationHints.push("Compare cold-start latency against warmed runs to distinguish infrastructure overhead from endpoint slowness.");
  }

  if (scenario.category === "security") {
    remediationHints.push("Review server logs for validation, sanitizer, template, or persistence-layer exceptions caused by injected payloads.");
  }

  return {
    severity: scenario.category === "performance" || scenario.category === "security" ? "high" : "medium",
    commonCauses: inferCommonCauses(endpoint, scenario.category),
    diagnosticChecks: inferDiagnosticChecks(endpoint, assertionProfile),
    remediationHints: uniqueStrings(remediationHints)
  };
}

// PUBLIC_INTERFACE
/**
 * Analyzes a concrete execution failure and converts it into high-signal probable causes
 * and next steps for humans or later reporting stages.
 *
 * @param {{
 *   endpoint: Record<string, any>,
 *   scenario: Record<string, any>,
 *   assertionProfile: Record<string, any>,
 *   assertionResult?: { passed: boolean, checks: Array<{ name: string, passed: boolean, details: string }> },
 *   responseSnapshot?: { status?: number, headers?: Record<string, string>, latencyMs?: number },
 *   error?: { message?: string } | null
 * }} input - Endpoint/scenario context plus the observed execution outcome.
 * @returns {{
 *   summary: string,
 *   probableCauses: string[],
 *   nextActions: string[],
 *   failingChecks: string[]
 * }} Runtime failure analysis result.
 */
export function analyzeScenarioFailure({
  endpoint,
  scenario,
  assertionProfile,
  assertionResult,
  responseSnapshot,
  error
}) {
  const status = responseSnapshot?.status ?? 0;
  const headers = Object.fromEntries(
    Object.entries(responseSnapshot?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  const failingChecks = (assertionResult?.checks ?? [])
    .filter((check) => !check.passed)
    .map((check) => `${check.name}: ${check.details}`);
  const probableCauses = [...inferCommonCauses(endpoint, scenario.category)];

  if (error?.message) {
    probableCauses.unshift(`Execution raised an exception before assertions completed: ${error.message}`);
  }

  if (status >= 500) {
    probableCauses.unshift("The server returned a 5xx status, which strongly suggests controller, template, or persistence-layer failure.");
  }
  else if (status === 302 && scenario.category !== "positive") {
    probableCauses.unshift("The route redirected instead of returning an inline result, which often indicates login, form re-render, or PRG MVC behavior.");
  }
  else if ([401, 403].includes(status)) {
    probableCauses.unshift("Authorization or CSRF controls blocked the request before application logic completed.");
  }
  else if (status === 200 && scenario.category === "validation") {
    probableCauses.unshift("The application may have accepted a partial form submission or converted invalid data using default binding behavior.");
  }

  if (headers["content-type"] && !String(headers["content-type"]).includes("json") && assertionProfile.body.parseAsJson) {
    probableCauses.unshift("The response content-type was not JSON even though the scenario expected JSON, which often means an HTML error page or redirect target was returned.");
  }

  const nextActions = [
    "Capture the exact request fixture used for path/query/header/body substitution.",
    "Inspect server logs and HTML response bodies for hidden validation or template errors.",
    ...inferDiagnosticChecks(endpoint, assertionProfile)
  ];

  return {
    summary: `Failure analysis for ${scenario.id} on ${endpoint.method} ${endpoint.path}`,
    probableCauses: uniqueStrings(probableCauses),
    nextActions: uniqueStrings(nextActions),
    failingChecks
  };
}
