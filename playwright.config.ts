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
  webServer: [
    {
      command: "node e2e/support/external-services.mjs",
      url: "http://127.0.0.1:3135/health",
      reuseExistingServer: false,
    },
    {
      command:
        "node e2e/support/reset-test-database.mjs && pnpm migrate && pnpm exec next dev --port 3134",
      url: "http://localhost:3134/api/sites",
      reuseExistingServer: false,
      // PostgreSQL integration tests remove the application schema without necessarily removing
      // the public migration ledger. Resetting both acceptance-owned structures avoids that stale
      // inverse state, then deliberately reapplies the complete history before Next starts. Keep
      // this bounded allowance above Playwright's 60-second default for the full replay.
      timeout: 180_000,
      env: {
        STORYRAIL_DATABASE_URL: testDatabaseUrl,
        STORYRAIL_CREDENTIAL_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
        STORYRAIL_OPENROUTER_BASE_URL: "http://127.0.0.1:3135/openrouter",
        STORYRAIL_OPERATOR_ID: "acceptance-operator",
      },
    },
  ],
});
