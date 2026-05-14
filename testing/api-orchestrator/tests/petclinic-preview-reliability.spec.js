import { expect, test } from "@playwright/test";
import {
  expectOwnerDetailsRouteReady,
  gotoRoute,
  gotoRouteWithTiming,
  retryPetclinicAction,
  submitOwnerSearch
} from "./helpers/petclinic-ui.js";

const OWNER_DETAILS_URL_PATTERN = /\/owners\/1(?:;jsessionid=[^/?#]+)?(?:\?.*)?$/;
const OWNER_SEARCH_ROUTE_PATTERN = "**/owners?lastName=Franklin";
const VETERINARIANS_ROUTE_PATTERN = "**/vets.html";

async function readNavigationPerformance(page) {
  return page.evaluate(() => {
    const [navigationEntry] = performance.getEntriesByType("navigation");

    if (!navigationEntry) {
      return null;
    }

    return {
      domContentLoadedMs: Math.round(navigationEntry.domContentLoadedEventEnd),
      loadEventMs: Math.round(navigationEntry.loadEventEnd),
      responseEndMs: Math.round(navigationEntry.responseEnd)
    };
  });
}

test.describe("Spring Petclinic preview UI reliability and performance", () => {
  test("loads the welcome page within an acceptable preview latency budget", async ({ page }) => {
    const navigation = await gotoRouteWithTiming(page, "/", /Welcome/i);
    const performanceSnapshot = await readNavigationPerformance(page);

    expect(navigation.navigationDurationMs).toBeLessThan(10_000);
    expect(performanceSnapshot).not.toBeNull();
    expect(performanceSnapshot.domContentLoadedMs).toBeLessThan(8_000);
    expect(performanceSnapshot.loadEventMs).toBeLessThan(10_000);
    expect(performanceSnapshot.responseEndMs).toBeLessThanOrEqual(performanceSnapshot.loadEventMs);

    await expect(page.locator(".navbar")).toBeVisible();
  });

  test("surfaces an explicit timeout for a delayed navigation and then recovers cleanly", async ({ page }) => {
    const delayedVeterinariansRoute = async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1_500);
      });

      await route.continue();
    };

    await page.route(VETERINARIANS_ROUTE_PATTERN, delayedVeterinariansRoute);

    await expect(
      gotoRouteWithTiming(page, "/vets.html", /Veterinarians/i, {
        gotoOptions: {
          timeout: 750,
          waitUntil: "domcontentloaded"
        },
        headingTimeoutMs: 750
      })
    ).rejects.toThrow(/Timeout/i);

    // Let the delayed route complete before resetting to a known-good state.
    await page.waitForTimeout(1_000);
    await page.unroute(VETERINARIANS_ROUTE_PATTERN, delayedVeterinariansRoute);

    await gotoRoute(page, "/", /Welcome/i);

    const recoveredNavigation = await gotoRouteWithTiming(page, "/vets.html", /Veterinarians/i);

    expect(recoveredNavigation.navigationDurationMs).toBeLessThan(10_000);
    await expect(page.locator("#vets tbody tr")).toHaveCount(5);
  });

  test("retries owner search after a transient network failure and still reaches owner details", async ({ page }) => {
    let interceptedAttempts = 0;
    const flakyOwnerSearchRoute = async (route) => {
      interceptedAttempts += 1;

      if (interceptedAttempts === 1) {
        await route.abort("failed");
        return;
      }

      await route.continue();
    };

    await page.route(OWNER_SEARCH_ROUTE_PATTERN, flakyOwnerSearchRoute);

    const retryResult = await retryPetclinicAction(
      async () => {
        await gotoRoute(page, "/owners/find", /Find Owners/i);
        await submitOwnerSearch(page, "Franklin", { timeoutMs: 1_500 });

        await expect(page).toHaveURL(OWNER_DETAILS_URL_PATTERN);
        await expectOwnerDetailsRouteReady(page);
      },
      {
        attempts: 2,
        delayMs: 250,
        shouldRetry: async (error) => /Timeout|ERR_|Navigation|net::/i.test(String(error))
      }
    );

    await page.unroute(OWNER_SEARCH_ROUTE_PATTERN, flakyOwnerSearchRoute);

    expect(retryResult.attemptCount).toBe(2);
    expect(interceptedAttempts).toBe(2);
    await expect(page.getByText("George Franklin", { exact: true })).toBeVisible();
  });
});
