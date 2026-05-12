function asNumber(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueNumbers(values) {
  return Array.from(
    new Set(
      values
        .map((value) => asNumber(value))
        .filter((value) => value !== null)
    )
  );
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function collectSchemaKeys(schema, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 2) {
    return [];
  }

  const properties = schema.properties && typeof schema.properties === "object"
    ? Object.keys(schema.properties)
    : [];
  const composedSchemas = [
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
    ...(Array.isArray(schema.allOf) ? schema.allOf : [])
  ];

  return uniqueStrings([
    ...properties,
    ...composedSchemas.flatMap((item) => collectSchemaKeys(item, depth + 1))
  ]).slice(0, 10);
}

function extractResponseSchemas(endpoint) {
  const directSchemas = [];
  const response = endpoint.response ?? {};

  if (response.schema) {
    directSchemas.push(response.schema);
  }

  if (response.responses && typeof response.responses === "object") {
    for (const descriptor of Object.values(response.responses)) {
      if (!descriptor || typeof descriptor !== "object") {
        continue;
      }

      for (const schema of Object.values(descriptor.schemasByContentType ?? {})) {
        if (schema) {
          directSchemas.push(schema);
        }
      }
    }
  }

  return directSchemas;
}

function inferExpectedStatusCodes(endpoint, scenarioCategory) {
  const response = endpoint.response ?? {};
  const baseExpected = uniqueNumbers([
    ...(Array.isArray(response.expectedStatusCodes) ? response.expectedStatusCodes : []),
    ...Object.keys(response.responses ?? {})
  ]);

  if (scenarioCategory === "positive" || scenarioCategory === "performance") {
    return baseExpected.length > 0 ? baseExpected : [200];
  }

  if (scenarioCategory === "validation") {
    return [400, 415, 422];
  }

  if (scenarioCategory === "authentication") {
    return endpoint.auth?.required ? [401, 403] : [200, 302, 401, 403];
  }

  if (scenarioCategory === "security") {
    return [400, 401, 403, 404, 405, 413, 415, 422];
  }

  if (scenarioCategory === "edge_case") {
    return uniqueNumbers([...(baseExpected.length > 0 ? baseExpected : [200]), 400, 404, 413, 414, 422]);
  }

  if (scenarioCategory === "negative") {
    return [400, 404, 405, 422];
  }

  return baseExpected.length > 0 ? baseExpected : [200];
}

function inferExpectedContentTypes(endpoint, scenarioCategory) {
  const response = endpoint.response ?? {};
  const directContentTypes = Array.isArray(response.contentTypes) ? response.contentTypes : [];
  const nestedContentTypes = response.responses && typeof response.responses === "object"
    ? Object.values(response.responses).flatMap((descriptor) => descriptor?.contentTypes ?? [])
    : [];
  const contentTypes = uniqueStrings([...directContentTypes, ...nestedContentTypes]);

  if (scenarioCategory === "positive" || scenarioCategory === "performance" || scenarioCategory === "edge_case") {
    return contentTypes;
  }

  if (scenarioCategory === "authentication" && endpoint.auth?.required) {
    return uniqueStrings([...contentTypes, "application/json", "text/html"]);
  }

  return contentTypes;
}

function inferBodyExpectations(endpoint, scenarioCategory) {
  const responseKind = endpoint.response?.kind ?? "unknown";
  const responseSchemas = extractResponseSchemas(endpoint);
  const requiredKeys = uniqueStrings(
    responseSchemas.flatMap((schema) => collectSchemaKeys(schema))
  ).slice(0, 8);

  if (scenarioCategory === "performance") {
    return {
      expectBody: true,
      parseAsJson: responseKind === "json",
      htmlDocument: responseKind === "html" || responseKind === "html-redirect",
      requiredKeys
    };
  }

  if (scenarioCategory === "positive" || scenarioCategory === "edge_case") {
    return {
      expectBody: true,
      parseAsJson: responseKind === "json",
      htmlDocument: responseKind === "html" || responseKind === "html-redirect",
      requiredKeys
    };
  }

  if (scenarioCategory === "negative" || scenarioCategory === "validation" || scenarioCategory === "security") {
    return {
      expectBody: false,
      parseAsJson: responseKind === "json" && requiredKeys.length > 0,
      htmlDocument: false,
      requiredKeys: []
    };
  }

  if (scenarioCategory === "authentication") {
    return {
      expectBody: false,
      parseAsJson: responseKind === "json",
      htmlDocument: responseKind !== "json",
      requiredKeys: []
    };
  }

  return {
    expectBody: false,
    parseAsJson: false,
    htmlDocument: false,
    requiredKeys: []
  };
}

function inferHeaderExpectations(endpoint, scenarioCategory) {
  const expectations = [];
  const contentTypes = inferExpectedContentTypes(endpoint, scenarioCategory);

  if (contentTypes.length > 0) {
    expectations.push({
      kind: "content-type-includes-any",
      values: contentTypes
    });
  }

  if (endpoint.response?.kind === "html-redirect" || scenarioCategory === "authentication") {
    expectations.push({
      kind: "optional-header-presence",
      values: ["location"]
    });
  }

  return expectations;
}

function inferLatencyThresholdMs(endpoint, scenarioCategory) {
  if (scenarioCategory === "performance") {
    return endpoint.classification?.interactionType === "api" ? 1200 : 1800;
  }

  if (scenarioCategory === "security") {
    return 2500;
  }

  if (scenarioCategory === "edge_case") {
    return 3000;
  }

  if (scenarioCategory === "validation") {
    return 2000;
  }

  return 2500;
}

// PUBLIC_INTERFACE
/**
 * Builds a declarative assertion profile for a generated scenario using route metadata,
 * inferred HTTP semantics, and known response shapes.
 *
 * @param {{
 *   endpoint: Record<string, any>,
 *   scenario: Record<string, any>
 * }} input - Endpoint metadata and the generated scenario.
 * @returns {{
 *   status: { allowed: number[], forbid5xx: boolean },
 *   headers: Array<{ kind: string, values: string[] }>,
 *   body: {
 *     expectBody: boolean,
 *     parseAsJson: boolean,
 *     htmlDocument: boolean,
 *     requiredKeys: string[]
 *   },
 *   latency: { maxMs: number },
 *   rationale: string[]
 * }} Execution-ready smart assertion profile.
 */
export function buildSmartAssertions({ endpoint, scenario }) {
  const allowedStatuses = inferExpectedStatusCodes(endpoint, scenario.category);
  const responseKind = endpoint.response?.kind ?? "unknown";
  const rationale = [
    `Expected statuses derived from ${scenario.category} semantics for ${endpoint.method} ${endpoint.path}.`,
    `Response kind inferred as ${responseKind}.`
  ];

  if (endpoint.auth?.required) {
    rationale.push("Endpoint advertises auth requirements, so auth-sensitive assertions are enabled.");
  }

  return {
    status: {
      allowed: allowedStatuses,
      forbid5xx: scenario.category !== "positive" && scenario.category !== "performance"
    },
    headers: inferHeaderExpectations(endpoint, scenario.category),
    body: inferBodyExpectations(endpoint, scenario.category),
    latency: {
      maxMs: inferLatencyThresholdMs(endpoint, scenario.category)
    },
    rationale
  };
}

// PUBLIC_INTERFACE
/**
 * Evaluates a captured HTTP response snapshot against a generated smart assertion profile.
 *
 * @param {{
 *   assertionProfile: ReturnType<typeof buildSmartAssertions>,
 *   responseSnapshot: {
 *     status?: number,
 *     headers?: Record<string, string>,
 *     bodyText?: string,
 *     latencyMs?: number
 *   }
 * }} input - Assertion profile and response snapshot captured during execution.
 * @returns {{
 *   passed: boolean,
 *   checks: Array<{ name: string, passed: boolean, details: string }>,
 *   parsedBody: unknown
 * }} Structured assertion result ready for reporting and failure analysis.
 */
export function evaluateSmartAssertions({ assertionProfile, responseSnapshot }) {
  const checks = [];
  const headers = Object.fromEntries(
    Object.entries(responseSnapshot.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  const status = responseSnapshot.status ?? 0;
  const bodyText = responseSnapshot.bodyText ?? "";
  const latencyMs = responseSnapshot.latencyMs ?? 0;
  let parsedBody = null;

  const statusPassed = assertionProfile.status.allowed.includes(status);
  checks.push({
    name: "status",
    passed: statusPassed,
    details: `Received ${status}; allowed: ${assertionProfile.status.allowed.join(", ")}`
  });

  if (assertionProfile.status.forbid5xx) {
    const forbid5xxPassed = status < 500;
    checks.push({
      name: "non_5xx",
      passed: forbid5xxPassed,
      details: `Received ${status}; scenario forbids server-error outcomes.`
    });
  }

  for (const headerExpectation of assertionProfile.headers) {
    if (headerExpectation.kind === "content-type-includes-any") {
      const actual = headers["content-type"] ?? "";
      const passed = headerExpectation.values.length === 0 ||
        headerExpectation.values.some((value) => actual.toLowerCase().includes(String(value).toLowerCase()));
      checks.push({
        name: "content_type",
        passed,
        details: `Received content-type "${actual}" against expected values ${headerExpectation.values.join(", ")}`
      });
    }

    if (headerExpectation.kind === "optional-header-presence") {
      const matched = headerExpectation.values.some((name) => Boolean(headers[String(name).toLowerCase()]));
      checks.push({
        name: "optional_headers",
        passed: true,
        details: matched
          ? `Observed one of the suggested diagnostic headers: ${headerExpectation.values.join(", ")}`
          : `None of the diagnostic headers were present: ${headerExpectation.values.join(", ")}`
      });
    }
  }

  if (assertionProfile.body.parseAsJson && bodyText) {
    try {
      parsedBody = JSON.parse(bodyText);
      checks.push({
        name: "json_parse",
        passed: true,
        details: "Body parsed successfully as JSON."
      });
    }
    catch (error) {
      checks.push({
        name: "json_parse",
        passed: false,
        details: `Body did not parse as JSON: ${error.message}`
      });
    }
  }

  if (assertionProfile.body.requiredKeys.length > 0 && parsedBody && typeof parsedBody === "object") {
    const bodyKeys = Object.keys(parsedBody);
    const missingKeys = assertionProfile.body.requiredKeys.filter((key) => !bodyKeys.includes(key));
    checks.push({
      name: "json_keys",
      passed: missingKeys.length === 0,
      details: missingKeys.length === 0
        ? `Body includes inferred keys: ${assertionProfile.body.requiredKeys.join(", ")}`
        : `Missing inferred keys: ${missingKeys.join(", ")}`
    });
  }

  if (assertionProfile.body.htmlDocument && bodyText) {
    const htmlDocument = /<html[\s>]|<!doctype html|<\/body>/i.test(bodyText);
    checks.push({
      name: "html_document",
      passed: htmlDocument,
      details: htmlDocument
        ? "Body looks like an HTML document."
        : "Body did not look like an HTML document."
    });
  }

  if (assertionProfile.latency.maxMs > 0) {
    checks.push({
      name: "latency",
      passed: latencyMs <= assertionProfile.latency.maxMs,
      details: `Observed latency ${latencyMs}ms; threshold ${assertionProfile.latency.maxMs}ms`
    });
  }

  return {
    passed: checks.every((check) => check.passed),
    checks,
    parsedBody
  };
}
