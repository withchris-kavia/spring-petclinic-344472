# API Orchestrator Workspace

This folder is an isolated Node.js sidecar workspace for the AI-powered API testing system. It is intentionally separated from the Maven and Gradle build so the existing Spring Boot application behavior remains unchanged.

## Purpose

The workspace establishes the baseline structure for:

- API discovery
- AI-driven test generation
- Playwright-backed execution
- MCP adapter configuration
- Report and artifact generation
- CI-friendly command entrypoints

The initial scaffold created the orchestration boundary and CLI/configuration. Discovery is now implemented for step 02.00, while generation, execution, and detailed reporting will be expanded in later steps.

## Folder layout

- `src/cli.js` — command entrypoint
- `src/config/` — environment and workspace path loading
- `src/core/` — filesystem bootstrap, artifact helpers, and discovery engine
- `src/adapters/` — Playwright and MCP integration descriptors
- `src/commands/` — baseline command implementations
- `tests/` — Playwright test directory reserved for later steps
- `artifacts/` — generated outputs, reports, and execution metadata

## Commands

Run these commands from `testing/api-orchestrator/` after dependencies are installed:

- `npm run doctor` — validate workspace configuration and emit a readiness summary
- `npm run discover` — build the normalized internal API catalog
- `npm run generate` — create the baseline generated-scenario scaffold
- `npm run execute` — create the baseline execution-plan scaffold
- `npm run report` — create the baseline report scaffold
- `npm run pipeline` — run the baseline workflow end-to-end
- `npm run test:e2e` — run Playwright with the project config
- `npm run test:e2e:install` — install Chromium for Playwright

## Discovery behavior

The `discover` command now uses a two-stage strategy:

1. **OpenAPI/Swagger-first discovery**
   - Looks for JSON spec files such as `openapi.json` and `swagger.json`
   - Tries common runtime endpoints such as `/v3/api-docs`, `/swagger.json`, `/v2/api-docs`, and `/openapi.json`

2. **Spring MVC fallback discovery**
   - Scans Java controller classes under the configured source roots
   - Extracts class-level and method-level mappings such as `@RequestMapping`, `@GetMapping`, and `@PostMapping`
   - Normalizes Spring route information into the same internal catalog shape used for OpenAPI results

## Discovery artifact

`npm run discover` writes:

- `artifacts/discovery/api-catalog.json`

The catalog contains:

- selected discovery strategy
- source attempts and selected source metadata
- normalized endpoints
- request and response metadata
- auth hints
- route classification (`api` vs `web`)
- summary counts for later generation/execution steps

## Environment variables

This workspace does not read `.env` files directly. The runtime environment should provide variables, and the orchestrator can map them from the platform-managed `.env`.

See `.env.example` for the expected variable names. Discovery also supports these optional overrides:

- `API_TEST_OPENAPI_PATHS` — comma-separated local JSON spec paths
- `API_TEST_OPENAPI_URLS` — comma-separated runtime spec URLs
- `API_TEST_DISCOVERY_ALLOW_REMOTE` — whether runtime URL probing is allowed
- `API_TEST_CONTROLLER_SOURCE_ROOTS` — comma-separated Spring source roots to scan

## Notes

- No Spring Boot application files are modified by this workspace.
- No server startup behavior is changed here.
- The Playwright config avoids auto-starting the Spring application so the existing app lifecycle remains under platform or CI control.
- The current Spring Petclinic app appears to be primarily MVC and HTML-oriented, so the fallback catalog includes both JSON-style and web-form/page routes for downstream classification.
