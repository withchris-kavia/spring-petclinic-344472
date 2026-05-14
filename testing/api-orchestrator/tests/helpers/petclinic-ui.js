import { expect } from "@playwright/test";

const OWNER_DETAILS_URL_PATTERN = /\/owners\/\d+(?:;jsessionid=[^/?#]+)?(?:\?.*)?$/;
const OWNER_SEARCH_RESULT_URL_PATTERN = /\/owners(?:\/\d+(?:;jsessionid=[^/?#]+)?)?(?:\?.*)?$/;

async function waitForPetclinicShell(page) {
  await expect(page.locator("nav.navbar")).toBeVisible();
  await expect(page.locator("body")).toBeVisible();
}

async function getOwnerSearchLastNameField(page) {
  const searchForm = page.locator("#search-owner-form");
  const lastNameField = searchForm.locator('input[name="lastName"], input#lastName').first();

  await expect(searchForm).toBeVisible();
  await expect(lastNameField).toBeVisible({ timeout: 10_000 });
  await expect(lastNameField).toBeEditable({ timeout: 10_000 });

  return lastNameField;
}

function resolveFormLocator(page, formOrSelector = "form") {
  if (typeof formOrSelector === "string") {
    return page.locator(formOrSelector);
  }

  return formOrSelector;
}

function getFieldGroup(formLocator, fieldSelector) {
  const field = formLocator.locator(fieldSelector).first();
  return field.locator(
    "xpath=ancestor::*[" +
      "contains(concat(' ', normalize-space(@class), ' '), ' form-group ') or " +
      "contains(concat(' ', normalize-space(@class), ' '), ' control-group ')" +
      "][1]"
  );
}

function waitForMilliseconds(delayMs) {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function expectOwnerDetailsPage(page) {
  await expect(page).toHaveURL(OWNER_DETAILS_URL_PATTERN);
  await expect(page.getByRole("heading", { name: /Owner Information/i })).toBeVisible();
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
 * Navigates to a Petclinic route, waits for the shared shell, and returns a simple
 * timing snapshot that reliability-oriented tests can assert against.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {string} path - Relative application path to visit.
 * @param {string | RegExp} [expectedHeading] - Optional heading expected on the destination page.
 * @param {{
 *   gotoOptions?: Parameters<import("@playwright/test").Page["goto"]>[1],
 *   headingTimeoutMs?: number
 * }} [options] - Optional navigation and heading-visibility controls.
 * @returns {Promise<{
 *   navigationDurationMs: number,
 *   finalUrl: string
 * }>} Timing data for the completed navigation.
 */
export async function gotoRouteWithTiming(page, path, expectedHeading, options = {}) {
  const startedAt = Date.now();

  await page.goto(path, options.gotoOptions);
  await waitForPetclinicShell(page);

  if (expectedHeading) {
    await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible({
      timeout: options.headingTimeoutMs ?? 10_000
    });
  }

  return {
    navigationDurationMs: Date.now() - startedAt,
    finalUrl: page.url()
  };
}

// PUBLIC_INTERFACE
/**
 * Executes a reusable asynchronous UI action with bounded retries so reliability
 * tests can simulate transient failures and verify successful recovery behavior.
 *
 * @template T
 * @param {(attempt: number) => Promise<T>} action - Asynchronous action to run for each attempt.
 * @param {{
 *   attempts?: number,
 *   delayMs?: number,
 *   shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>,
 *   onRetry?: (context: {
 *     error: unknown,
 *     attempt: number,
 *     attempts: number
 *   }) => Promise<void> | void
 * }} [options] - Retry controls and optional retry hooks.
 * @returns {Promise<{
 *   attemptCount: number,
 *   result: T
 * }>} The successful result and the attempt number that produced it.
 */
export async function retryPetclinicAction(action, options = {}) {
  const attempts = Math.max(options.attempts ?? 2, 1);
  const delayMs = Math.max(options.delayMs ?? 0, 0);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await action(attempt);

      return {
        attemptCount: attempt,
        result
      };
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        throw error;
      }

      const shouldRetry = options.shouldRetry
        ? await options.shouldRetry(error, attempt)
        : true;

      if (!shouldRetry) {
        throw error;
      }

      if (options.onRetry) {
        await options.onRetry({ error, attempt, attempts });
      }

      await waitForMilliseconds(delayMs);
    }
  }

  throw lastError;
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
 * @param {{
 *   timeoutMs?: number
 * }} [options] - Optional navigation timeout overrides for resilience scenarios.
 * @returns {Promise<void>} Resolves after the search request is submitted.
 */
export async function submitOwnerSearch(page, lastName, options = {}) {
  const searchForm = page.locator("#search-owner-form");
  const lastNameField = await getOwnerSearchLastNameField(page);
  const submitButton = searchForm.getByRole("button", { name: /Find Owner/i });

  await lastNameField.fill(lastName, { timeout: 10_000 });
  await expect(submitButton).toBeEnabled({ timeout: 10_000 });

  await Promise.all([
    page.waitForURL(OWNER_SEARCH_RESULT_URL_PATTERN, { timeout: options.timeoutMs ?? 15_000 }),
    submitButton.click()
  ]);
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

  await expectOwnerDetailsPage(page);

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

  await expectOwnerDetailsPage(page);
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

  await expectOwnerDetailsPage(page);
  await expect(page.getByText(visit.description, { exact: true })).toBeVisible();
}

// PUBLIC_INTERFACE
/**
 * Searches for a seeded owner by last name and verifies the owner details page is displayed.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {string} lastName - Seeded owner last name expected to resolve to a single result.
 * @returns {Promise<void>} Resolves after the owner details page is visible.
 */
export async function openOwnerDetailsFromSearch(page, lastName) {
  await gotoRoute(page, "/owners/find", /Find Owners/i);
  await submitOwnerSearch(page, lastName);
  await expectOwnerDetailsPage(page);
}

// PUBLIC_INTERFACE
/**
 * Asserts that a specific form field renders an inline validation error in its surrounding field group.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {{
 *   form?: string | import("@playwright/test").Locator,
 *   fieldSelector: string,
 *   errorPattern: string | RegExp
 * }} options - Form scope, target field selector, and expected inline error content.
 * @returns {Promise<void>} Resolves after the matching inline validation text is visible.
 */
export async function expectFormFieldError(page, options) {
  const formLocator = resolveFormLocator(page, options.form ?? "form");
  const fieldGroup = getFieldGroup(formLocator, options.fieldSelector);
  const inlineError = fieldGroup.locator(".help-inline, .help-block, [role='alert']").first();

  await expect(formLocator).toBeVisible();
  await expect(fieldGroup).toBeVisible();

  if ((await inlineError.count()) > 0) {
    await expect(inlineError).toContainText(options.errorPattern);
    return;
  }

  await expect(fieldGroup).toContainText(options.errorPattern);
}

// PUBLIC_INTERFACE
/**
 * Verifies that the Petclinic shared error page is rendered and optionally asserts a specific error detail.
 *
 * @param {import("@playwright/test").Page} page - The current Playwright page.
 * @param {string | RegExp} [detailPattern] - Optional status/detail message expected on the error page.
 * @returns {Promise<void>} Resolves after the shared error screen assertions pass.
 */
export async function expectSharedErrorPage(page, detailPattern) {
  await expect(page.getByRole("heading", { name: /Something happened/i })).toBeVisible();

  if (detailPattern) {
    await expect(page.locator("body")).toContainText(detailPattern);
  }
}
