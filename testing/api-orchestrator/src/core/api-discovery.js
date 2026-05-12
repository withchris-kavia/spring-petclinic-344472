import fs from "node:fs/promises";
import path from "node:path";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
const FRAMEWORK_PARAMETER_TYPES = new Set([
  "BindingResult",
  "Model",
  "ModelMap",
  "RedirectAttributes",
  "WebDataBinder"
]);
const SIMPLE_JAVA_TYPES = new Set([
  "String",
  "Integer",
  "Long",
  "Boolean",
  "Double",
  "Float",
  "Short",
  "Byte",
  "Character",
  "int",
  "long",
  "boolean",
  "double",
  "float",
  "short",
  "byte",
  "char",
  "LocalDate",
  "LocalDateTime",
  "OffsetDateTime",
  "Instant",
  "Date",
  "BigDecimal",
  "BigInteger"
]);

function normalizeUrlPath(value) {
  if (!value) {
    return "/";
  }

  const normalized = `/${String(value).trim()}`.replace(/\/{2,}/g, "/");
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function joinRoutePaths(basePath, methodPath) {
  const base = basePath && basePath !== "/" ? normalizeUrlPath(basePath) : "";
  const leaf = methodPath && methodPath !== "/" ? normalizeUrlPath(methodPath) : "";
  const combined = `${base}${leaf || ""}` || "/";
  return normalizeUrlPath(combined);
}

function deduplicateBy(items, keyBuilder) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyBuilder(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractQuotedStrings(value) {
  return Array.from(value.matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function extractPathParameterNames(routePath) {
  return Array.from(routePath.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
}

function isFrameworkParameter(typeName) {
  if (FRAMEWORK_PARAMETER_TYPES.has(typeName)) {
    return true;
  }

  return typeName.startsWith("Map<") || typeName === "Map" || typeName.endsWith("Attributes");
}

function isSimpleJavaType(typeName) {
  const normalized = typeName.replace(/\.\.\.$/, "");
  if (SIMPLE_JAVA_TYPES.has(normalized)) {
    return true;
  }

  return normalized.startsWith("Optional<");
}

function extractNamedAnnotationValue(annotation) {
  const directMatch = annotation.match(/\(\s*"([^"]+)"\s*\)/);
  if (directMatch) {
    return directMatch[1];
  }

  const keyedMatch = annotation.match(/(?:name|value)\s*=\s*"([^"]+)"/);
  return keyedMatch ? keyedMatch[1] : null;
}

function extractAnnotationPaths(annotation) {
  const contentMatch = annotation.match(/@\w+\(([\s\S]*)\)$/);
  if (!contentMatch) {
    return [""];
  }

  const content = contentMatch[1].trim();
  const explicitAssignments = Array.from(
    content.matchAll(/(?:path|value)\s*=\s*(\{[\s\S]*?\}|"[^"]+")/g),
    (match) => match[1]
  );

  if (explicitAssignments.length > 0) {
    return explicitAssignments.flatMap((value) => extractQuotedStrings(value));
  }

  if (!content.includes("=")) {
    const quoted = extractQuotedStrings(content);
    return quoted.length > 0 ? quoted : [""];
  }

  return [""];
}

function extractRequestMappingMethods(annotation) {
  const methodMatches = Array.from(
    annotation.matchAll(/RequestMethod\.([A-Z]+)/g),
    (match) => match[1]
  );

  return methodMatches.length > 0 ? methodMatches : ["GET"];
}

function extractMethodMappings(annotations) {
  const mappings = [];

  for (const annotation of annotations) {
    if (annotation.startsWith("@GetMapping")) {
      mappings.push({ methods: ["GET"], paths: extractAnnotationPaths(annotation) });
    }
    else if (annotation.startsWith("@PostMapping")) {
      mappings.push({ methods: ["POST"], paths: extractAnnotationPaths(annotation) });
    }
    else if (annotation.startsWith("@PutMapping")) {
      mappings.push({ methods: ["PUT"], paths: extractAnnotationPaths(annotation) });
    }
    else if (annotation.startsWith("@PatchMapping")) {
      mappings.push({ methods: ["PATCH"], paths: extractAnnotationPaths(annotation) });
    }
    else if (annotation.startsWith("@DeleteMapping")) {
      mappings.push({ methods: ["DELETE"], paths: extractAnnotationPaths(annotation) });
    }
    else if (annotation.startsWith("@RequestMapping")) {
      mappings.push({
        methods: extractRequestMappingMethods(annotation),
        paths: extractAnnotationPaths(annotation)
      });
    }
  }

  return mappings.flatMap((mapping) =>
    mapping.methods.flatMap((method) =>
      (mapping.paths.length > 0 ? mapping.paths : [""]).map((routePath) => ({
        method,
        path: routePath || ""
      }))
    )
  );
}

function splitTopLevelParameters(parameterList) {
  const parts = [];
  let current = "";
  let depthAngle = 0;
  let depthParen = 0;

  for (const character of parameterList) {
    if (character === "<") {
      depthAngle += 1;
    }
    else if (character === ">") {
      depthAngle = Math.max(depthAngle - 1, 0);
    }
    else if (character === "(") {
      depthParen += 1;
    }
    else if (character === ")") {
      depthParen = Math.max(depthParen - 1, 0);
    }

    if (character === "," && depthAngle === 0 && depthParen === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }

      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseJavaMethodSignature(signature) {
  const normalized = signature.replace(/\s+/g, " ").trim();
  const match = normalized.match(/public\s+(?:static\s+)?(.+?)\s+([A-Za-z_]\w*)\s*\((.*)\)\s*\{/);

  if (!match) {
    return null;
  }

  const [, returnType, methodName, rawParameters] = match;
  const parameters = splitTopLevelParameters(rawParameters).map((parameter) => {
    const annotations = parameter.match(/@\w+(?:\([^)]*\))?/g) ?? [];
    const withoutAnnotations = parameter.replace(/@\w+(?:\([^)]*\))?/g, "").replace(/\bfinal\b/g, "").trim();
    const tokens = withoutAnnotations.split(/\s+/).filter(Boolean);
    const name = tokens[tokens.length - 1] ?? "";
    const type = tokens.slice(0, -1).join(" ");

    return {
      raw: parameter,
      annotations,
      name: name.replace(/,$/, ""),
      type
    };
  });

  return {
    returnType,
    methodName,
    parameters
  };
}

function classifySpringParameter(parameter, httpMethod) {
  const explicitPath = parameter.annotations.find((annotation) => annotation.startsWith("@PathVariable"));
  if (explicitPath) {
    return {
      location: "path",
      name: extractNamedAnnotationValue(explicitPath) ?? parameter.name,
      required: !explicitPath.includes("required = false"),
      schema: { type: "string" }
    };
  }

  const explicitQuery = parameter.annotations.find((annotation) => annotation.startsWith("@RequestParam"));
  if (explicitQuery) {
    return {
      location: "query",
      name: extractNamedAnnotationValue(explicitQuery) ?? parameter.name,
      required: !explicitQuery.includes("required = false") && !explicitQuery.includes("defaultValue"),
      schema: { type: "string" }
    };
  }

  const explicitHeader = parameter.annotations.find((annotation) => annotation.startsWith("@RequestHeader"));
  if (explicitHeader) {
    return {
      location: "header",
      name: extractNamedAnnotationValue(explicitHeader) ?? parameter.name,
      required: !explicitHeader.includes("required = false"),
      schema: { type: "string" }
    };
  }

  const explicitCookie = parameter.annotations.find((annotation) => annotation.startsWith("@CookieValue"));
  if (explicitCookie) {
    return {
      location: "cookie",
      name: extractNamedAnnotationValue(explicitCookie) ?? parameter.name,
      required: !explicitCookie.includes("required = false"),
      schema: { type: "string" }
    };
  }

  if (parameter.annotations.some((annotation) => annotation.startsWith("@RequestBody"))) {
    return {
      location: "body",
      name: parameter.name,
      required: true,
      schema: { type: "object", title: parameter.type }
    };
  }

  if (isFrameworkParameter(parameter.type)) {
    return {
      location: "framework",
      name: parameter.name,
      required: false,
      schema: null
    };
  }

  if (httpMethod === "GET" && isSimpleJavaType(parameter.type)) {
    return {
      location: "query",
      name: parameter.name,
      required: false,
      schema: { type: "string" }
    };
  }

  return {
    location: "model",
    name: parameter.name,
    required: parameter.annotations.some((annotation) => annotation.startsWith("@Valid")),
    schema: {
      type: "object",
      title: parameter.type
    }
  };
}

function buildSpringRequestShape(httpMethod, classifiedParameters) {
  const bodyParameters = classifiedParameters.filter((parameter) => parameter.location === "body");
  const modelParameters = classifiedParameters.filter((parameter) => parameter.location === "model");

  if (bodyParameters.length > 0) {
    return {
      hasBody: true,
      bindingStyle: "request-body",
      contentTypes: ["application/json"],
      bodyParameters: bodyParameters.map((parameter) => ({
        name: parameter.name,
        required: parameter.required,
        schema: parameter.schema
      }))
    };
  }

  if (modelParameters.length > 0 && ["POST", "PUT", "PATCH", "DELETE"].includes(httpMethod)) {
    return {
      hasBody: true,
      bindingStyle: "spring-model-attribute",
      contentTypes: ["application/x-www-form-urlencoded", "multipart/form-data"],
      modelParameters: modelParameters.map((parameter) => ({
        name: parameter.name,
        required: parameter.required,
        schema: parameter.schema
      }))
    };
  }

  if (modelParameters.length > 0) {
    return {
      hasBody: false,
      bindingStyle: "query-model",
      contentTypes: [],
      modelParameters: modelParameters.map((parameter) => ({
        name: parameter.name,
        required: parameter.required,
        schema: parameter.schema
      }))
    };
  }

  return {
    hasBody: false,
    bindingStyle: "none",
    contentTypes: []
  };
}

function buildSpringResponseShape(httpMethod, signature, annotations, controllerKind) {
  const returnsJson =
    controllerKind === "rest" || annotations.some((annotation) => annotation.includes("@ResponseBody"));

  if (returnsJson) {
    return {
      kind: "json",
      expectedStatusCodes: httpMethod === "POST" ? [200, 201] : [200],
      contentTypes: ["application/json"],
      schema: signature.returnType === "void" ? null : { type: "object", title: signature.returnType }
    };
  }

  if (httpMethod === "POST") {
    return {
      kind: "html-redirect",
      expectedStatusCodes: [302, 200],
      contentTypes: ["text/html"],
      schema: null
    };
  }

  return {
    kind: "html",
    expectedStatusCodes: [200],
    contentTypes: ["text/html"],
    schema: signature.returnType === "void" ? null : { type: "string", title: signature.returnType }
  };
}

function resolveLocalReference(document, input) {
  if (!input || typeof input !== "object" || !input.$ref || !input.$ref.startsWith("#/")) {
    return input;
  }

  const segments = input.$ref.slice(2).split("/");
  let current = document;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return input;
    }

    current = current[segment];
  }

  return current;
}

function simplifySchema(document, inputSchema, depth = 0) {
  if (!inputSchema || depth > 4) {
    return null;
  }

  const schema = resolveLocalReference(document, inputSchema);
  if (!schema || typeof schema !== "object") {
    return null;
  }

  const summary = {};

  if (schema.$ref) {
    summary.$ref = schema.$ref;
  }

  if (schema.type) {
    summary.type = schema.type;
  }

  if (schema.format) {
    summary.format = schema.format;
  }

  if (schema.description) {
    summary.description = schema.description;
  }

  if (schema.title) {
    summary.title = schema.title;
  }

  if (schema.enum) {
    summary.enum = schema.enum;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "nullable")) {
    summary.nullable = Boolean(schema.nullable);
  }

  if (Object.prototype.hasOwnProperty.call(schema, "default")) {
    summary.default = schema.default;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "example")) {
    summary.example = schema.example;
  }

  if (Array.isArray(schema.required) && schema.required.length > 0) {
    summary.required = schema.required;
  }

  if (schema.items) {
    summary.items = simplifySchema(document, schema.items, depth + 1);
  }

  if (schema.properties && typeof schema.properties === "object") {
    summary.properties = Object.fromEntries(
      Object.entries(schema.properties)
        .map(([propertyName, propertySchema]) => [
          propertyName,
          simplifySchema(document, propertySchema, depth + 1)
        ])
        .filter(([, propertySchema]) => propertySchema)
    );
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    summary.oneOf = schema.oneOf.slice(0, 5).map((item) => simplifySchema(document, item, depth + 1));
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    summary.anyOf = schema.anyOf.slice(0, 5).map((item) => simplifySchema(document, item, depth + 1));
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    summary.allOf = schema.allOf.slice(0, 5).map((item) => simplifySchema(document, item, depth + 1));
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

function groupOpenApiParameters(document, parameters) {
  const grouped = {
    path: [],
    query: [],
    header: [],
    cookie: []
  };

  for (const rawParameter of parameters) {
    const parameter = resolveLocalReference(document, rawParameter);
    if (!parameter || !parameter.in || !grouped[parameter.in]) {
      continue;
    }

    grouped[parameter.in].push({
      name: parameter.name,
      required: Boolean(parameter.required),
      description: parameter.description ?? "",
      schema: simplifySchema(document, parameter.schema)
    });
  }

  return {
    path: deduplicateBy(grouped.path, (item) => item.name),
    query: deduplicateBy(grouped.query, (item) => item.name),
    header: deduplicateBy(grouped.header, (item) => item.name),
    cookie: deduplicateBy(grouped.cookie, (item) => item.name)
  };
}

function buildOpenApiRequestShape(document, operation) {
  const rawRequestBody = operation.requestBody
    ? resolveLocalReference(document, operation.requestBody)
    : null;
  const content = rawRequestBody?.content ?? {};
  const contentTypes = Object.keys(content);

  return {
    hasBody: contentTypes.length > 0,
    bindingStyle: contentTypes.length > 0 ? "openapi-request-body" : "none",
    required: Boolean(rawRequestBody?.required),
    contentTypes,
    schemasByContentType: Object.fromEntries(
      Object.entries(content).map(([contentType, contentDescriptor]) => [
        contentType,
        simplifySchema(document, contentDescriptor.schema)
      ])
    )
  };
}

function buildOpenApiResponseShape(document, operation) {
  const responses = operation.responses ?? {};
  const normalizedResponses = Object.fromEntries(
    Object.entries(responses).map(([statusCode, responseDescriptor]) => {
      const response = resolveLocalReference(document, responseDescriptor);
      const content = response?.content ?? {};

      return [
        statusCode,
        {
          description: response?.description ?? "",
          contentTypes: Object.keys(content),
          schemasByContentType: Object.fromEntries(
            Object.entries(content).map(([contentType, contentDescriptor]) => [
              contentType,
              simplifySchema(document, contentDescriptor.schema)
            ])
          )
        }
      ];
    })
  );

  const firstJsonResponse = Object.values(normalizedResponses).find((response) =>
    response.contentTypes.some((contentType) => contentType.includes("json"))
  );
  const firstHtmlResponse = Object.values(normalizedResponses).find((response) =>
    response.contentTypes.some((contentType) => contentType.includes("html"))
  );

  return {
    kind: firstJsonResponse ? "json" : firstHtmlResponse ? "html" : "unknown",
    expectedStatusCodes: Object.keys(normalizedResponses),
    responses: normalizedResponses
  };
}

function buildAuthShape(operation, document) {
  const effectiveSecurity = Array.isArray(operation.security)
    ? operation.security
    : Array.isArray(document.security)
      ? document.security
      : [];

  const schemes = Array.from(
    new Set(
      effectiveSecurity.flatMap((requirement) =>
        requirement && typeof requirement === "object" ? Object.keys(requirement) : []
      )
    )
  );

  return {
    required: schemes.length > 0,
    schemes
  };
}

function buildCatalogSummary(endpoints) {
  const byMethod = {};
  const bySourceType = {};
  const byResponseKind = {};
  let apiEndpoints = 0;
  let webEndpoints = 0;

  for (const endpoint of endpoints) {
    byMethod[endpoint.method] = (byMethod[endpoint.method] ?? 0) + 1;
    bySourceType[endpoint.discovery.sourceType] = (bySourceType[endpoint.discovery.sourceType] ?? 0) + 1;
    byResponseKind[endpoint.response.kind] = (byResponseKind[endpoint.response.kind] ?? 0) + 1;

    if (endpoint.classification.interactionType === "api") {
      apiEndpoints += 1;
    }
    else {
      webEndpoints += 1;
    }
  }

  return {
    totalEndpoints: endpoints.length,
    apiEndpoints,
    webEndpoints,
    byMethod,
    bySourceType,
    byResponseKind
  };
}

async function readJsonFile(filePath) {
  const rawContent = await fs.readFile(filePath, "utf8");
  return JSON.parse(rawContent);
}

async function fetchJsonDocument(url, timeoutMs) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function discoverOpenApi(environment) {
  const attempts = [];

  for (const candidatePath of environment.apiSpecCandidatePaths) {
    try {
      const document = await readJsonFile(candidatePath);
      return {
        strategy: "openapi",
        sourceType: "openapi-file",
        sourceLocation: candidatePath,
        document,
        attempts: [
          ...attempts,
          {
            sourceType: "openapi-file",
            location: candidatePath,
            status: "selected"
          }
        ]
      };
    }
    catch (error) {
      attempts.push({
        sourceType: "openapi-file",
        location: candidatePath,
        status: "unavailable",
        message: error.message
      });
    }
  }

  if (environment.discoveryAllowRemote) {
    for (const candidateUrl of environment.apiSpecCandidateUrls) {
      try {
        const document = await fetchJsonDocument(candidateUrl, environment.timeoutMs);
        return {
          strategy: "openapi",
          sourceType: "openapi-url",
          sourceLocation: candidateUrl,
          document,
          attempts: [
            ...attempts,
            {
              sourceType: "openapi-url",
              location: candidateUrl,
              status: "selected"
            }
          ]
        };
      }
      catch (error) {
        attempts.push({
          sourceType: "openapi-url",
          location: candidateUrl,
          status: "unavailable",
          message: error.message
        });
      }
    }
  }

  return {
    strategy: "openapi",
    sourceType: "openapi",
    sourceLocation: null,
    document: null,
    attempts
  };
}

function normalizeOpenApiDocument(document, sourceType, sourceLocation) {
  const endpoints = [];

  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const httpMethod of HTTP_METHODS) {
      const operationCandidate = pathItem?.[httpMethod];
      if (!operationCandidate) {
        continue;
      }

      const operation = resolveLocalReference(document, operationCandidate);
      const parameterGroups = groupOpenApiParameters(document, [
        ...(pathItem.parameters ?? []),
        ...(operation.parameters ?? [])
      ]);
      const request = buildOpenApiRequestShape(document, operation);
      const response = buildOpenApiResponseShape(document, operation);
      const auth = buildAuthShape(operation, document);

      endpoints.push({
        id: `${httpMethod.toUpperCase()} ${normalizeUrlPath(routePath)}`,
        method: httpMethod.toUpperCase(),
        path: normalizeUrlPath(routePath),
        operationId: operation.operationId ?? null,
        summary: operation.summary ?? "",
        description: operation.description ?? "",
        tags: operation.tags ?? [],
        discovery: {
          strategy: "openapi",
          sourceType,
          sourceLocation
        },
        parameters: parameterGroups,
        request,
        response,
        auth,
        classification: {
          interactionType: response.kind === "json" ? "api" : "web",
          transport: "http"
        }
      });
    }
  }

  return deduplicateBy(endpoints, (endpoint) => endpoint.id).sort((left, right) =>
    `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`)
  );
}

async function collectFilesRecursively(rootDirectory, predicate) {
  const directoryEntries = await fs.readdir(rootDirectory, { withFileTypes: true });
  const nestedResults = await Promise.all(
    directoryEntries.map(async (entry) => {
      const absolutePath = path.resolve(rootDirectory, entry.name);

      if (entry.isDirectory()) {
        return await collectFilesRecursively(absolutePath, predicate);
      }

      return predicate(absolutePath) ? [absolutePath] : [];
    })
  );

  return nestedResults.flat();
}

function buildSpringClassContext(annotations, classLine) {
  const classNameMatch = classLine.match(/class\s+([A-Za-z_]\w*)/);
  const className = classNameMatch ? classNameMatch[1] : "UnknownController";
  const requestMapping = annotations.find((annotation) => annotation.startsWith("@RequestMapping"));
  const basePaths = requestMapping ? extractAnnotationPaths(requestMapping) : [""];
  const controllerKind = annotations.some((annotation) => annotation.startsWith("@RestController"))
    ? "rest"
    : "controller";

  return {
    className,
    basePaths: basePaths.length > 0 ? basePaths : [""],
    controllerKind
  };
}

function normalizeSpringEndpoints(signature, methodMappings, classContext, filePath, applicationRoot, annotations) {
  const endpoints = [];

  for (const mapping of methodMappings) {
    for (const basePath of classContext.basePaths) {
      const resolvedPath = joinRoutePaths(basePath, mapping.path);
      const classifiedParameters = signature.parameters.map((parameter) =>
        classifySpringParameter(parameter, mapping.method)
      );

      const parameters = {
        path: classifiedParameters.filter((parameter) => parameter.location === "path"),
        query: classifiedParameters.filter((parameter) => parameter.location === "query"),
        header: classifiedParameters.filter((parameter) => parameter.location === "header"),
        cookie: classifiedParameters.filter((parameter) => parameter.location === "cookie")
      };

      for (const pathParameterName of extractPathParameterNames(resolvedPath)) {
        if (!parameters.path.some((parameter) => parameter.name === pathParameterName)) {
          parameters.path.push({
            location: "path",
            name: pathParameterName,
            required: true,
            schema: { type: "string" }
          });
        }
      }

      endpoints.push({
        id: `${mapping.method} ${resolvedPath}`,
        method: mapping.method,
        path: resolvedPath,
        operationId: `${classContext.className}.${signature.methodName}`,
        summary: "",
        description: "",
        tags: [classContext.className],
        discovery: {
          strategy: "spring-controller-fallback",
          sourceType: "spring-controller",
          sourceLocation: path.relative(applicationRoot, filePath)
        },
        parameters,
        request: buildSpringRequestShape(mapping.method, classifiedParameters),
        response: buildSpringResponseShape(
          mapping.method,
          signature,
          annotations,
          classContext.controllerKind
        ),
        auth: {
          required: false,
          schemes: []
        },
        classification: {
          interactionType:
            classContext.controllerKind === "rest" ||
            annotations.some((annotation) => annotation.includes("@ResponseBody"))
              ? "api"
              : "web",
          transport: "http"
        },
        springMetadata: {
          controllerClass: classContext.className,
          handlerMethod: signature.methodName,
          returnType: signature.returnType,
          annotations
        }
      });
    }
  }

  return endpoints;
}

async function discoverSpringControllerEndpoints(environment) {
  const controllerFiles = [];

  for (const sourceRoot of environment.controllerSourceRoots) {
    try {
      const files = await collectFilesRecursively(
        sourceRoot,
        (filePath) => filePath.endsWith("Controller.java")
      );
      controllerFiles.push(...files);
    }
    catch {
      // Ignore missing roots and let discovery continue with remaining locations.
    }
  }

  const endpoints = [];

  for (const controllerFile of controllerFiles) {
    const content = await fs.readFile(controllerFile, "utf8");
    const lines = content.split(/\r?\n/);
    let pendingAnnotations = [];
    let classContext = {
      className: path.basename(controllerFile, ".java"),
      basePaths: [""],
      controllerKind: "controller"
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();

      if (!line) {
        continue;
      }

      if (line.startsWith("@")) {
        pendingAnnotations.push(line);
        continue;
      }

      if (pendingAnnotations.length > 0 && /\bclass\s+[A-Za-z_]\w*/.test(line)) {
        classContext = buildSpringClassContext(pendingAnnotations, line);
        pendingAnnotations = [];
        continue;
      }

      if (pendingAnnotations.length > 0 && line.includes("public ") && line.includes("(")) {
        let signature = line;

        while (!signature.includes("{") && index + 1 < lines.length) {
          index += 1;
          signature += ` ${lines[index].trim()}`;
        }

        const parsedSignature = parseJavaMethodSignature(signature);
        if (parsedSignature) {
          const methodMappings = extractMethodMappings(pendingAnnotations);
          if (methodMappings.length > 0) {
            endpoints.push(
              ...normalizeSpringEndpoints(
                parsedSignature,
                methodMappings,
                classContext,
                controllerFile,
                environment.applicationRoot,
                pendingAnnotations
              )
            );
          }
        }

        pendingAnnotations = [];
        continue;
      }

      if (!line.startsWith("*") && !line.startsWith("//")) {
        pendingAnnotations = [];
      }
    }
  }

  return {
    strategy: "spring-controller-fallback",
    sourceType: "spring-controller",
    sourceLocation: environment.controllerSourceRoots,
    endpoints: deduplicateBy(endpoints, (endpoint) => endpoint.id).sort((left, right) =>
      `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`)
    )
  };
}

// PUBLIC_INTERFACE
/**
 * Builds the internal API catalog artifact by preferring OpenAPI discovery and falling back
 * to Spring MVC controller route discovery when no machine-readable spec is available.
 *
 * @param {{
 *   applicationRoot: string,
 *   targetBaseUrl: string,
 *   timeoutMs: number,
 *   apiSpecCandidatePaths: string[],
 *   apiSpecCandidateUrls: string[],
 *   discoveryAllowRemote: boolean,
 *   controllerSourceRoots: string[]
 * }} environment - Normalized discovery configuration and repository paths.
 * @returns {Promise<{
 *   catalogFormat: string,
 *   createdAt: string,
 *   targetBaseUrl: string,
 *   discovery: {
 *     preferredStrategy: string,
 *     selectedStrategy: string,
 *     sources: Array<{
 *       strategy: string,
 *       sourceType: string,
 *       sourceLocation: string | string[] | null,
 *       selected: boolean,
 *       endpointCount?: number,
 *       attempts?: Array<{
 *         sourceType: string,
 *         location: string,
 *         status: string,
 *         message?: string
 *       }>
 *     }>
 *   },
 *   summary: {
 *     totalEndpoints: number,
 *     apiEndpoints: number,
 *     webEndpoints: number,
 *     byMethod: Record<string, number>,
 *     bySourceType: Record<string, number>,
 *     byResponseKind: Record<string, number>
 *   },
 *   endpoints: Array<Record<string, unknown>>
 * }>} Normalized discovery catalog ready for downstream generation and execution steps.
 */
export async function buildDiscoveredApiCatalog(environment) {
  const openApiDiscovery = await discoverOpenApi(environment);
  let selectedStrategy = "spring-controller-fallback";
  let endpoints = [];
  const sources = [];

  if (openApiDiscovery.document) {
    endpoints = normalizeOpenApiDocument(
      openApiDiscovery.document,
      openApiDiscovery.sourceType,
      openApiDiscovery.sourceLocation
    );
    selectedStrategy = "openapi";
  }

  sources.push({
    strategy: "openapi",
    sourceType: openApiDiscovery.sourceType,
    sourceLocation: openApiDiscovery.sourceLocation,
    selected: Boolean(openApiDiscovery.document),
    endpointCount: endpoints.length,
    attempts: openApiDiscovery.attempts
  });

  if (endpoints.length === 0) {
    const fallbackDiscovery = await discoverSpringControllerEndpoints(environment);
    endpoints = fallbackDiscovery.endpoints;
    selectedStrategy = "spring-controller-fallback";

    sources.push({
      strategy: fallbackDiscovery.strategy,
      sourceType: fallbackDiscovery.sourceType,
      sourceLocation: fallbackDiscovery.sourceLocation,
      selected: true,
      endpointCount: fallbackDiscovery.endpoints.length
    });
  }

  const normalizedEndpoints = deduplicateBy(endpoints, (endpoint) => endpoint.id).sort((left, right) =>
    `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`)
  );

  return {
    catalogFormat: "internal-api-catalog/v1",
    createdAt: new Date().toISOString(),
    targetBaseUrl: environment.targetBaseUrl,
    discovery: {
      preferredStrategy: "openapi-first",
      selectedStrategy,
      sources
    },
    summary: buildCatalogSummary(normalizedEndpoints),
    endpoints: normalizedEndpoints
  };
}
