import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = process.env.STORYRAIL_TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error(
    "STORYRAIL_TEST_DATABASE_URL is required for browser acceptance tests and must point to a disposable test database.",
  );
}
let parsedTestDatabaseUrl: URL;
let testDatabaseName: string;
try {
  parsedTestDatabaseUrl = new URL(testDatabaseUrl);
  testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
} catch {
  throw new Error("STORYRAIL_TEST_DATABASE_URL must be a valid PostgreSQL URL.");
}
if (
  (parsedTestDatabaseUrl.protocol !== "postgres:" &&
    parsedTestDatabaseUrl.protocol !== "postgresql:") ||
  parsedTestDatabaseUrl.hostname.length === 0 ||
  testDatabaseName !== "storyrail_test"
) {
  throw new Error(
    "STORYRAIL_TEST_DATABASE_URL must be a PostgreSQL URL for a database named exactly storyrail_test.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3134",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm migrate && pnpm exec next dev --port 3134",
    url: "http://localhost:3134/api/sites",
    reuseExistingServer: false,
    env: {
      STORYRAIL_DATABASE_URL: testDatabaseUrl,
    },
  },
});
