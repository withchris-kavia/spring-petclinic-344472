import { defineConfig, devices } from "@playwright/test";
import { loadEnvironmentConfig } from "./src/config/environment.js";

const environment = loadEnvironmentConfig();
const reportsDir = `${environment.outputDir}/reports`;
const reporters = process.env.CI
  ? [
    ["line"],
    ["json", { outputFile: `${reportsDir}/playwright-results.json` }],
    ["junit", { outputFile: `${reportsDir}/playwright-junit.xml` }],
    ["html", { outputFolder: `${reportsDir}/playwright-html`, open: "never" }]
  ]
  : [
    ["list"],
    ["json", { outputFile: `${reportsDir}/playwright-results.json` }],
    ["html", { outputFolder: `${reportsDir}/playwright-html`, open: "never" }]
  ];

export default defineConfig({
  testDir: "./tests",
  timeout: environment.timeoutMs,
  expect: {
    timeout: 10_000
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: environment.parallelism,
  outputDir: `${environment.outputDir}/playwright-output`,
  reporter: reporters,
  use: {
    baseURL: environment.targetBaseUrl,
    headless: environment.headless,
    ignoreHTTPSErrors: environment.ignoreHttpsErrors,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"]
      }
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"]
      }
    }
  ]
});
