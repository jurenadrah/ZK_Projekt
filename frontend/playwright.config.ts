import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }]
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node tests/mock-supabase-server.mjs",
      url: "http://127.0.0.1:54321/health",
      reuseExistingServer: false
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:8080/api",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "playwright-test-key",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321"
      }
    }
  ]
});
