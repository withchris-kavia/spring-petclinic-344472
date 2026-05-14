# Playwright UI Preview Tests

This directory contains curated Playwright end-to-end coverage for the running Spring Petclinic preview UI on port `3001`.

## Suite breakdown

The workspace now provides a categorized Playwright suite:

- `petclinic-preview-smoke.spec.js`
  - critical welcome-page load
  - navbar reachability
  - core HTML entrypoints
  - health and primary JSON endpoint checks

- `petclinic-preview.spec.js`
  - regression coverage for main owner/pet/visit flows
  - UI rendering checks
  - shared navigation behavior
  - form validation coverage

- `petclinic-preview-reliability.spec.js`
  - navigation latency checks
  - timeout handling
  - retry and transient-failure recovery scenarios

- `petclinic-preview-api.spec.js`
  - JSON response validation for `/actuator/health` and `/vets`
  - HTML response validation for server-rendered owner-search flows
  - shared error-page response validation for `/oups`

## Reusable helpers

Reusable helpers live in `tests/helpers/`:

- `petclinic-ui.js`
  - route navigation helpers
  - owner/pet/visit workflow helpers
  - inline validation assertions
  - shared error-page assertions
  - retry and navigation-timing utilities

- `petclinic-api.js`
  - JSON response assertions
  - HTML response assertions
  - Petclinic `/vets` payload contract validation

These helpers keep the specs focused on scenario intent while centralizing stable assertions.

## Selector strategy

The UI suites intentionally prefer stable, user-facing selectors derived from the server-rendered Thymeleaf templates:

- shared IDs such as `#search-owner-form`, `#owners`, `#vets`, and `#success-message`
- accessible labels for form fields
- top-level headings
- surrounding `.form-group` containers for inline validation assertions

This keeps the assertions aligned with the real UI structure without depending on brittle CSS layout details.

## Expected target

By default the workspace points Playwright at:

- `http://127.0.0.1:3001`

You can override that target with:

- `API_TEST_TARGET_BASE_URL`

If your preview URL uses an internal or self-signed HTTPS certificate, also set:

- `API_TEST_IGNORE_HTTPS_ERRORS=true`

## Cross-browser execution

The Playwright config now defines these browser projects:

- `chromium`
- `firefox`
- `webkit`

Default `npm run test:e2e` executions use the configured Playwright projects, and targeted browser runs are available through dedicated npm scripts.

## Example commands

Run from `testing/api-orchestrator/`:

- `npm run test:e2e`
- `npm run test:e2e:smoke`
- `npm run test:e2e:regression`
- `npm run test:e2e:api`
- `npm run test:e2e:cross-browser`
- `npm run test:e2e:chromium`
- `npm run test:e2e:firefox`
- `npm run test:e2e:webkit`
- `CI=true npm run test:e2e:ci`

Install browser dependencies if needed:

- `npm run test:e2e:install`

## Notes

- The suite uses seeded demo data and stable template selectors to keep assertions readable and maintainable.
- Owner-detail URL handling tolerates Spring `;jsessionid=...` path rewriting so direct-search flows remain reliable across environments.
- The owner/pet/visit creation flow generates unique values so repeated runs do not collide with earlier E2E-created records.
- The reliability suite simulates transient document failures with `page.route(...)` interception so retry behavior can be tested deterministically without changing the application code.
- The API validation suite intentionally checks both JSON endpoints and server-rendered HTML responses because the application is primarily MVC-driven.
- The tests are written to run independently so one failure does not block the remaining preview coverage.
- On failure, Playwright retains trace, screenshot, and video artifacts under `artifacts/playwright-output/` and writes JSON/JUnit/HTML reports under `artifacts/reports/`.
