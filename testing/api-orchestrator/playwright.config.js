import { defineConfig } from "@playwright/test";
import { loadEnvironmentConfig } from "./src/config/environment.js";

const environment = loadEnvironmentConfig();

export default defineConfig({
  testDir: "./tests",
  timeout: environment.timeoutMs,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: environment.parallelism,
  reporter: [
    ["list"],
    ["json", { outputFile: `${environment.outputDir}/reports/playwright-results.json` }],
    ["html", { outputFolder: `${environment.outputDir}/playwright-report`, open: "never" }]
  ],
  use: {
    baseURL: environment.targetBaseUrl,
    ignoreHTTPSErrors: environment.ignoreHttpsErrors
  }
});
