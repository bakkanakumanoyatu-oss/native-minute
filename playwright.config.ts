import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { defineConfig, devices } from "@playwright/test";
import {
  authGuardOutputDir,
  authSetupOutputDir,
  authStorageStatePath
} from "./tests/e2e/auth-artifact-policy";
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
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
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
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      outputDir: authSetupOutputDir,
      use: {
        trace: "off",
        screenshot: "off",
        video: "off"
      }
    },
    {
      name: "auth-guard",
      testMatch: /auth-guard\.spec\.ts/,
      outputDir: authGuardOutputDir,
      use: {
        ...devices["Desktop Chrome"],
        storageState: {
          cookies: [],
          origins: []
        },
        trace: "off",
        screenshot: "off",
        video: "off"
      }
    },
    {
      name: "chromium",
      testIgnore: /auth-guard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStorageStatePath
      },
      dependencies: ["auth-setup"]
    }
  ]
});
