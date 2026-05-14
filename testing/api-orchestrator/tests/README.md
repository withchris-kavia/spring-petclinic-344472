# Playwright UI Preview Tests

This directory now contains curated Playwright end-to-end coverage for the running Spring Petclinic preview UI on port `3001`.

## Current coverage

The `petclinic-preview.spec.js` suite covers the preview application's core user-facing flows:

- welcome page load and shell rendering
- top-level navigation (`/`, `/owners/find`, `/vets.html`)
- seeded owner search flows
- owner creation form
- pet creation form
- visit creation form
- basic mobile/responsive navigation behavior

Reusable helpers live in `tests/helpers/petclinic-ui.js` so future specs can share the same navigation, form, and assertion patterns.

## Expected target

By default the workspace now points Playwright at:

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

- The suite uses stable user-facing headings, labels, and seeded demo data to keep assertions readable.
- The owner/pet/visit flow generates unique values so repeated runs do not collide with earlier E2E-created records.
- The tests are written to run independently so one failure does not block the remaining preview coverage.
- On failure, Playwright retains trace, screenshot, and video artifacts under `artifacts/playwright-output/` and writes JSON/JUnit/HTML reports under `artifacts/reports/`.
