import { expect } from "@playwright/test";

function getResponseHeader(response, headerName) {
  return response.headers()[headerName.toLowerCase()] ?? "";
}

function normalizeExpectedPatterns(expectedPatterns) {
  if (!expectedPatterns) {
    return [];
  }

  return Array.isArray(expectedPatterns) ? expectedPatterns : [expectedPatterns];
}

function contentTypeMatches(contentType, expectedContentType) {
  if (expectedContentType instanceof RegExp) {
    return expectedContentType.test(contentType);
  }

  return contentType.includes(String(expectedContentType));
}

function assertContentTypeMatches(contentType, expectedContentType) {
  const expectedPatterns = normalizeExpectedPatterns(expectedContentType);

  if (expectedPatterns.length === 0) {
    return;
  }

  const matchesAnyExpectedPattern = expectedPatterns.some((pattern) =>
    contentTypeMatches(contentType, pattern)
  );

  expect(matchesAnyExpectedPattern).toBeTruthy();
}

function assertTextMatches(text, expectedPatterns) {
  for (const expectedPattern of normalizeExpectedPatterns(expectedPatterns)) {
    if (expectedPattern instanceof RegExp) {
      expect(text).toMatch(expectedPattern);
      continue;
    }

    expect(text).toContain(String(expectedPattern));
  }
}

// PUBLIC_INTERFACE
/**
 * Validates a JSON HTTP response and returns the parsed payload for further assertions.
 *
 * @param {import("@playwright/test").APIResponse} response - Playwright API response to validate.
 * @param {{
 *   expectedStatus?: number,
 *   expectedContentType?: string
 * }} [options] - Expected HTTP status and content type fragment.
 * @returns {Promise<{
 *   response: import("@playwright/test").APIResponse,
 *   json: unknown,
 *   contentType: string
 * }>} Parsed JSON payload and response metadata.
 */
export async function expectJsonResponse(response, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const expectedContentType = options.expectedContentType ?? ["application/json", /\+json\b/i];
  const contentType = getResponseHeader(response, "content-type");

  expect(response.status()).toBe(expectedStatus);
  assertContentTypeMatches(contentType, expectedContentType);

  return {
    response,
    json: await response.json(),
    contentType
  };
}

// PUBLIC_INTERFACE
/**
 * Fetches a JSON endpoint relative to the configured Playwright base URL and validates the response.
 *
 * @param {import("@playwright/test").APIRequestContext} request - Playwright API request context.
 * @param {string} path - Relative application path to request.
 * @param {{
 *   expectedStatus?: number,
 *   expectedContentType?: string,
 *   params?: Record<string, string | number | boolean>,
 *   headers?: Record<string, string>
 * }} [options] - Request and validation options.
 * @returns {Promise<{
 *   response: import("@playwright/test").APIResponse,
 *   json: unknown,
 *   contentType: string
 * }>} Parsed JSON payload and response metadata.
 */
export async function fetchJsonResponse(request, path, options = {}) {
  const response = await request.get(path, {
    failOnStatusCode: false,
    params: options.params,
    headers: options.headers
  });

  return expectJsonResponse(response, options);
}

// PUBLIC_INTERFACE
/**
 * Validates an HTML or text response and returns the response body after checking key markers.
 *
 * @param {import("@playwright/test").APIResponse} response - Playwright API response to validate.
 * @param {{
 *   expectedStatus?: number,
 *   expectedContentType?: string,
 *   bodyPatterns?: Array<string | RegExp> | string | RegExp
 * }} [options] - Expected HTTP status, content type fragment, and body markers.
 * @returns {Promise<{
 *   response: import("@playwright/test").APIResponse,
 *   body: string,
 *   contentType: string
 * }>} Text body and response metadata.
 */
export async function expectHtmlResponse(response, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const expectedContentType = options.expectedContentType ?? "text/html";
  const contentType = getResponseHeader(response, "content-type");
  const body = await response.text();

  expect(response.status()).toBe(expectedStatus);
  assertContentTypeMatches(contentType, expectedContentType);
  assertTextMatches(body, options.bodyPatterns);

  return {
    response,
    body,
    contentType
  };
}

// PUBLIC_INTERFACE
/**
 * Fetches an HTML endpoint relative to the configured Playwright base URL and validates the response.
 *
 * @param {import("@playwright/test").APIRequestContext} request - Playwright API request context.
 * @param {string} path - Relative application path to request.
 * @param {{
 *   expectedStatus?: number,
 *   expectedContentType?: string,
 *   bodyPatterns?: Array<string | RegExp> | string | RegExp,
 *   params?: Record<string, string | number | boolean>,
 *   headers?: Record<string, string>
 * }} [options] - Request and validation options.
 * @returns {Promise<{
 *   response: import("@playwright/test").APIResponse,
 *   body: string,
 *   contentType: string
 * }>} Text body and response metadata.
 */
export async function fetchHtmlResponse(request, path, options = {}) {
  const response = await request.get(path, {
    failOnStatusCode: false,
    params: options.params,
    headers: options.headers
  });

  return expectHtmlResponse(response, options);
}

// PUBLIC_INTERFACE
/**
 * Validates the JSON contract returned by the Petclinic `/vets` endpoint.
 *
 * @param {{ vetList?: Array<{
 *   id?: number,
 *   firstName?: string,
 *   lastName?: string,
 *   specialties?: Array<{ id?: number, name?: string }>
 * }> }} payload - Parsed JSON payload returned by the Petclinic vets endpoint.
 * @param {{
 *   minimumVetCount?: number
 * }} [options] - Minimum collection size expectations.
 * @returns {void}
 */
export function expectPetclinicVetsPayload(payload, options = {}) {
  const minimumVetCount = options.minimumVetCount ?? 1;

  expect(payload).toBeTruthy();
  expect(Array.isArray(payload.vetList)).toBeTruthy();
  expect(payload.vetList.length).toBeGreaterThanOrEqual(minimumVetCount);

  for (const vet of payload.vetList) {
    expect(typeof vet.firstName).toBe("string");
    expect(vet.firstName.length).toBeGreaterThan(0);
    expect(typeof vet.lastName).toBe("string");
    expect(vet.lastName.length).toBeGreaterThan(0);
    expect(Array.isArray(vet.specialties)).toBeTruthy();

    for (const specialty of vet.specialties) {
      expect(typeof specialty.name).toBe("string");
      expect(specialty.name.length).toBeGreaterThan(0);
    }
  }
}
