import { expect, test } from "@playwright/test";
import {
  addPetForCurrentOwner,
  addVisitForCurrentPet,
  clickPrimaryNavigation,
  createOwner,
  gotoRoute,
  openPrimaryNavigationIfNeeded,
  submitOwnerSearch
} from "./helpers/petclinic-ui.js";

test.describe("Spring Petclinic preview UI core flows", () => {
  test("loads the welcome page and supports top-level navigation", async ({ page }) => {
    await gotoRoute(page, "/", /Welcome/i);

    await expect(page).toHaveTitle(/PetClinic/i);
    await expect(page.locator(".navbar")).toBeVisible();
    await expect(page.getByRole("img", { name: /VMware Tanzu Logo/i })).toBeVisible();

    // Verify the primary user journeys exposed by the shared navbar.
    await clickPrimaryNavigation(page, /Find Owners/i, /\/owners\/find$/, /Find Owners/i);
    await expect(page.locator("#search-owner-form")).toBeVisible();

    await clickPrimaryNavigation(page, /Veterinarians/i, /\/vets\.html(?:\?.*)?$/, /Veterinarians/i);
    await expect(page.locator("#vets tbody tr")).toHaveCount(5);

    await clickPrimaryNavigation(page, /Home/i, /\/$/, /Welcome/i);
  });

  test("supports seeded owner search results and detail navigation", async ({ page }) => {
    await gotoRoute(page, "/owners/find", /Find Owners/i);

    // A unique seeded last name should redirect directly to the owner's details page.
    await submitOwnerSearch(page, "Franklin");
    await expect(page).toHaveURL(/\/owners\/1$/);
    await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();
    await expect(page.getByText("George Franklin", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pets and Visits/i })).toBeVisible();
    await expect(page.getByText("Leo", { exact: true })).toBeVisible();

    // A shared last name should stay on the listing page and show both seeded owners.
    await gotoRoute(page, "/owners/find", /Find Owners/i);
    await submitOwnerSearch(page, "Davis");
    await expect(page).toHaveURL(/\/owners(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: /^Owners$/i })).toBeVisible();
    await expect(page.locator("#owners tbody tr")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Betty Davis" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Harold Davis" })).toBeVisible();
  });

  test("completes the owner, pet, and visit forms end to end", async ({ page }) => {
    const uniqueSuffix = `${Date.now()}`;
    const owner = {
      firstName: "E2E",
      lastName: `Preview${uniqueSuffix}`,
      address: "123 Playwright Way",
      city: "Madison",
      telephone: "6085550000"
    };
    const pet = {
      name: `Scout${uniqueSuffix}`,
      birthDate: "2020-05-12",
      type: "dog"
    };
    const visit = {
      date: "2024-05-12",
      description: `Routine check ${uniqueSuffix}`
    };

    await createOwner(page, owner);
    await expect(page.locator("#success-message")).toContainText("New Owner Created");
    await expect(page.getByText(`${owner.firstName} ${owner.lastName}`, { exact: true })).toBeVisible();
    await expect(page.getByText(owner.address, { exact: true })).toBeVisible();

    // The owner details page is the hub for the primary CRUD-style flows.
    await addPetForCurrentOwner(page, pet);
    await expect(page.locator("#success-message")).toContainText("New Pet has been Added");

    await addVisitForCurrentPet(page, visit);
    await expect(page.locator("#success-message")).toContainText("Your visit has been booked");
  });

  test("keeps the main navigation usable on a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await gotoRoute(page, "/", /Welcome/i);
    await expect(page.locator(".navbar-toggler")).toBeVisible();

    // This validates the collapsed navigation and a basic mobile path to a core page.
    await openPrimaryNavigationIfNeeded(page);
    await clickPrimaryNavigation(page, /Find Owners/i, /\/owners\/find$/, /Find Owners/i);

    await expect(page.locator("#search-owner-form")).toBeVisible();
    await expect(page.locator('#search-owner-form input[name="lastName"], #search-owner-form input#lastName').first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Find Owner/i })).toBeVisible();
  });
});
