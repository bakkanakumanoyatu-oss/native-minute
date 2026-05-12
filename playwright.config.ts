import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { defineConfig, devices } from "@playwright/test";
import { DEFAULT_E2E_TEST_EMAIL, DEFAULT_E2E_TEST_PASSWORD, DEFAULT_E2E_TEST_SECRET, getE2ETestEnvValue } from "./tests/e2e/e2e-env";
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
const e2eDistDir = `.next-e2e-${port}`;
const e2eTestSecret = getE2ETestEnvValue(process.env.E2E_TEST_SECRET, DEFAULT_E2E_TEST_SECRET);
const e2eTestEmail = getE2ETestEnvValue(process.env.E2E_TEST_EMAIL, DEFAULT_E2E_TEST_EMAIL);
const e2eTestPassword = getE2ETestEnvValue(process.env.E2E_TEST_PASSWORD, DEFAULT_E2E_TEST_PASSWORD);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    timeout: 180_000,
    env: {
      ...process.env,
      NEXT_DIST_DIR: e2eDistDir,
      E2E_TEST_SECRET: e2eTestSecret,
      E2E_TEST_EMAIL: e2eTestEmail,
      E2E_TEST_PASSWORD: e2eTestPassword,
      TRANSCRIPTION_PROVIDER: "mock",
      VOICE_PROVIDER: "mock",
      PRONUNCIATION_PROVIDER: "mock"
    },
    url: baseURL,
    reuseExistingServer: false
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json"
      },
      dependencies: ["setup"]
    }
  ]
});
