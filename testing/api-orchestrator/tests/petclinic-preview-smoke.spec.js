import { expect, test } from "@playwright/test";
import {
  expectPetclinicVetsPayload,
  fetchHtmlResponse,
  fetchJsonResponse
} from "./helpers/petclinic-api.js";
import { clickPrimaryNavigation, gotoRoute } from "./helpers/petclinic-ui.js";

test.describe("Spring Petclinic preview smoke coverage", () => {
  test("loads the welcome shell and keeps the primary navigation reachable", async ({ page }) => {
    await gotoRoute(page, "/", /Welcome/i);

    await expect(page).toHaveTitle(/PetClinic/i);
    await expect(page.locator(".navbar")).toBeVisible();

    await clickPrimaryNavigation(page, /Find Owners/i, /\/owners\/find$/, /Find Owners/i);
    await expect(page.locator("#search-owner-form")).toBeVisible();

    await clickPrimaryNavigation(page, /Veterinarians/i, /\/vets\.html(?:\?.*)?$/, /Veterinarians/i);
    await expect(page.locator("#vets tbody tr")).toHaveCount(5);

    await clickPrimaryNavigation(page, /Home/i, /\/$/, /Welcome/i);
  });

  test("keeps critical health and preview data endpoints responsive", async ({ request }) => {
    const { json: healthPayload } = await fetchJsonResponse(request, "/actuator/health");
    const { json: vetsPayload } = await fetchJsonResponse(request, "/vets");

    await fetchHtmlResponse(request, "/", {
      bodyPatterns: [/PetClinic/i, /Welcome/i]
    });

    await fetchHtmlResponse(request, "/owners/find", {
      bodyPatterns: [/Find Owners/i]
    });

    expect(healthPayload.status).toBe("UP");
    expectPetclinicVetsPayload(vetsPayload, { minimumVetCount: 5 });
  });
});
