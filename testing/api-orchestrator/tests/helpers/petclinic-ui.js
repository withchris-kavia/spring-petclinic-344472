import { expect } from "@playwright/test";

async function waitForPetclinicShell(page) {
  await expect(page.locator("nav.navbar")).toBeVisible();
  await expect(page.locator("body")).toBeVisible();
}

// PUBLIC_INTERFACE
/**
 * Navigates to a Petclinic route and waits for the shared application shell and
 * an optional visible page heading before continuing test actions.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {string} path - Relative application path to visit.
 * @param {string | RegExp} [expectedHeading] - Optional heading expected on the destination page.
 * @returns {Promise<void>} Resolves after the route is ready for interaction.
 */
export async function gotoRoute(page, path, expectedHeading) {
  await page.goto(path);
  await waitForPetclinicShell(page);

  if (expectedHeading) {
    await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible();
  }
}

// PUBLIC_INTERFACE
/**
 * Expands the responsive primary navigation when the mobile toggle is visible.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @returns {Promise<void>} Resolves after the navigation links are accessible.
 */
export async function openPrimaryNavigationIfNeeded(page) {
  const navbarToggle = page.locator(".navbar-toggler");

  if (await navbarToggle.isVisible()) {
    await navbarToggle.click();
  }

  await expect(page.locator("#main-navbar")).toBeVisible();
}

// PUBLIC_INTERFACE
/**
 * Clicks a top-level navigation link and verifies both the destination URL and heading.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {string | RegExp} linkName - Accessible navigation link name.
 * @param {RegExp} expectedUrl - URL pattern expected after navigation.
 * @param {string | RegExp} expectedHeading - Heading expected on the destination page.
 * @returns {Promise<void>} Resolves after navigation assertions pass.
 */
export async function clickPrimaryNavigation(page, linkName, expectedUrl, expectedHeading) {
  await openPrimaryNavigationIfNeeded(page);
  await page.getByRole("link", { name: linkName }).click();
  await expect(page).toHaveURL(expectedUrl);
  await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible();
}

// PUBLIC_INTERFACE
/**
 * Submits the owner search form with a last-name query and waits for the resulting navigation.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {string} lastName - Last-name search term to submit.
 * @returns {Promise<void>} Resolves after the search request is submitted.
 */
export async function submitOwnerSearch(page, lastName) {
  await page.getByLabel(/Last name/i).fill(lastName);
  await page.getByRole("button", { name: /Find Owner/i }).click();
}

// PUBLIC_INTERFACE
/**
 * Creates a new owner through the Petclinic UI and verifies the redirect to the owner details page.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {{
 *   firstName: string,
 *   lastName: string,
 *   address: string,
 *   city: string,
 *   telephone: string
 * }} owner - Owner details to submit through the form.
 * @returns {Promise<string>} The resulting owner details URL.
 */
export async function createOwner(page, owner) {
  await gotoRoute(page, "/owners/new", /^Owner$/i);

  await page.getByLabel(/First Name/i).fill(owner.firstName);
  await page.getByLabel(/Last Name/i).fill(owner.lastName);
  await page.getByLabel(/Address/i).fill(owner.address);
  await page.getByLabel(/City/i).fill(owner.city);
  await page.getByLabel(/Telephone/i).fill(owner.telephone);
  await page.getByRole("button", { name: /Add Owner/i }).click();

  await expect(page).toHaveURL(/\/owners\/\d+$/);
  await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();

  return page.url();
}

// PUBLIC_INTERFACE
/**
 * Adds a pet for the currently displayed owner and verifies the owner details page shows the new pet.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {{
 *   name: string,
 *   birthDate: string,
 *   type: string
 * }} pet - Pet details to submit through the form.
 * @returns {Promise<void>} Resolves after the new pet appears on the owner details page.
 */
export async function addPetForCurrentOwner(page, pet) {
  await page.getByRole("link", { name: /Add New Pet/i }).click();
  await expect(page.getByRole("heading", { name: /Pet/i })).toBeVisible();

  await page.getByLabel(/^Name$/i).fill(pet.name);
  await page.getByLabel(/Birth Date/i).fill(pet.birthDate);
  await page.getByLabel(/^Type$/i).selectOption({ label: pet.type });
  await page.getByRole("button", { name: /Add Pet/i }).click();

  await expect(page).toHaveURL(/\/owners\/\d+$/);
  await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();
  await expect(page.getByText(pet.name, { exact: true })).toBeVisible();
}

// PUBLIC_INTERFACE
/**
 * Adds a visit for the currently displayed owner's pet and verifies the visit appears in the history.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {{
 *   date: string,
 *   description: string
 * }} visit - Visit details to submit.
 * @returns {Promise<void>} Resolves after the visit is visible on the owner details page.
 */
export async function addVisitForCurrentPet(page, visit) {
  await page.getByRole("link", { name: /Add Visit/i }).click();
  await expect(page.getByRole("heading", { name: /Visit/i })).toBeVisible();

  await page.getByLabel(/^Date$/i).fill(visit.date);
  await page.getByLabel(/Description/i).fill(visit.description);
  await page.getByRole("button", { name: /Add Visit/i }).click();

  await expect(page).toHaveURL(/\/owners\/\d+$/);
  await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();
  await expect(page.getByText(visit.description, { exact: true })).toBeVisible();
}
