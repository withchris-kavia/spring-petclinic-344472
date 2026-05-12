// PUBLIC_INTERFACE
/**
 * Builds a serializable Playwright runtime descriptor for the current workspace environment.
 *
 * @param {{
 *   targetBaseUrl: string,
 *   timeoutMs: number,
 *   parallelism: number,
 *   headless: boolean,
 *   ignoreHttpsErrors: boolean
 * }} environment - Normalized environment configuration.
 * @returns {{
 *   targetBaseUrl: string,
 *   timeoutMs: number,
 *   parallelism: number,
 *   headless: boolean,
 *   ignoreHttpsErrors: boolean
 * }} Baseline Playwright execution settings.
 */
export function buildPlaywrightRuntimeDescriptor(environment) {
  return {
    targetBaseUrl: environment.targetBaseUrl,
    timeoutMs: environment.timeoutMs,
    parallelism: environment.parallelism,
    headless: environment.headless,
    ignoreHttpsErrors: environment.ignoreHttpsErrors
  };
}
