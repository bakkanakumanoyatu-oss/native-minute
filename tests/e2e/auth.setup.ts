import { mkdir, writeFile } from "node:fs/promises";
import { test } from "@playwright/test";
import { authArtifactRoot, authStorageStatePath } from "./auth-artifact-policy";
import { DEFAULT_E2E_TEST_SECRET, getE2ETestEnvValue } from "./e2e-env";
import { postJsonWithRetry } from "./request-helpers";

const e2eSecret = getE2ETestEnvValue(process.env.E2E_TEST_SECRET, DEFAULT_E2E_TEST_SECRET);

test("create authenticated storage state", async ({ page }) => {
  await mkdir(authArtifactRoot, { mode: 0o700, recursive: true });
  await page.goto("/");

  await postJsonWithRetry(page.context().request, "/api/test-login", {
    secret: e2eSecret
  });

  const storageState = await page.context().storageState();
  await writeFile(authStorageStatePath, JSON.stringify(storageState), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
});
