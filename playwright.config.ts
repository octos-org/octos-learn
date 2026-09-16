import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 1,
  workers: 2,
  reporter: [["html", { open: "never" }], ["list"]],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:5174",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
