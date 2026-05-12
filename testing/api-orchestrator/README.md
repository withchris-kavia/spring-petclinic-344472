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

Steps 01.00 and 02.00 created the workspace and normalized discovery pipeline. Step 03.00 added heuristic AI-style scenario generation, smart assertion profiles, and failure-analysis utilities. Step 04.00 now connects generated scenarios to Playwright execution, emits structured logs, produces detailed reports, and adds CI/parallel-oriented workflow commands.

## Folder layout

- `src/cli.js` — command entrypoint
- `src/config/` — environment and workspace path loading
- `src/core/` — filesystem bootstrap, artifact helpers, discovery engine, scenario generation, smart assertions, and failure analysis
- `src/adapters/` — Playwright runtime and MCP hook descriptors
- `src/commands/` — command implementations
- `tests/` — Playwright test directory reserved for generated or curated specs
- `artifacts/` — generated outputs, reports, execution metadata, and logs

## Commands

Run these commands from `testing/api-orchestrator/` after dependencies are installed:

- `npm run doctor` — validate workspace configuration and emit a readiness summary
- `npm run discover` — build the normalized internal API catalog
- `npm run generate` — generate scenario, fixture, and manifest artifacts from the discovery catalog
- `npm run execute` — run generated scenarios with the Playwright API runtime and write execution artifacts
- `npm run execute:ci` — run execution in CI mode with non-zero exit codes on failures
- `npm run execute:parallel` — run execution with a higher default worker count
- `npm run report` — synthesize detailed JSON and Markdown reports from the latest execution outputs
- `npm run report:ci` — build reports in CI mode
- `npm run pipeline` — run doctor → discover → generate → execute → report
- `npm run pipeline:ci` — run the full pipeline in CI mode
- `npm run pipeline:parallel` — run the full pipeline with increased parallelism
- `npm run test:e2e` — run Playwright with the project config
- `npm run test:e2e:ci` — run Playwright’s native runner in CI-friendly mode
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

Each scenario carries:

- inferred request fixtures
- execution hints
- declarative smart assertions
- structured failure-analysis guidance

## Execution behavior

The `execute` command consumes generated scenarios and runs them through the Playwright API request runtime.

Execution now provides:

- automatic generation fallback when scenario artifacts are missing
- scenario selection via `API_TEST_SCENARIO_FILTER`
- scenario limits via `API_TEST_SCENARIO_LIMIT`
- serial and parallel scheduling derived from manifest/runtime hints
- Playwright-backed request execution with latency capture
- smart assertion evaluation for status, headers, body shape, and latency
- failure-analysis summaries for non-passing scenarios
- structured JSONL logs for CI and downstream analysis
- MCP hook envelopes emitted at execution, scenario, request, response, and failure boundaries

## Reporting behavior

The `report` command reads the latest execution artifacts and produces both machine-readable and human-readable outputs.

Reports include:

- overall pass/fail counts and pass rate
- per-category and per-status breakdowns
- slowest scenarios by max/average latency
- aggregated failure digests
- repeated probable-cause summaries
- references to the source execution artifacts and structured logs

## Generated artifacts

`npm run generate` writes:

- `artifacts/generated/generated-scenarios.json`
- `artifacts/generated/scenario-manifest.json`
- `artifacts/generated/scenario-fixtures.json`

`npm run execute` writes:

- `artifacts/execution/execution-plan.json`
- `artifacts/execution/scenario-results.json`
- `artifacts/execution/execution-summary.json`
- `artifacts/logs/execute-events.jsonl`

`npm run report` writes:

- `artifacts/reports/report-index.json`
- `artifacts/reports/report.md`

The Playwright native runner config additionally writes reporter output beneath:

- `artifacts/reports/`
- `artifacts/playwright-output/`
- `artifacts/playwright-report/` (local HTML reporter)

## Environment variables

This workspace does not read `.env` files directly. The runtime environment should provide variables, and the orchestrator can map them from the platform-managed `.env`.

See `.env.example` for the expected variable names. Discovery also supports these optional overrides:

- `API_TEST_OPENAPI_PATHS` — comma-separated local JSON spec paths
- `API_TEST_OPENAPI_URLS` — comma-separated runtime spec URLs
- `API_TEST_DISCOVERY_ALLOW_REMOTE` — whether runtime URL probing is allowed
- `API_TEST_CONTROLLER_SOURCE_ROOTS` — comma-separated Spring source roots to scan

Execution and reporting also support:

- `API_TEST_PARALLELISM` — worker count for parallelizable scenarios
- `API_TEST_FAIL_FAST` — stop queueing new work after the first non-passing scenario
- `API_TEST_FOLLOW_REDIRECTS` — whether Playwright should follow redirects during execution
- `API_TEST_SCENARIO_FILTER` — comma-separated terms matched against scenario ids/titles/tags
- `API_TEST_SCENARIO_LIMIT` — maximum number of selected scenarios
- `API_TEST_REPORT_INCLUDE_PASSED` — whether reports include passed scenario details
- `API_TEST_MCP_SERVER_COMMAND` / `API_TEST_MCP_SERVER_ARGS` — optional MCP server metadata for hook descriptors

If later execution uses authenticated scenarios, the generated manifest may reference additional runtime secrets such as bearer tokens. Those should be provided through the platform-managed environment rather than hard-coded in source.

## Notes

- No Spring Boot application files are modified by this workspace.
- No server startup behavior is changed here.
- The Playwright config avoids auto-starting the Spring application so the existing app lifecycle remains under platform or CI control.
- The current Spring Petclinic app appears to be primarily MVC and HTML-oriented, so generated scenarios include both API-style and web-oriented assertion/failure hints.
- MCP integration in this step is implemented as explicit hook envelopes and structured execution boundaries so a live MCP client can be attached later without changing scenario contracts.
