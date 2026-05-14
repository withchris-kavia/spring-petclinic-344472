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
    await expect(page).toHaveURL(/\/owners\/1(?:;jsessionid=[^/?#]+)?(?:\?.*)?$/);
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

  test("shows a validation message when no owners match the search", async ({ page }) => {
    await gotoRoute(page, "/owners/find", /Find Owners/i);

    await submitOwnerSearch(page, `NoMatch${Date.now()}`);

    await expect(page).toHaveURL(/\/owners(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: /Find Owners/i })).toBeVisible();
    await expect(page.locator("#lastNameGroup .help-inline")).toContainText(/not found/i);
    await expect(page.locator("#search-owner-form")).toBeVisible();
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

  test("validates owner form input and keeps the user on the form", async ({ page }) => {
    await gotoRoute(page, "/owners/new", /^Owner$/i);

    await page.getByLabel(/First Name/i).fill("Validation");
    await page.getByLabel(/Last Name/i).fill("Check");
    await page.getByLabel(/Address/i).fill("456 Regression Lane");
    await page.getByLabel(/City/i).fill("Verona");
    await page.getByLabel(/Telephone/i).fill("1234");

    await page.getByRole("button", { name: /Add Owner/i }).click();

    await expect(page).toHaveURL(/\/owners\/new(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: /^Owner$/i })).toBeVisible();

    const telephoneGroup = page.locator("#add-owner-form .form-group", {
      has: page.locator('input[name="telephone"], input#telephone')
    }).first();

    await expect(telephoneGroup).toContainText(/10-digit number|numeric/i);
    await expect(page.getByRole("button", { name: /Add Owner/i })).toBeVisible();
  });

  test("prevents duplicate pets and invalid birth dates with inline validation", async ({ page }) => {
    await gotoRoute(page, "/owners/find", /Find Owners/i);
    await submitOwnerSearch(page, "Franklin");
    await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();

    await page.getByRole("link", { name: /Add New Pet/i }).click();
    await expect(page.getByRole("heading", { name: /Pet/i })).toBeVisible();

    await page.getByLabel(/^Name$/i).fill("Leo");
    await page.getByLabel(/Birth Date/i).fill("2099-01-01");
    await page.getByLabel(/^Type$/i).selectOption({ label: "dog" });
    await page.getByRole("button", { name: /Add Pet/i }).click();

    await expect(page).toHaveURL(/\/owners\/\d+\/pets\/new(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: /Pet/i })).toBeVisible();
    await expect(page.getByLabel(/^Name$/i)).toHaveValue("Leo");

    const petNameGroup = page.locator("form .form-group", {
      has: page.locator('input[name="name"], input#name')
    }).first();
    const petBirthDateGroup = page.locator("form .form-group", {
      has: page.locator('input[name="birthDate"], input#birthDate')
    }).first();

    await expect(petNameGroup).toContainText(/already in use|already exists|duplicate/i);
    await expect(petBirthDateGroup).toContainText(/invalid date/i);
  });

  test("surfaces visit form validation errors without leaving the page", async ({ page }) => {
    await gotoRoute(page, "/owners/find", /Find Owners/i);
    await submitOwnerSearch(page, "Franklin");
    await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();

    await page.getByRole("link", { name: /Add Visit/i }).first().click();
    await expect(page.getByRole("heading", { name: /Visit/i })).toBeVisible();

    await page.getByRole("button", { name: /Add Visit/i }).click();

    await expect(page).toHaveURL(/\/owners\/\d+\/pets\/\d+\/visits\/new(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: /Visit/i })).toBeVisible();
    await expect(page.locator("form .has-error").first()).toBeVisible();
    await expect(page.locator("form")).toContainText(/required|must not|invalid/i);
  });

  test("renders the shared error page from the primary navigation", async ({ page }) => {
    await gotoRoute(page, "/", /Welcome/i);

    await clickPrimaryNavigation(page, /Error/i, /\/oups(?:\?.*)?$/, /Something happened/i);

    await expect(page.getByText(/internal server error occurred|unexpected error occurred/i)).toBeVisible();
    await expect(page.getByText(/Expected: controller used to showcase/i)).toBeVisible();
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
