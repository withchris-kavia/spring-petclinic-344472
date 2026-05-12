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

The initial step only creates the orchestration boundary and baseline CLI/configuration. Discovery, generation, execution logic, and detailed reporting will be expanded in subsequent implementation steps.

## Folder layout

- `src/cli.js` — command entrypoint
- `src/config/` — environment and workspace path loading
- `src/core/` — filesystem bootstrap and artifact helpers
- `src/adapters/` — Playwright and MCP integration descriptors
- `src/commands/` — baseline command implementations
- `tests/` — Playwright test directory reserved for later steps
- `artifacts/` — generated outputs, reports, and execution metadata

## Commands

Run these commands from `testing/api-orchestrator/` after dependencies are installed:

- `npm run doctor` — validate workspace configuration and emit a readiness summary
- `npm run discover` — create the baseline discovery artifact scaffold
- `npm run generate` — create the baseline generated-scenario scaffold
- `npm run execute` — create the baseline execution-plan scaffold
- `npm run report` — create the baseline report scaffold
- `npm run pipeline` — run the baseline workflow end-to-end
- `npm run test:e2e` — run Playwright with the project config
- `npm run test:e2e:install` — install Chromium for Playwright

## Environment variables

This workspace does not read `.env` files directly. The runtime environment should provide variables, and the orchestrator can map them from the platform-managed `.env`.

See `.env.example` for the expected variable names.

## Notes

- No Spring Boot application files are modified by this workspace.
- No server startup behavior is changed here.
- The Playwright config avoids auto-starting the Spring application so the existing app lifecycle remains under platform or CI control.
