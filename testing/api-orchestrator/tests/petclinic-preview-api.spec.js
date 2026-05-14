import { expect, test } from "@playwright/test";
import {
  expectPetclinicVetsPayload,
  fetchHtmlResponse,
  fetchJsonResponse
} from "./helpers/petclinic-api.js";

test.describe("Spring Petclinic preview API response validation", () => {
  test("returns a healthy actuator status payload", async ({ request }) => {
    const { json: healthPayload, response } = await fetchJsonResponse(request, "/actuator/health");

    expect(response.ok()).toBeTruthy();
    expect(healthPayload.status).toBe("UP");
    expect(healthPayload).toHaveProperty("status");
  });

  test("returns the vets JSON collection contract", async ({ request }) => {
    const { json: vetsPayload, response } = await fetchJsonResponse(request, "/vets");

    expect(response.ok()).toBeTruthy();
    expectPetclinicVetsPayload(vetsPayload, { minimumVetCount: 5 });
    expect(vetsPayload.vetList.some((vet) => vet.specialties.length > 0)).toBeTruthy();
  });

  test("returns an owner-details redirect for a direct-match search flow", async ({ request }) => {
    const response = await request.get("/owners", {
      failOnStatusCode: false,
      maxRedirects: 0,
      params: {
        lastName: "Franklin"
      }
    });

    expect([302, 303]).toContain(response.status());
    expect(response.headers().location ?? "").toMatch(/\/owners\/1(?:;jsessionid=[^/?#]+)?$/);
  });

  test("returns owner-search validation HTML for a no-match flow", async ({ request }) => {
    const noMatchLastName = `PlaywrightNoMatch${Date.now()}`;
    const { body, response } = await fetchHtmlResponse(request, "/owners", {
      params: {
        lastName: noMatchLastName
      },
      bodyPatterns: [/Find Owners/i, /has not been found|not found/i]
    });

    expect(response.ok()).toBeTruthy();
    expect(body).toMatch(/has not been found|not found/i);
  });

  test("returns negotiated error responses for the crash route", async ({ request }) => {
    const { body } = await fetchHtmlResponse(request, "/oups", {
      expectedStatus: 500,
      headers: {
        Accept: "text/html"
      },
      bodyPatterns: [
        /Something happened/i,
        /internal server error occurred|unexpected error occurred/i,
        /Expected: controller used to showcase/i
      ]
    });

    expect(body).toContain("Expected: controller used to showcase");

    const { json: errorPayload, response: jsonResponse } = await fetchJsonResponse(request, "/oups", {
      expectedStatus: 500,
      headers: {
        Accept: "application/json"
      }
    });

    expect(jsonResponse.ok()).toBeFalsy();
    expect(errorPayload.status).toBe(500);
    expect(String(errorPayload.path ?? "")).toContain("/oups");
    expect(String(errorPayload.error ?? "")).toMatch(/error/i);
  });
});
