# Playwright UI Preview Tests

This directory contains curated Playwright end-to-end coverage for the running Spring Petclinic preview UI on port `3001`.

## Current coverage

The `petclinic-preview.spec.js` suite now covers both the core user journeys and higher-risk UI edge cases:

- welcome page load and shared shell rendering
- top-level navigation (`/`, `/owners/find`, `/vets.html`, `/oups`)
- seeded owner search flows (single match, multi-match, empty broad search, no-match validation)
- owner creation flow
- owner-form required-field and telephone validation states
- pet creation flow
- pet-form required-field, duplicate-name, and future-date validation states
- visit creation flow
- visit-form validation handling
- shared error page rendering for intentionally broken routes
- basic mobile/responsive navigation behavior

The companion `petclinic-preview-reliability.spec.js` suite adds reusable stability-focused coverage for:

- welcome-page latency budgets using navigation timing data from the active preview URL
- explicit timeout handling for delayed page navigations
- retry-based recovery after simulated transient network failures during owner search

Reusable helpers live in `tests/helpers/petclinic-ui.js` so future specs can share the same navigation, form, assertion, timeout, timing, and bounded-retry patterns. In particular, the helpers expose stable utilities for inline form validation assertions, shared error-page checks, navigation timing measurements, and retry-wrapped UI actions.

## Selector strategy

The suite intentionally prefers stable, user-facing selectors derived from the server-rendered Thymeleaf templates:

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

## Example commands

Run from `testing/api-orchestrator/`:

- `npm run test:e2e`
- `CI=true npm run test:e2e:ci`

Install browser dependencies if needed:

- `npm run test:e2e:install`

## Notes

- The suite uses seeded demo data and stable template selectors to keep assertions readable and maintainable.
- Owner-detail URL handling tolerates Spring `;jsessionid=...` path rewriting so direct-search flows remain reliable across environments.
- The owner/pet/visit creation flow generates unique values so repeated runs do not collide with earlier E2E-created records.
- The reliability suite simulates transient document failures with `page.route(...)` interception so retry behavior can be tested deterministically without changing the application code.
- The tests are written to run independently so one failure does not block the remaining preview coverage.
- On failure, Playwright retains trace, screenshot, and video artifacts under `artifacts/playwright-output/` and writes JSON/JUnit/HTML reports under `artifacts/reports/`.
