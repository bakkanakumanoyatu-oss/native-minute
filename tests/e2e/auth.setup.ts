import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DEFAULT_E2E_TEST_SECRET, getE2ETestEnvValue } from "./e2e-env";
import { postJsonWithRetry } from "./request-helpers";

const authStatePath = "tests/e2e/.auth/user.json";
const e2eSecret = getE2ETestEnvValue(process.env.E2E_TEST_SECRET, DEFAULT_E2E_TEST_SECRET);

test("create authenticated storage state", async ({ page }) => {
  await mkdir("tests/e2e/.auth", { recursive: true });
  await page.goto("/");

  const result = await postJsonWithRetry(page.context().request, "/api/test-login", {
    secret: e2eSecret
  });

  expect(result.ok, JSON.stringify(result.payload)).toBeTruthy();
  await page.context().storageState({ path: authStatePath });
});
