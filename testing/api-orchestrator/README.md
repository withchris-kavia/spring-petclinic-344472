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

Steps 01.00 and 02.00 created the workspace and normalized discovery pipeline. Step 03.00 now adds heuristic AI-style scenario generation, smart assertion profiles, and failure-analysis utilities so downstream execution can consume ready-made scenario artifacts.

## Folder layout

- `src/cli.js` — command entrypoint
- `src/config/` — environment and workspace path loading
- `src/core/` — filesystem bootstrap, artifact helpers, discovery engine, scenario generation, smart assertions, and failure analysis
- `src/adapters/` — Playwright and MCP integration descriptors
- `src/commands/` — command implementations
- `tests/` — Playwright test directory reserved for generated or curated specs
- `artifacts/` — generated outputs, reports, and execution metadata

## Commands

Run these commands from `testing/api-orchestrator/` after dependencies are installed:

- `npm run doctor` — validate workspace configuration and emit a readiness summary
- `npm run discover` — build the normalized internal API catalog
- `npm run generate` — generate scenario, fixture, and manifest artifacts from the discovery catalog
- `npm run execute` — create the baseline execution-plan scaffold
- `npm run report` — create the baseline report scaffold
- `npm run pipeline` — run the baseline workflow end-to-end
- `npm run test:e2e` — run Playwright with the project config
- `npm run test:e2e:install` — install Chromium for Playwright

## Discovery behavior

The `discover` command uses a two-stage strategy:

1. **OpenAPI/Swagger-first discovery**
   - Looks for JSON spec files such as `openapi.json` and `swagger.json`
   - Tries common runtime endpoints such as `/v3/api-docs`, `/swagger.json`, `/v2/api-docs`, and `/openapi.json`

2. **Spring MVC fallback discovery**
   - Scans Java controller classes under the configured source roots
   - Extracts class-level and method-level mappings such as `@RequestMapping`, `@GetMapping`, and `@PostMapping`
   - Normalizes Spring route information into the same internal catalog shape used for OpenAPI results

## Generation behavior

The `generate` command consumes the normalized API catalog and emits downstream-ready scenario artifacts. If the discovery artifact is missing, the command rebuilds it automatically before generation.

Generated scenarios include heuristic coverage for:

- positive flows
- negative and not-found flows
- validation checks
- authentication checks when auth metadata is present
- security-oriented payload probes
- edge-case and boundary inputs
- lightweight performance probes suitable for CI

Each scenario now carries:

- inferred request fixtures
- execution hints
- declarative smart assertions
- structured failure-analysis guidance

## Generated artifacts

`npm run generate` writes:

- `artifacts/generated/generated-scenarios.json`
- `artifacts/generated/scenario-manifest.json`
- `artifacts/generated/scenario-fixtures.json`

The scenario artifact contains:

- source catalog metadata
- coverage summaries by category and method
- per-endpoint fixtures
- scenario request templates
- smart assertion profiles
- failure-analysis guidance
- a shared payload library for security and edge-case testing

The manifest artifact contains:

- scenario IDs grouped for smoke, serial, and performance execution
- default parallelism hints
- required environment-variable references for auth-bearing scenarios
- file references for downstream execution stages

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
- summary counts for later generation and execution steps

## Environment variables

This workspace does not read `.env` files directly. The runtime environment should provide variables, and the orchestrator can map them from the platform-managed `.env`.

See `.env.example` for the expected variable names. Discovery also supports these optional overrides:

- `API_TEST_OPENAPI_PATHS` — comma-separated local JSON spec paths
- `API_TEST_OPENAPI_URLS` — comma-separated runtime spec URLs
- `API_TEST_DISCOVERY_ALLOW_REMOTE` — whether runtime URL probing is allowed
- `API_TEST_CONTROLLER_SOURCE_ROOTS` — comma-separated Spring source roots to scan

If later execution uses authenticated scenarios, the generated manifest may reference additional runtime secrets such as bearer tokens. Those should be provided through the platform-managed environment rather than hard-coded in source.

## Notes

- No Spring Boot application files are modified by this workspace.
- No server startup behavior is changed here.
- The Playwright config avoids auto-starting the Spring application so the existing app lifecycle remains under platform or CI control.
- The current Spring Petclinic app appears to be primarily MVC and HTML-oriented, so generated scenarios include both API-style and web-oriented assertion/failure hints.
- Step 04.00 will connect these generated artifacts to real execution, reporting, and CI-oriented parallel workflows.
