import { defineConfig } from "@playwright/test";
import { loadEnvironmentConfig } from "./src/config/environment.js";

const environment = loadEnvironmentConfig();
const reporters = process.env.CI
  ? [
    ["line"],
    ["json", { outputFile: `${environment.outputDir}/reports/playwright-results.json` }],
    ["junit", { outputFile: `${environment.outputDir}/reports/playwright-junit.xml` }]
  ]
  : [
    ["list"],
    ["json", { outputFile: `${environment.outputDir}/reports/playwright-results.json` }],
    ["html", { outputFolder: `${environment.outputDir}/playwright-report`, open: "never" }]
  ];

export default defineConfig({
  testDir: "./tests",
  timeout: environment.timeoutMs,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: environment.parallelism,
  outputDir: `${environment.outputDir}/playwright-output`,
  reporter: reporters,
  use: {
    baseURL: environment.targetBaseUrl,
    ignoreHTTPSErrors: environment.ignoreHttpsErrors
  }
});
