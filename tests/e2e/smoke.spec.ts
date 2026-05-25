import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_E2E_TEST_SECRET, getE2ETestEnvValue } from "./e2e-env";
import { postJsonViaPageWithRetry } from "./request-helpers";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/sample-recording.webm");
const e2eSecret = getE2ETestEnvValue(process.env.E2E_TEST_SECRET, DEFAULT_E2E_TEST_SECRET);

type SeedSmokeScriptResponse = {
  data?: {
    script?: {
      id: string;
      title: string;
    };
  };
};

type VoiceConsentResponse = {
  data?: {
    consent?: {
      id?: string;
    };
  };
};

type SpeakScriptResponse = {
  data?: {
    audioUrl?: string;
    cached?: boolean;
  };
};

type AudioElementReadiness = {
  currentSrc: string;
  duration: number;
  readyState: number;
};

async function resetCurrentProviderVoiceSetup(page: Page) {
  const result = await postJsonViaPageWithRetry(page, "/api/test-voice-state", {
    secret: e2eSecret,
    action: "reset_current_provider_voice_setup"
  });

  expect(result.ok, JSON.stringify(result.payload)).toBeTruthy();
}

async function setCurrentProviderUnavailable(page: Page) {
  const result = await postJsonViaPageWithRetry(page, "/api/test-voice-state", {
    secret: e2eSecret,
    action: "set_current_provider_unavailable"
  });

  expect(result.ok, JSON.stringify(result.payload)).toBeTruthy();
}

async function collectRuntimeErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return {
    consoleErrors,
    pageErrors
  };
}

function getRelevantConsoleErrors(messages: string[]) {
  return messages.filter((message) => message !== "Failed to load resource: the server responded with a status of 404 (Not Found)");
}

async function seedSmokeScript(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("body")).toBeVisible();
  const seedResult = await postJsonViaPageWithRetry<SeedSmokeScriptResponse>(page, "/api/test-seed-script", {
    secret: e2eSecret
  }, {
    attempts: 4,
    retryDelayMs: 500
  });
  const seededScript = seedResult.payload?.data?.script;

  if (!seededScript) {
    throw new Error("seed script のレスポンスから script を取得できませんでした。");
  }

  return seededScript;
}

async function ensureMockVoiceReady(page: Page) {
  await resetCurrentProviderVoiceSetup(page);

  const consentResult = await postJsonViaPageWithRetry<VoiceConsentResponse>(page, "/api/voice-consent", {
    accepted: true
  });

  expect(consentResult.ok, JSON.stringify(consentResult.payload)).toBeTruthy();

  const consentId = consentResult.payload?.data?.consent?.id;

  if (!consentId) {
    throw new Error("voice-consent のレスポンスから consent id を取得できませんでした。");
  }

  const createVoiceResult = await postJsonViaPageWithRetry(page, "/api/create-voice", {
    consentId,
    label: "E2E Smoke Voice",
    sampleAudioPath: "mock://samples/e2e-smoke.wav"
  });

  expect(createVoiceResult.ok, JSON.stringify(createVoiceResult.payload)).toBeTruthy();
}

async function ensureMockListenAudioReady(page: Page, scriptId: string) {
  await ensureMockVoiceReady(page);

  const speakResult = await postJsonViaPageWithRetry<SpeakScriptResponse>(page, "/api/speak-script", {
    scriptId
  }, {
    attempts: 3,
    retryDelayMs: 400
  });

  expect(speakResult.ok, JSON.stringify(speakResult.payload)).toBeTruthy();
  expect(speakResult.payload?.data?.audioUrl).toBeTruthy();
}

async function waitForListenAudioPlaybackReady(page: Page) {
  const audio = page.getByTestId("listen-audio-element");
  await expect(audio).toBeVisible();

  await audio.evaluate((element) => {
    (element as HTMLAudioElement).load();
  });

  await expect
    .poll<AudioElementReadiness | null>(
      async () =>
        audio.evaluate((element) => {
          const media = element as HTMLAudioElement;
          return {
            currentSrc: media.currentSrc,
            duration: media.duration,
            readyState: media.readyState
          };
        }),
      {
        timeout: 10_000,
        message: "saved listen audio が playback 可能状態までロードされませんでした。"
      }
    )
    .toMatchObject({
      currentSrc: expect.stringMatching(/\/api\/script-audio\/[^/]+$/),
      readyState: expect.any(Number),
      duration: expect.any(Number)
    });

  await expect
    .poll(
      async () =>
        audio.evaluate((element) => {
          const media = element as HTMLAudioElement;
          return {
            hasDuration: Number.isFinite(media.duration) && media.duration > 0,
            canPlay: media.readyState >= 2
          };
        }),
      {
        timeout: 10_000,
        message: "saved listen audio の metadata / readyState が十分に上がりませんでした。"
      }
    )
    .toEqual({
      hasDuration: true,
      canPlay: true
    });
}

async function expectListenMiniControlsCanSeek(page: Page) {
  const audio = page.getByTestId("listen-audio-element");

  await page.getByTestId("listen-segmented-practice").locator("summary").click();
  const segmentedPractice = page.getByTestId("listen-segmented-practice");
  await expect(segmentedPractice.getByText(/区切り 1/)).toBeVisible();
  const firstChunk = segmentedPractice.locator("li").first();
  const forwardButton = firstChunk.getByRole("button", { name: "3進む" });
  const backButton = firstChunk.getByRole("button", { name: "3戻る" });
  await expect(forwardButton).toBeEnabled();
  await expect(backButton).toBeEnabled();

  await audio.evaluate((element) => {
    const media = element as HTMLAudioElement;
    media.currentTime = 0;
  });
  await forwardButton.click();
  await expect
    .poll(
      async () =>
        audio.evaluate((element) => {
          const media = element as HTMLAudioElement;
          return media.currentTime;
        }),
      {
        timeout: 5_000,
        message: "mini controls の 3秒進むで currentTime が変わりませんでした。"
      }
    )
    .toBeGreaterThan(0);

  await backButton.click();
  await expect
    .poll(
      async () =>
        audio.evaluate((element) => {
          const media = element as HTMLAudioElement;
          return media.currentTime;
        }),
      {
        timeout: 5_000,
        message: "mini controls の 3秒戻るで currentTime が 0 に戻りませんでした。"
      }
    )
    .toBe(0);
}

test("authenticated user can complete the minimal record -> review -> progress happy path", async ({ page }) => {
  const { consoleErrors, pageErrors } = await collectRuntimeErrors(page);
  const scriptsResponse = await page.goto("/scripts");

  expect(scriptsResponse).not.toBeNull();
  expect(scriptsResponse?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/scripts$/);
  await expect(page.locator('a[href="/scripts/new"]').first()).toBeVisible();

  const seededScript = await seedSmokeScript(page);

  await page.goto(`/scripts/${seededScript.id}/record`);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/record$`));
  await expect(page.getByTestId("record-file-input")).toBeAttached();
  const transcriptionStatus = page.getByTestId("record-transcription-status");
  const pronunciationStatus = page.getByTestId("record-pronunciation-status");
  await expect(transcriptionStatus).toHaveAttribute("data-supported", "true");
  await expect(pronunciationStatus).toHaveAttribute("data-supported", "true");

  await page.getByTestId("record-file-input").setInputFiles({
    name: "sample-recording.webm",
    mimeType: "audio/webm",
    buffer: await readFile(fixturePath)
  });
  await expect(page.getByTestId("record-selected-file")).toBeVisible();

  const transcriptionProvider = await transcriptionStatus.getAttribute("data-provider");

  if (transcriptionProvider === "mock") {
    const fallbackTranscript =
      "Good morning. This is my one-minute Native Minute practice. I am speaking clearly and finishing every sentence with intention.";

    await page.getByTestId("record-transcript-fallback").fill(fallbackTranscript);
    await expect(page.getByTestId("record-transcript-fallback")).toHaveValue(fallbackTranscript);
  }

  await expect(page.getByTestId("record-submit-button")).toBeEnabled();
  await page.getByTestId("record-submit-button").click();
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/review/[^/]+$`), { timeout: 30000 });
  const takeId = page.url().split("/").pop();
  expect(takeId).toBeTruthy();
  await expect(page.getByTestId("review-root")).toBeVisible();
  await expect(page.getByTestId("review-score-grid")).toBeVisible();
  await expect(page.getByTestId("review-transcript-block")).toContainText(/./);

  await page.goto("/progress");
  await expect(page).toHaveURL(/\/progress$/);
  const progressCard = page.getByTestId(`progress-script-card-${seededScript.id}`);
  await expect(progressCard).toBeVisible();
  await expect(page.getByTestId("progress-script-list")).toContainText(seededScript.title);
  await expect(progressCard.locator(`a[href="/scripts/${seededScript.id}/review/${takeId}"]`).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(getRelevantConsoleErrors(consoleErrors)).toEqual([]);
});

test("authenticated user cannot submit record evaluation without selecting an audio file", async ({ page }) => {
  const seededScript = await seedSmokeScript(page);

  await page.goto(`/scripts/${seededScript.id}/record`);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/record$`));
  await expect(page.getByTestId("record-file-input")).toBeAttached();
  await expect(page.getByTestId("record-transcription-status")).toHaveAttribute("data-supported", "true");
  await expect(page.getByTestId("record-pronunciation-status")).toHaveAttribute("data-supported", "true");
  await expect(page.getByTestId("record-submit-button")).toHaveCount(0);
  await expect(page.getByTestId("record-selected-file")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/record$`));
});

test("authenticated user sees listen recovery until consent and voice are prepared", async ({ page }) => {
  const seededScript = await seedSmokeScript(page);

  await resetCurrentProviderVoiceSetup(page);
  await page.goto(`/scripts/${seededScript.id}/listen`);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/listen$`));

  const recoveryBlock = page.getByTestId("listen-recovery-block");
  await expect(recoveryBlock).toBeVisible();
  await expect(recoveryBlock).toHaveAttribute("data-kind", "consent_required");
  await expect(page.getByRole("link", { name: "voice 設定へ進む" })).toBeVisible();
  await expect(page.getByTestId("listen-panel-shell")).toHaveCount(0);

  const consentResult = await postJsonViaPageWithRetry<VoiceConsentResponse>(page, "/api/voice-consent", {
    accepted: true
  });
  expect(consentResult.ok, JSON.stringify(consentResult.payload)).toBeTruthy();

  await page.goto(`/scripts/${seededScript.id}/listen`);
  await expect(recoveryBlock).toBeVisible();
  await expect(recoveryBlock).toHaveAttribute("data-kind", "voice_required");
  await expect(page.getByRole("link", { name: "voice を作成する" })).toBeVisible();
  await expect(page.getByTestId("listen-panel-shell")).toHaveCount(0);
});

test("authenticated user sees listen provider_unavailable recovery when provider status is forced off", async ({ page }) => {
  const seededScript = await seedSmokeScript(page);

  await resetCurrentProviderVoiceSetup(page);
  await setCurrentProviderUnavailable(page);
  await page.goto(`/scripts/${seededScript.id}/listen`);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/listen$`));

  const recoveryBlock = page.getByTestId("listen-recovery-block");
  await expect(recoveryBlock).toBeVisible();
  await expect(recoveryBlock).toHaveAttribute("data-kind", "provider_unavailable");
  await expect(page.getByRole("link", { name: "voice 設定へ進む" })).toBeVisible();
  await expect(page.getByTestId("listen-panel-shell")).toHaveCount(0);
});

test("authenticated user can keep listening to saved audio even when provider becomes unavailable", async ({ page }) => {
  const seededScript = await seedSmokeScript(page);

  await ensureMockListenAudioReady(page, seededScript.id);
  await setCurrentProviderUnavailable(page);
  await page.goto(`/scripts/${seededScript.id}/listen`);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/listen$`));

  const recoveryBlock = page.getByTestId("listen-recovery-block");
  await expect(recoveryBlock).toBeVisible();
  await expect(recoveryBlock).toHaveAttribute("data-kind", "provider_unavailable");
  await expect(page.getByTestId("listen-panel-shell")).toBeVisible();
  await expect(page.getByTestId("listen-audio-block")).toBeVisible();
  await waitForListenAudioPlaybackReady(page);
  await expectListenMiniControlsCanSeek(page);
  await expect(page.getByTestId("listen-generate-button")).toHaveCount(0);
});

test("authenticated user can generate mock listen audio once voice setup is ready", async ({ page }) => {
  const { consoleErrors, pageErrors } = await collectRuntimeErrors(page);
  const seededScript = await seedSmokeScript(page);

  await ensureMockVoiceReady(page);
  await page.goto(`/scripts/${seededScript.id}/listen`);
  await expect(page).toHaveURL(new RegExp(`/scripts/${seededScript.id}/listen$`));
  await expect(page.getByTestId("listen-panel-shell")).toBeVisible();
  await expect(page.getByTestId("listen-generate-button")).toBeEnabled();

  await page.getByTestId("listen-generate-button").click();
  await expect(page.getByTestId("listen-audio-block")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("listen-generate-button")).toContainText("お手本ボイスを作り直す");
  await waitForListenAudioPlaybackReady(page);
  await expectListenMiniControlsCanSeek(page);

  expect(pageErrors).toEqual([]);
  expect(getRelevantConsoleErrors(consoleErrors)).toEqual([]);
});

test("authenticated user can complete the minimal setup voice UI flow", async ({ page }) => {
  const { consoleErrors, pageErrors } = await collectRuntimeErrors(page);
  const seededScript = await seedSmokeScript(page);

  await resetCurrentProviderVoiceSetup(page);

  await page.goto("/setup/voice");
  await expect(page).toHaveURL(/\/setup\/voice$/);
  await expect(page.getByTestId("voice-setup-state")).toBeVisible();
  await expect(page.getByTestId("voice-setup-state")).toContainText("現在の声の状態");
  await expect(page.getByTestId("voice-setup-state")).not.toContainText("Details / provider readiness");
  await expect(page.getByTestId("voice-setup-state")).not.toContainText("provider 前提はそろっています。");
  await expect(page.getByTestId("voice-provider-preflight")).toHaveCount(0);

  if (await page.getByTestId("voice-consent-form").isVisible()) {
    await page.getByTestId("voice-consent-checkbox").check();
    await expect(page.getByTestId("voice-consent-submit")).toBeEnabled();
    await page.getByTestId("voice-consent-submit").click();
    await expect(page.getByTestId("voice-setup-state")).toContainText("完了");
    await expect(page.getByTestId("voice-create-form")).toBeVisible();
  }

  if (await page.getByTestId("voice-create-form").isVisible()) {
    await page.getByTestId("voice-create-label").fill("E2E UI Voice");
    await page.getByTestId("voice-create-sample-file").setInputFiles("tests/fixtures/sample-recording.webm");
    await page.getByTestId("voice-create-submit").click();
  }

  await expect(page.getByTestId("voice-setup-state")).toContainText("完了");
  await expect(page.getByTestId("voice-setup-state")).not.toContainText("未作成");
  await expect(page.getByTestId("voice-setup-next-step")).toHaveCount(0);
  await expect(page.getByTestId("voice-ready-block")).toBeVisible();
  await expect(page.getByTestId("voice-ready-block")).toContainText("自分の声を作り直す");
  await expect(page.getByTestId("voice-ready-block")).not.toContainText("お手本を聞けます");

  await page.goto(`/scripts/${seededScript.id}/listen`);
  await expect(page.getByTestId("listen-panel-shell")).toBeVisible();
  await expect(page.getByTestId("listen-generate-button")).toBeEnabled();

  expect(pageErrors).toEqual([]);
  expect(getRelevantConsoleErrors(consoleErrors)).toEqual([]);
});
