import { defineConfig } from "@playwright/test";

if (!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT) {
  throw new Error("Set OCTOS_LOCAL_COURSE_PACK_ROOT to the validated publication directory");
}
const mode = process.env.OCTOS_COURSE_TEST_ANDROID === "1" ? "android" : "local-https";
const defaultPort = mode === "android" ? 5176 : 5175;
const requestedPort = Number(process.env.OCTOS_COURSE_TEST_PORT ?? defaultPort);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535) {
  throw new Error("OCTOS_COURSE_TEST_PORT must be a valid TCP port");
}
const port = requestedPort;
export default defineConfig({
  testDir: "./tests",
  testMatch: "curated-course-packs.spec.ts",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `test-results/curated-${mode}`,
  webServer: {
    command: `pnpm exec vite --mode ${mode} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
  },
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    browserName: "chromium",
    viewport: { width: 1920, height: 1080 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
