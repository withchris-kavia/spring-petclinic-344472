import { buildSmartAssertions } from "./smart-assertions.js";
import { buildFailureAnalysisGuide } from "./failure-analysis.js";

const SHARED_PAYLOAD_LIBRARY = {
  maliciousStrings: [
    "' OR '1'='1",
    "<script>alert('xss')</script>",
    "../../etc/passwd",
    "${jndi:ldap://example.com/a}",
    "\"; DROP TABLE users; --"
  ],
  unicodeSamples: [
    "Ångström",
    "東京",
    "😀-emoji",
    "مرحبا",
    "naïve café"
  ],
  oversizedString: "X".repeat(256)
};

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function inferScalarByName(name, variant) {
  const normalizedName = String(name ?? "value").toLowerCase();

  if (variant === "malicious") {
    return SHARED_PAYLOAD_LIBRARY.maliciousStrings[0];
  }

  if (variant === "boundary") {
    if (normalizedName.includes("id")) {
      return "999999";
    }

    if (normalizedName.includes("date")) {
      return "2099-12-31";
    }

    return SHARED_PAYLOAD_LIBRARY.oversizedString;
  }

  if (variant === "invalidType") {
    return 999;
  }

  if (normalizedName.includes("email")) {
    return "tester@example.com";
  }

  if (normalizedName.includes("date")) {
    return "2024-01-01";
  }

  if (normalizedName.includes("name")) {
    return "Sample Name";
  }

  if (normalizedName.includes("phone")) {
    return "5551234567";
  }

  if (normalizedName.includes("city")) {
    return "Madison";
  }

  if (normalizedName.includes("address")) {
    return "1 Sample Street";
  }

  if (normalizedName.includes("state")) {
    return "WI";
  }

  if (normalizedName.includes("zip")) {
    return "53703";
  }

  if (normalizedName.includes("id")) {
    return "1";
  }

  return "sample-value";
}

function buildSampleFromSchema(schema, variant = "nominal", propertyName = "value", depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 3) {
    return inferScalarByName(propertyName, variant);
  }

  const resolvedSchema = Array.isArray(schema.oneOf) && schema.oneOf.length > 0
    ? schema.oneOf[0]
    : Array.isArray(schema.anyOf) && schema.anyOf.length > 0
      ? schema.anyOf[0]
      : Array.isArray(schema.allOf) && schema.allOf.length > 0
        ? schema.allOf[0]
        : schema;

  const type = resolvedSchema.type ?? (resolvedSchema.properties ? "object" : "string");

  if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0) {
    if (variant === "invalidType") {
      return "__invalid_enum_value__";
    }

    return variant === "boundary" && resolvedSchema.enum.length > 1
      ? resolvedSchema.enum[resolvedSchema.enum.length - 1]
      : resolvedSchema.enum[0];
  }

  if (type === "object") {
    const requiredKeys = Array.isArray(resolvedSchema.required) ? resolvedSchema.required : [];
    const properties = resolvedSchema.properties && typeof resolvedSchema.properties === "object"
      ? resolvedSchema.properties
      : {};
    const objectValue = Object.fromEntries(
      Object.entries(properties).map(([key, nestedSchema]) => [
        key,
        buildSampleFromSchema(nestedSchema, variant, key, depth + 1)
      ])
    );

    if (variant === "missingRequired" && requiredKeys.length > 0) {
      delete objectValue[requiredKeys[0]];
    }

    return Object.keys(objectValue).length > 0
      ? objectValue
      : { value: inferScalarByName(propertyName, variant) };
  }

  if (type === "array") {
    return [buildSampleFromSchema(resolvedSchema.items ?? { type: "string" }, variant, propertyName, depth + 1)];
  }

  if (type === "integer" || type === "number") {
    if (variant === "invalidType") {
      return "not-a-number";
    }

    if (variant === "boundary") {
      return 2147483647;
    }

    if (variant === "malicious") {
      return -1;
    }

    return 1;
  }

  if (type === "boolean") {
    return variant === "invalidType" ? "true" : true;
  }

  if (resolvedSchema.format === "date-time") {
    return variant === "boundary" ? "2099-12-31T23:59:59.000Z" : "2024-01-01T00:00:00.000Z";
  }

  if (resolvedSchema.format === "date") {
    return variant === "boundary" ? "2099-12-31" : "2024-01-01";
  }

  if (resolvedSchema.format === "uuid") {
    return variant === "invalidType"
      ? "not-a-uuid"
      : "11111111-1111-1111-1111-111111111111";
  }

  return inferScalarByName(propertyName, variant);
}

function buildRequestBodyVariants(endpoint) {
  const request = endpoint.request ?? {};

  if (request.schemasByContentType && typeof request.schemasByContentType === "object") {
    const preferredContentType = Object.keys(request.schemasByContentType)[0];
    const schema = preferredContentType ? request.schemasByContentType[preferredContentType] : null;

    return {
      contentType: preferredContentType ?? "application/json",
      nominal: schema ? buildSampleFromSchema(schema, "nominal") : null,
      boundary: schema ? buildSampleFromSchema(schema, "boundary") : null,
      malicious: schema ? buildSampleFromSchema(schema, "malicious") : null,
      invalid: schema ? buildSampleFromSchema(schema, "invalidType") : null,
      missingRequired: schema ? buildSampleFromSchema(schema, "missingRequired") : null
    };
  }

  if (Array.isArray(request.bodyParameters) && request.bodyParameters.length > 0) {
    const body = Object.fromEntries(
      request.bodyParameters.map((parameter) => [
        parameter.name,
        buildSampleFromSchema(parameter.schema, "nominal", parameter.name)
      ])
    );

    return {
      contentType: request.contentTypes?.[0] ?? "application/json",
      nominal: body,
      boundary: Object.fromEntries(
        request.bodyParameters.map((parameter) => [
          parameter.name,
          buildSampleFromSchema(parameter.schema, "boundary", parameter.name)
        ])
      ),
      malicious: Object.fromEntries(
        request.bodyParameters.map((parameter) => [
          parameter.name,
          buildSampleFromSchema(parameter.schema, "malicious", parameter.name)
        ])
      ),
      invalid: Object.fromEntries(
        request.bodyParameters.map((parameter) => [
          parameter.name,
          buildSampleFromSchema(parameter.schema, "invalidType", parameter.name)
        ])
      ),
      missingRequired: {}
    };
  }

  if (Array.isArray(request.modelParameters) && request.modelParameters.length > 0) {
    const body = Object.fromEntries(
      request.modelParameters.map((parameter) => [
        parameter.name,
        buildSampleFromSchema(parameter.schema, "nominal", parameter.name)
      ])
    );

    const firstKey = Object.keys(body)[0];
    const missingRequired = clone(body) ?? {};
    if (firstKey) {
      delete missingRequired[firstKey];
    }

    return {
      contentType: request.contentTypes?.[0] ?? "application/x-www-form-urlencoded",
      nominal: body,
      boundary: Object.fromEntries(
        request.modelParameters.map((parameter) => [
          parameter.name,
          buildSampleFromSchema(parameter.schema, "boundary", parameter.name)
        ])
      ),
      malicious: Object.fromEntries(
        request.modelParameters.map((parameter) => [
          parameter.name,
          buildSampleFromSchema(parameter.schema, "malicious", parameter.name)
        ])
      ),
      invalid: Object.fromEntries(
        request.modelParameters.map((parameter) => [
          parameter.name,
          buildSampleFromSchema(parameter.schema, "invalidType", parameter.name)
        ])
      ),
      missingRequired
    };
  }

  return {
    contentType: request.contentTypes?.[0] ?? "",
    nominal: null,
    boundary: null,
    malicious: null,
    invalid: null,
    missingRequired: null
  };
}

function buildParameterVariants(parameters = []) {
  const nominal = {};
  const boundary = {};
  const malicious = {};
  const invalid = {};

  for (const parameter of parameters) {
    nominal[parameter.name] = buildSampleFromSchema(parameter.schema, "nominal", parameter.name);
    boundary[parameter.name] = buildSampleFromSchema(parameter.schema, "boundary", parameter.name);
    malicious[parameter.name] = buildSampleFromSchema(parameter.schema, "malicious", parameter.name);
    invalid[parameter.name] = buildSampleFromSchema(parameter.schema, "invalidType", parameter.name);
  }

  return { nominal, boundary, malicious, invalid };
}

function buildHeaderFixtures(endpoint) {
  const explicitHeaders = buildParameterVariants(endpoint.parameters?.header ?? []);
  const nominal = {
    ...explicitHeaders.nominal
  };

  if (endpoint.response?.kind === "json") {
    nominal.accept = "application/json";
  }
  else if (endpoint.response?.kind === "html" || endpoint.response?.kind === "html-redirect") {
    nominal.accept = "text/html";
  }

  if (endpoint.request?.hasBody && endpoint.request?.contentTypes?.[0]) {
    nominal["content-type"] = endpoint.request.contentTypes[0];
  }

  if (endpoint.auth?.required) {
    nominal.authorization = "Bearer {{API_TEST_AUTH_BEARER_TOKEN}}";
  }

  return {
    nominal,
    boundary: { ...nominal, ...explicitHeaders.boundary },
    malicious: { ...nominal, ...explicitHeaders.malicious },
    invalid: { ...nominal, ...explicitHeaders.invalid }
  };
}

function buildEndpointFixtures(endpoint) {
  return {
    path: buildParameterVariants(endpoint.parameters?.path ?? []),
    query: buildParameterVariants(endpoint.parameters?.query ?? []),
    headers: buildHeaderFixtures(endpoint),
    cookies: buildParameterVariants(endpoint.parameters?.cookie ?? []),
    body: buildRequestBodyVariants(endpoint)
  };
}

function buildScenarioRequest(endpoint, fixtures, variant) {
  const bodyVariantMap = {
    nominal: fixtures.body.nominal,
    not_found: fixtures.body.nominal,
    invalid: fixtures.body.invalid,
    malicious: fixtures.body.malicious,
    boundary: fixtures.body.boundary,
    missing_required: fixtures.body.missingRequired
  };

  const pathVariantMap = {
    nominal: fixtures.path.nominal,
    not_found: Object.keys(fixtures.path.nominal).length > 0
      ? Object.fromEntries(Object.keys(fixtures.path.nominal).map((key) => [key, "999999"]))
      : fixtures.path.nominal,
    invalid: fixtures.path.invalid,
    malicious: fixtures.path.malicious,
    boundary: fixtures.path.boundary,
    missing_required: fixtures.path.nominal
  };

  const genericVariantMap = {
    nominal: "nominal",
    not_found: "nominal",
    invalid: "invalid",
    malicious: "malicious",
    boundary: "boundary",
    missing_required: "nominal"
  };

  const selectedGenericVariant = genericVariantMap[variant] ?? "nominal";

  return {
    method: endpoint.method,
    path: endpoint.path,
    pathParameters: clone(pathVariantMap[variant] ?? fixtures.path.nominal),
    query: clone(fixtures.query[selectedGenericVariant]),
    headers: clone(fixtures.headers[selectedGenericVariant]),
    cookies: clone(fixtures.cookies[selectedGenericVariant]),
    body: clone(bodyVariantMap[variant]),
    bindingStyle: endpoint.request?.bindingStyle ?? "none"
  };
}

function buildExecutionHints(endpoint, scenarioCategory, options) {
  return {
    parallelizable: scenarioCategory !== "performance" && endpoint.method !== "DELETE",
    recommendedRetries: scenarioCategory === "performance" ? 0 : 1,
    timeoutMs: options.timeoutMs,
    iterationCount: scenarioCategory === "performance" ? 3 : 1,
    concurrency: scenarioCategory === "performance" ? Math.max(1, options.parallelism) : 1
  };
}

function createScenario(endpoint, category, type, variant, description, fixtures, options) {
  const scenario = {
    id: `${slugify(endpoint.method)}-${slugify(endpoint.path)}-${category}-${type}`,
    category,
    type,
    title: `${endpoint.method} ${endpoint.path} :: ${category}/${type}`,
    description,
    endpointId: endpoint.id,
    endpointRef: {
      method: endpoint.method,
      path: endpoint.path,
      interactionType: endpoint.classification?.interactionType ?? "api",
      responseKind: endpoint.response?.kind ?? "unknown"
    },
    tags: uniqueStrings([
      category,
      type,
      endpoint.method.toLowerCase(),
      endpoint.classification?.interactionType ?? "api",
      ...(endpoint.tags ?? [])
    ]),
    requestTemplate: buildScenarioRequest(endpoint, fixtures, variant),
    executionHints: buildExecutionHints(endpoint, category, options)
  };

  const assertions = buildSmartAssertions({ endpoint, scenario });
  scenario.assertions = assertions;
  scenario.failureAnalysis = buildFailureAnalysisGuide({
    endpoint,
    scenario,
    assertionProfile: assertions
  });

  return scenario;
}

function shouldGenerateValidation(endpoint) {
  return Boolean(
    (endpoint.request?.hasBody) ||
    (endpoint.parameters?.query ?? []).some((parameter) => parameter.required) ||
    (endpoint.parameters?.header ?? []).some((parameter) => parameter.required) ||
    (endpoint.parameters?.cookie ?? []).some((parameter) => parameter.required)
  );
}

function shouldGenerateAuthentication(endpoint) {
  return Boolean(endpoint.auth?.required);
}

function shouldGenerateSecurity(endpoint) {
  return endpoint.method !== "HEAD" && endpoint.method !== "OPTIONS";
}

function shouldGeneratePerformance(endpoint) {
  return endpoint.method === "GET" || endpoint.method === "POST" || endpoint.classification?.interactionType === "api";
}

function buildEndpointScenarios(endpoint, options) {
  const fixtures = buildEndpointFixtures(endpoint);
  const scenarios = [];

  scenarios.push(
    createScenario(
      endpoint,
      "positive",
      "happy_path",
      "nominal",
      "Nominal fixture set inferred from the normalized catalog.",
      fixtures,
      options
    )
  );

  scenarios.push(
    createScenario(
      endpoint,
      "negative",
      "missing_or_unknown_resource",
      "not_found",
      "Uses invalid or non-existent identifiers to confirm defensive 4xx behavior.",
      fixtures,
      options
    )
  );

  if (shouldGenerateValidation(endpoint)) {
    scenarios.push(
      createScenario(
        endpoint,
        "validation",
        "missing_required_fields",
        "missing_required",
        "Removes required fields or body members to trigger server-side validation handling.",
        fixtures,
        options
      )
    );
    scenarios.push(
      createScenario(
        endpoint,
        "validation",
        "invalid_types",
        "invalid",
        "Mutates known inputs to type-incorrect values to probe validation rules.",
        fixtures,
        options
      )
    );
  }

  if (shouldGenerateAuthentication(endpoint)) {
    scenarios.push(
      createScenario(
        endpoint,
        "authentication",
        "missing_credentials",
        "nominal",
        "Runs the request without valid credentials to verify auth enforcement behavior.",
        fixtures,
        options
      )
    );
  }

  if (shouldGenerateSecurity(endpoint)) {
    scenarios.push(
      createScenario(
        endpoint,
        "security",
        "injection_payloads",
        "malicious",
        "Injects suspicious strings into discovered input surfaces and expects safe failure modes.",
        fixtures,
        options
      )
    );
  }

  scenarios.push(
    createScenario(
      endpoint,
      "edge_case",
      "boundary_inputs",
      "boundary",
      "Uses oversized, boundary, or unicode-heavy data derived from the request schema.",
      fixtures,
      options
    )
  );

  if (shouldGeneratePerformance(endpoint)) {
    scenarios.push(
      createScenario(
        endpoint,
        "performance",
        "lightweight_latency_probe",
        "nominal",
        "Executes a lightweight repeat probe suitable for CI-safe latency and stability checks.",
        fixtures,
        options
      )
    );
  }

  return {
    fixtures,
    scenarios
  };
}

function buildSummary(catalog, scenarios) {
  const byCategory = {};
  const byMethod = {};
  const byInteractionType = {};
  const endpointsCovered = new Set();

  for (const scenario of scenarios) {
    byCategory[scenario.category] = (byCategory[scenario.category] ?? 0) + 1;
    byMethod[scenario.endpointRef.method] = (byMethod[scenario.endpointRef.method] ?? 0) + 1;
    byInteractionType[scenario.endpointRef.interactionType] =
      (byInteractionType[scenario.endpointRef.interactionType] ?? 0) + 1;
    endpointsCovered.add(scenario.endpointId);
  }

  return {
    catalogEndpointCount: catalog.summary?.totalEndpoints ?? catalog.endpoints.length,
    endpointsCovered: endpointsCovered.size,
    totalScenarios: scenarios.length,
    byCategory,
    byMethod,
    byInteractionType
  };
}

function buildManifest(summary, scenarios, options) {
  return {
    format: "scenario-manifest/v1",
    createdAt: new Date().toISOString(),
    summary,
    execution: {
      defaultParallelism: options.parallelism,
      smokeScenarioIds: scenarios
        .filter((scenario) => scenario.category === "positive")
        .slice(0, 10)
        .map((scenario) => scenario.id),
      serialScenarioIds: scenarios
        .filter((scenario) => !scenario.executionHints.parallelizable)
        .map((scenario) => scenario.id),
      performanceScenarioIds: scenarios
        .filter((scenario) => scenario.category === "performance")
        .map((scenario) => scenario.id)
    },
    requiredEnvironmentVariables: uniqueStrings([
      ...scenarios
        .filter((scenario) => String(JSON.stringify(scenario.requestTemplate.headers ?? {})).includes("API_TEST_AUTH_BEARER_TOKEN"))
        .map(() => "API_TEST_AUTH_BEARER_TOKEN")
    ]),
    artifactFiles: {
      scenarios: "generated-scenarios.json",
      fixtures: "scenario-fixtures.json"
    }
  };
}

// PUBLIC_INTERFACE
/**
 * Converts the normalized API catalog into downstream-executable scenario artifacts,
 * including reusable fixtures, smart assertion profiles, and failure-analysis guidance.
 *
 * @param {{
 *   catalogFormat?: string,
 *   createdAt?: string,
 *   targetBaseUrl?: string,
 *   summary?: Record<string, any>,
 *   endpoints: Array<Record<string, any>>
 * }} catalog - The normalized API catalog produced by discovery.
 * @param {{
 *   targetBaseUrl: string,
 *   parallelism: number,
 *   timeoutMs: number
 * }} options - Generation controls inherited from the workspace environment.
 * @returns {{
 *   format: string,
 *   createdAt: string,
 *   targetBaseUrl: string,
 *   sourceCatalog: Record<string, any>,
 *   summary: Record<string, any>,
 *   fixtures: Record<string, any>,
 *   scenarios: Array<Record<string, any>>,
 *   manifest: Record<string, any>,
 *   payloadLibrary: Record<string, any>
 * }} Full generated scenario artifact set for later execution and reporting stages.
 */
export function generateScenarioArtifacts(catalog, options) {
  const endpointFixtures = {};
  const scenarios = [];

  for (const endpoint of catalog.endpoints ?? []) {
    const generated = buildEndpointScenarios(endpoint, options);
    endpointFixtures[endpoint.id] = generated.fixtures;
    scenarios.push(...generated.scenarios);
  }

  const summary = buildSummary(catalog, scenarios);
  const manifest = buildManifest(summary, scenarios, options);

  return {
    format: "generated-scenarios/v1",
    createdAt: new Date().toISOString(),
    targetBaseUrl: options.targetBaseUrl,
    sourceCatalog: {
      catalogFormat: catalog.catalogFormat ?? "internal-api-catalog/v1",
      createdAt: catalog.createdAt ?? null,
      selectedStrategy: catalog.discovery?.selectedStrategy ?? "unknown"
    },
    summary,
    fixtures: {
      byEndpoint: endpointFixtures
    },
    scenarios,
    manifest,
    payloadLibrary: SHARED_PAYLOAD_LIBRARY
  };
}
