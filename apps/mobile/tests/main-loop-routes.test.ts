import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import { handleMobileEvaluatePost } from "../../../lib/mobile/evaluate-route";
import {
  handleMobileListenOptions,
  handleMobileListenPost
} from "../../../lib/mobile/listen-route";
import { handleMobileProgressGet } from "../../../lib/mobile/progress-route";
import {
  handleMobileRecordingsOptions,
  handleMobileRecordingsPost,
  parseMobilePcmWav
} from "../../../lib/mobile/recordings-route";
import { handleMobileReviewGet } from "../../../lib/mobile/review-route";
import { handleMobileScriptAudioGet } from "../../../lib/mobile/script-audio-route";
import { handleMobileScriptDetailGet } from "../../../lib/mobile/script-detail-route";
import {
  handleMobileScriptsOptions,
  handleMobileScriptsPost
} from "../../../lib/mobile/scripts-route";
import {
  claimReviewTake,
  hydrateStoredReview,
  type StoredTakeReview
} from "../../../services/review";
import {
  buildScriptProgressItem,
  sortProgressTakeHistory,
  type ProgressOverview,
  type ProgressTakeSummary
} from "../../../services/progress";
import {
  getRecordingStorageExtension,
  uploadOwnedRecording
} from "../../../services/storage/recording-storage.service";
import { didReuseGeneratedScriptAudioCache } from "../../../services/voice/voice.service";

const BASE_URL = "https://native-minute.example";
const ORIGIN = "capacitor://localhost";
const ACCESS_TOKEN = "header.payload.signature";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const TAKE_ID = "33333333-3333-4333-8333-333333333333";
const AUDIO_ID = "44444444-4444-4444-8444-444444444444";
const RECORDING_ID = "55555555-5555-4555-8555-555555555555";
const RECORDING_REF = `${USER_ID}/${SCRIPT_ID}/${RECORDING_ID}.wav`;

const script = {
  id: SCRIPT_ID,
  title: "Morning update",
  content: "A safe one-minute practice script.",
  targetSeconds: 60,
  locale: "en-US",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:01:00.000Z"
};

function createFakeClient() {
  return { auth: {} } as unknown as AppSupabaseClient;
}

function authDependencies() {
  const client = createFakeClient();

  return {
    hasConfig: () => true,
    createClient: () => client,
    validateUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    assertPronunciationConsent: async () => undefined
  };
}

function reviewClaimDependencies() {
  return {
    claimReviewTake: async () => "claimed" as const,
    releaseReviewTakeClaim: async () => undefined
  };
}

function createReviewClaimClient(input: {
  insertError: { code?: string; message: string } | null;
  existing?: {
    script_id: string;
    audio_path: string;
    status: string;
  } | null;
}) {
  const selectQuery = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: input.existing ?? null, error: null }))
  };
  selectQuery.eq.mockReturnValue(selectQuery);

  return {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: input.insertError })),
      select: vi.fn(() => selectQuery)
    }))
  } as unknown as AppSupabaseClient;
}

function mobileRequest(
  path: string,
  init: {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
  } = {}
) {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  headers.set("Authorization", `Bearer ${ACCESS_TOKEN}`);

  return new NextRequest(`${BASE_URL}${path}`, { ...init, headers });
}

function jsonRequest(path: string, body: unknown) {
  return mobileRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createPcmWave(options?: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  durationSeconds?: number;
}) {
  const channels = options?.channels ?? 1;
  const sampleRate = options?.sampleRate ?? 16_000;
  const bitsPerSample = options?.bitsPerSample ?? 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataByteLength = options?.durationSeconds
    ? Math.round(options.durationSeconds * sampleRate * blockAlign)
    : 2;
  const bytes = new Uint8Array(44 + dataByteLength);
  const view = new DataView(bytes.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  return bytes;
}

function createStoredReview(): StoredTakeReview {
  return {
    take: {
      id: TAKE_ID,
      script_id: SCRIPT_ID,
      user_id: USER_ID,
      audio_path: `storage://recordings/${RECORDING_REF}`,
      duration_seconds: 60,
      status: "reviewed",
      score: 82,
      total_words: 7,
      transcript_text: "A safe one minute practice script",
      accuracy_score: 84,
      fluency_score: 81,
      rhythm_score: 79,
      evaluation_summary_ja: "安定した発話です。",
      evaluation_strengths_ja: ["明瞭さ"],
      evaluation_payload: { raw: "must-not-leak" },
      coach_feedback_payload: { raw: "must-not-leak" },
      reviewed_at: "2026-08-13T00:03:00.000Z",
      created_at: "2026-08-13T00:02:00.000Z"
    },
    weakWords: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        take_id: TAKE_ID,
        word: "practice",
        score: 61,
        note: "語尾を明瞭に",
        created_at: "2026-08-13T00:03:00.000Z"
      }
    ],
    coachFeedback: {
      id: "77777777-7777-4777-8777-777777777777",
      take_id: TAKE_ID,
      locale: "ja",
      title: "次の一歩",
      summary: "practice を整えましょう。",
      bullets: ["ゆっくり発音する"],
      next_step: "もう一度録音する",
      focus_words: ["practice"],
      created_at: "2026-08-13T00:03:00.000Z"
    }
  };
}

function createProgressTake(id = TAKE_ID, createdAt = "2026-08-13T00:02:00.000Z"): ProgressTakeSummary {
  const stored = hydrateStoredReview(createStoredReview());

  return {
    id,
    scriptId: SCRIPT_ID,
    score: stored.evaluation.score,
    accuracyScore: stored.evaluation.accuracyScore,
    fluencyScore: stored.evaluation.fluencyScore,
    rhythmScore: stored.evaluation.rhythmScore,
    reviewedAt: stored.take.reviewed_at,
    createdAt,
    transcriptText: stored.take.transcript_text,
    weakWords: stored.evaluation.weakWords,
    coach: stored.coach,
    evaluation: stored.evaluation
  };
}

describe("mobile script create/detail/listen adapters", () => {
  it("creates only the fixed 60-second en-US contract and returns the canonical row", async () => {
    const createOwnedScript = vi.fn(async () => script);
    const response = await handleMobileScriptsPost(
      jsonRequest("/api/mobile/scripts", {
        title: " Morning update ",
        content: " A safe one-minute practice script. "
      }),
      {
        ...authDependencies(),
        listOwnedScripts: async () => [],
        createOwnedScript
      }
    );

    expect(response.status).toBe(201);
    expect(createOwnedScript).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      title: "Morning update",
      content: "A safe one-minute practice script.",
      targetSeconds: 60,
      locale: "en-US"
    });
    await expect(response.json()).resolves.toEqual({ ok: true, data: { script } });
  });

  it("supports method-specific POST preflight without credentials", () => {
    const response = handleMobileScriptsOptions(
      new NextRequest(`${BASE_URL}/api/mobile/scripts`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type"
        }
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it.each([
    { title: "Title", content: "Content", targetSeconds: 90 },
    { title: "Title", content: "Content", locale: "ja-JP" },
    { title: "Title", content: "Content", extra: "not-allowed" }
  ])("rejects non-fixed or extra script creation fields", async (body) => {
    const createOwnedScript = vi.fn();
    const response = await handleMobileScriptsPost(
      jsonRequest("/api/mobile/scripts", body),
      {
        ...authDependencies(),
        listOwnedScripts: async () => [],
        createOwnedScript
      }
    );

    expect(response.status).toBe(400);
    expect(createOwnedScript).not.toHaveBeenCalled();
  });

  it("returns only an owned canonical detail and collapses foreign/missing to 404", async () => {
    const getOwnedScript = vi.fn(async () => null);
    const response = await handleMobileScriptDetailGet(
      mobileRequest(`/api/mobile/scripts/${SCRIPT_ID}`),
      SCRIPT_ID,
      { ...authDependencies(), getOwnedScript }
    );

    expect(response.status).toBe(404);
    expect(getOwnedScript).toHaveBeenCalledWith(expect.anything(), USER_ID, SCRIPT_ID);
    expect((await response.json()).error.reasonCode).toBe("script_not_found");
  });

  it("minimizes listen output to app audio identity and an accurate cache flag", async () => {
    const speakOwnedScript = vi.fn(async () => ({
      audioUrl: `/api/script-audio/${AUDIO_ID}`,
      cached: false,
      cacheKey: "must-not-leak",
      voice: {
        id: "88888888-8888-4888-8888-888888888888",
        user_id: USER_ID,
        provider: "elevenlabs",
        consent_id: null,
        provider_voice_id: "must-not-leak",
        label: "Default",
        sample_audio_path: null,
        is_default: true,
        created_at: "2026-08-13T00:00:00.000Z"
      }
    }));
    const response = await handleMobileListenPost(
      mobileRequest(`/api/mobile/scripts/${SCRIPT_ID}/listen`, { method: "POST" }),
      SCRIPT_ID,
      {
        ...authDependencies(),
        getOwnedScript: async () => script,
        speakOwnedScript
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(speakOwnedScript).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      scriptId: SCRIPT_ID
    });
    expect(payload).toEqual({ ok: true, data: { audioId: AUDIO_ID, cached: false } });
    expect(JSON.stringify(payload)).not.toContain("must-not-leak");
  });

  it("rejects cookie-only listen before ownership or voice work", async () => {
    const getOwnedScript = vi.fn();
    const speakOwnedScript = vi.fn();
    const response = await handleMobileListenPost(
      new NextRequest(`${BASE_URL}/api/mobile/scripts/${SCRIPT_ID}/listen`, {
        method: "POST",
        headers: { Origin: ORIGIN, Cookie: "web-session=must-not-be-used" }
      }),
      SCRIPT_ID,
      { ...authDependencies(), getOwnedScript, speakOwnedScript }
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.reasonCode).toBe("auth_required");
    expect(getOwnedScript).not.toHaveBeenCalled();
    expect(speakOwnedScript).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps listen preflight POST-only", () => {
    const response = handleMobileListenOptions(
      new NextRequest(`${BASE_URL}/api/mobile/scripts/${SCRIPT_ID}/listen`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization"
        }
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });
});

describe("mobile audio and recording adapters", () => {
  it("returns owned audio bytes with Bearer-safe CORS and no replay path", async () => {
    const response = await handleMobileScriptAudioGet(
      mobileRequest(`/api/mobile/script-audio/${AUDIO_ID}`),
      AUDIO_ID,
      {
        ...authDependencies(),
        loadOwnedAudio: async () => ({
          bytes: Buffer.from([1, 2, 3]),
          contentType: "audio/mpeg",
          storagePath: `/api/script-audio/${AUDIO_ID}`
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
  });

  it("collapses a foreign or missing audio row to 404 without bytes", async () => {
    const response = await handleMobileScriptAudioGet(
      mobileRequest(`/api/mobile/script-audio/${AUDIO_ID}`),
      AUDIO_ID,
      { ...authDependencies(), loadOwnedAudio: async () => null }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.reasonCode).toBe("audio_not_found");
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("accepts only real 16 kHz mono 16-bit PCM WAV and minimizes the upload response", async () => {
    const wave = createPcmWave({ durationSeconds: 60 });
    expect(parseMobilePcmWav(wave)).toEqual({
      channels: 1,
      sampleRate: 16_000,
      bitsPerSample: 16,
      dataByteLength: 1_920_000,
      durationSeconds: 60
    });
    const formData = new FormData();
    formData.set("scriptId", SCRIPT_ID);
    formData.set("recordingRef", RECORDING_ID);
    formData.set("durationSeconds", "60");
    formData.set("file", new File([wave], "attacker.exe", { type: "audio/wav" }));
    const uploadOwnedRecording = vi.fn(async () => ({
      audioPath: `storage://recordings/${RECORDING_REF}`,
      audioStorageKey: RECORDING_REF,
      durationSeconds: 60,
      contentType: "audio/wav"
    }));
    const response = await handleMobileRecordingsPost(
      mobileRequest("/api/mobile/recordings", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        assertUploadEnabled: () => undefined,
        uploadOwnedRecording
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(uploadOwnedRecording).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      scriptId: SCRIPT_ID,
      recordingId: RECORDING_ID,
      file: expect.any(File),
      durationSeconds: 60
    });
    expect(payload).toEqual({
      ok: true,
      data: {
        recordingRef: RECORDING_ID,
        durationSeconds: 60,
        contentType: "audio/wav"
      }
    });
    expect(JSON.stringify(payload)).not.toContain("storage://");
    expect(JSON.stringify(payload)).not.toContain(USER_ID);
    expect(JSON.stringify(payload)).not.toContain(SCRIPT_ID);
  });

  it("rejects declared WAV with invalid bytes before storage", async () => {
    const formData = new FormData();
    formData.set("scriptId", SCRIPT_ID);
    formData.set("recordingRef", RECORDING_ID);
    formData.set("file", new File(["not-wave"], "recording.wav", { type: "audio/wav" }));
    const uploadOwnedRecording = vi.fn();
    const response = await handleMobileRecordingsPost(
      mobileRequest("/api/mobile/recordings", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        assertUploadEnabled: () => undefined,
        uploadOwnedRecording
      }
    );

    expect(response.status).toBe(415);
    expect(uploadOwnedRecording).not.toHaveBeenCalled();
  });

  it("rejects a materially inconsistent reported duration before storage", async () => {
    const formData = new FormData();
    formData.set("scriptId", SCRIPT_ID);
    formData.set("recordingRef", RECORDING_ID);
    formData.set("durationSeconds", "60");
    formData.set(
      "file",
      new File([createPcmWave({ durationSeconds: 1 })], "recording.wav", {
        type: "audio/wav"
      })
    );
    const uploadOwnedRecording = vi.fn();
    const response = await handleMobileRecordingsPost(
      mobileRequest("/api/mobile/recordings", { method: "POST", body: formData }),
      {
        ...authDependencies(),
        assertUploadEnabled: () => undefined,
        uploadOwnedRecording
      }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.reasonCode).toBe("recording_invalid");
    expect(uploadOwnedRecording).not.toHaveBeenCalled();
  });

  it("allows multipart POST preflight with Authorization and Content-Type only", () => {
    const response = handleMobileRecordingsOptions(
      new NextRequest(`${BASE_URL}/api/mobile/recordings`, {
        method: "OPTIONS",
        headers: {
          Origin: ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type"
        }
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("mobile evaluation, review, and progress adapters", () => {
  it("returns an existing persisted review for the stable take id without provider work", async () => {
    const stored = createStoredReview();
    const createPersistedReview = vi.fn();
    const response = await handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", {
        scriptId: SCRIPT_ID,
        takeId: TAKE_ID,
        recordingRef: RECORDING_ID
      }),
      {
        ...authDependencies(),
        ...reviewClaimDependencies(),
        claimReviewTake: async () => "reviewed",
        getOwnedScript: async () => script,
        getStoredReview: async () => stored,
        createPersistedReview
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createPersistedReview).not.toHaveBeenCalled();
    expect(payload.data.review).toEqual({
      takeId: TAKE_ID,
      scriptId: SCRIPT_ID,
      createdAt: stored.take.created_at,
      reviewedAt: stored.take.reviewed_at,
      transcriptText: stored.take.transcript_text,
      evaluation: hydrateStoredReview(stored).evaluation,
      coach: hydrateStoredReview(stored).coach
    });
    expect(JSON.stringify(payload)).not.toContain("audio_path");
    expect(JSON.stringify(payload)).not.toContain("must-not-leak");
  });

  it("passes only an owned recording ref to the audio-first persisted review service", async () => {
    const stored = hydrateStoredReview(createStoredReview());
    const createPersistedReview = vi.fn(async () => ({
      takeId: TAKE_ID,
      transcriptText: stored.take.transcript_text ?? "",
      evaluation: stored.evaluation,
      coach: stored.coach,
      storedReview: stored
    }));
    const response = await handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", {
        scriptId: SCRIPT_ID,
        takeId: TAKE_ID,
        recordingRef: RECORDING_ID
      }),
      {
        ...authDependencies(),
        ...reviewClaimDependencies(),
        getOwnedScript: async () => script,
        getStoredReview: async () => null,
        createPersistedReview
      }
    );

    expect(response.status).toBe(201);
    expect(createPersistedReview).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      scriptId: SCRIPT_ID,
      takeId: TAKE_ID,
      audioStorageKey: RECORDING_REF,
      locale: "en-US"
    });
  });

  it("rejects path-like or foreign recording references before provider work", async () => {
    const createPersistedReview = vi.fn();
    const response = await handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", {
        scriptId: SCRIPT_ID,
        takeId: TAKE_ID,
        recordingRef: `99999999-9999-4999-8999-999999999999/${SCRIPT_ID}/${RECORDING_ID}.wav`
      }),
      {
        ...authDependencies(),
        ...reviewClaimDependencies(),
        getOwnedScript: async () => script,
        getStoredReview: async () => null,
        createPersistedReview
      }
    );

    expect(response.status).toBe(400);
    expect(createPersistedReview).not.toHaveBeenCalled();
  });

  it("serializes simultaneous retries for one exact take before provider work", async () => {
    const stored = hydrateStoredReview(createStoredReview());
    type PersistedReview = {
      takeId: string;
      transcriptText: string;
      evaluation: typeof stored.evaluation;
      coach: typeof stored.coach;
      storedReview: typeof stored;
    };
    let claimIsActive = false;
    let finishEvaluation!: (value: PersistedReview) => void;
    const createPersistedReview = vi.fn(
      () => new Promise<PersistedReview>((resolve) => {
        finishEvaluation = resolve;
      })
    );
    const claimReviewTake = vi.fn(async () => {
      if (claimIsActive) {
        return "processing" as const;
      }

      claimIsActive = true;
      return "claimed" as const;
    });
    const dependencies = {
      ...authDependencies(),
      ...reviewClaimDependencies(),
      claimReviewTake,
      getOwnedScript: async () => script,
      getStoredReview: async () => null,
      createPersistedReview
    };
    const body = {
      scriptId: SCRIPT_ID,
      takeId: TAKE_ID,
      recordingRef: RECORDING_ID
    };
    const firstResponsePromise = handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", body),
      dependencies
    );

    await vi.waitFor(() => expect(createPersistedReview).toHaveBeenCalledTimes(1));

    const secondResponse = await handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", body),
      dependencies
    );

    expect(secondResponse.status).toBe(409);
    await expect(secondResponse.json()).resolves.toMatchObject({
      error: { reasonCode: "evaluation_in_progress", retryable: true }
    });
    expect(createPersistedReview).toHaveBeenCalledTimes(1);

    finishEvaluation({
      takeId: TAKE_ID,
      transcriptText: stored.take.transcript_text ?? "",
      evaluation: stored.evaluation,
      coach: stored.coach,
      storedReview: stored
    });

    expect((await firstResponsePromise).status).toBe(201);
  });

  it("rejects reuse of a take id with a different recording identity", async () => {
    const createPersistedReview = vi.fn();
    const response = await handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", {
        scriptId: SCRIPT_ID,
        takeId: TAKE_ID,
        recordingRef: RECORDING_ID
      }),
      {
        ...authDependencies(),
        ...reviewClaimDependencies(),
        claimReviewTake: async () => "conflict",
        getOwnedScript: async () => script,
        getStoredReview: async () => null,
        createPersistedReview
      }
    );

    expect(response.status).toBe(409);
    expect(createPersistedReview).not.toHaveBeenCalled();
  });

  it("releases an owned pending claim after provider failure", async () => {
    const releaseReviewTakeClaim = vi.fn(async () => undefined);
    const response = await handleMobileEvaluatePost(
      jsonRequest("/api/mobile/evaluate", {
        scriptId: SCRIPT_ID,
        takeId: TAKE_ID,
        recordingRef: RECORDING_ID
      }),
      {
        ...authDependencies(),
        ...reviewClaimDependencies(),
        releaseReviewTakeClaim,
        getOwnedScript: async () => script,
        getStoredReview: async () => null,
        createPersistedReview: async () => {
          throw new Error("provider detail must not escape");
        }
      }
    );

    expect(response.status).toBe(500);
    expect(releaseReviewTakeClaim).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      takeId: TAKE_ID,
      scriptId: SCRIPT_ID,
      audioPath: `storage://recordings/${RECORDING_REF}`
    });
    expect(JSON.stringify(await response.json())).not.toContain("provider detail");
  });

  it("returns a canonical persisted review lookup with no storage or raw payload", async () => {
    const stored = createStoredReview();
    const response = await handleMobileReviewGet(
      mobileRequest(`/api/mobile/scripts/${SCRIPT_ID}/reviews/${TAKE_ID}`),
      SCRIPT_ID,
      TAKE_ID,
      { ...authDependencies(), getStoredReview: async () => stored }
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).toContain(TAKE_ID);
    expect(serialized).not.toContain("audio_path");
    expect(serialized).not.toContain("must-not-leak");
  });

  it("returns the server-canonical overview with attached newest-first take history", async () => {
    const latest = createProgressTake(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "2026-08-13T00:04:00.000Z"
    );
    const previous = createProgressTake(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-13T00:02:00.000Z"
    );
    const progress: ProgressOverview = {
      scripts: [
        {
          script: {
            id: SCRIPT_ID,
            title: script.title,
            content: script.content,
            locale: script.locale,
            targetSeconds: script.targetSeconds,
            updatedAt: script.updatedAt
          },
          takeCount: 2,
          latestTake: latest,
          bestTake: previous,
          previousTake: previous,
          takeHistory: [latest, previous],
          latestVsPrevious: null,
          latestVsBest: null,
          improvementTrend: "up"
        }
      ],
      totalScripts: 1,
      totalReviewedTakes: 2,
      bestTakeCount: 1
    };
    const response = await handleMobileProgressGet(mobileRequest("/api/mobile/progress"), {
      ...authDependencies(),
      getOwnedProgress: async () => progress
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { progress } });
  });
});

describe("backend main-loop hardening helpers", () => {
  it("claims a fresh take and classifies exact pending/reviewed duplicates", async () => {
    const claim = {
      takeId: TAKE_ID,
      scriptId: SCRIPT_ID,
      audioPath: `storage://recordings/${RECORDING_REF}`
    };

    await expect(claimReviewTake(
      createReviewClaimClient({ insertError: null }),
      USER_ID,
      claim
    )).resolves.toBe("claimed");

    for (const [status, expected] of [
      ["pending", "processing"],
      ["reviewed", "reviewed"]
    ] as const) {
      await expect(claimReviewTake(
        createReviewClaimClient({
          insertError: { code: "23505", message: "duplicate" },
          existing: {
            script_id: SCRIPT_ID,
            audio_path: claim.audioPath,
            status
          }
        }),
        USER_ID,
        claim
      )).resolves.toBe(expected);
    }
  });

  it("rejects conflicting or noncanonical take rows at the claim boundary", async () => {
    const claim = {
      takeId: TAKE_ID,
      scriptId: SCRIPT_ID,
      audioPath: `storage://recordings/${RECORDING_REF}`
    };

    for (const existing of [
      { script_id: SCRIPT_ID, audio_path: "storage://recordings/other.wav", status: "reviewed" },
      { script_id: SCRIPT_ID, audio_path: claim.audioPath, status: "failed" }
    ]) {
      await expect(claimReviewTake(
        createReviewClaimClient({
          insertError: { code: "23505", message: "duplicate" },
          existing
        }),
        USER_ID,
        claim
      )).resolves.toBe("conflict");
    }
  });

  it("attaches canonical latest, best, and history with each take's weak words and coach", () => {
    const latestStored = createStoredReview();
    latestStored.take = {
      ...latestStored.take,
      score: 72,
      created_at: "2026-08-13T00:04:00.000Z"
    };
    const bestTakeId = "99999999-9999-4999-8999-999999999999";
    const bestStored = createStoredReview();
    bestStored.take = {
      ...bestStored.take,
      id: bestTakeId,
      score: 95,
      accuracy_score: 96,
      created_at: "2026-08-13T00:02:00.000Z"
    };
    bestStored.weakWords = bestStored.weakWords.map((word) => ({
      ...word,
      take_id: bestTakeId,
      word: "accuracy"
    }));
    bestStored.coachFeedback = bestStored.coachFeedback
      ? {
          ...bestStored.coachFeedback,
          take_id: bestTakeId,
          summary: "Best take coach"
        }
      : null;

    const item = buildScriptProgressItem(script, [
      hydrateStoredReview(bestStored),
      hydrateStoredReview(latestStored)
    ]);

    expect(item.takeCount).toBe(2);
    expect(item.latestTake?.id).toBe(TAKE_ID);
    expect(item.bestTake?.id).toBe(bestTakeId);
    expect(item.takeHistory.map((take) => take.id)).toEqual([TAKE_ID, bestTakeId]);
    expect(item.latestTake?.weakWords[0]?.word).toBe("practice");
    expect(item.bestTake?.weakWords[0]?.word).toBe("accuracy");
    expect(item.bestTake?.coach.summaryJa).toBe("Best take coach");
  });

  it("orders progress history deterministically by timestamp then id", () => {
    const older = createProgressTake(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "2026-08-13T00:01:00.000Z"
    );
    const tieLow = createProgressTake(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "2026-08-13T00:02:00.000Z"
    );
    const tieHigh = createProgressTake(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "2026-08-13T00:02:00.000Z"
    );

    expect(sortProgressTakeHistory([tieLow, older, tieHigh]).map((take) => take.id)).toEqual([
      tieHigh.id,
      tieLow.id,
      older.id
    ]);
  });

  it("derives recording extensions only from the validated MIME type", () => {
    expect(getRecordingStorageExtension("audio/wav")).toBe("wav");
    expect(getRecordingStorageExtension("audio/mpeg")).toBe("mp3");
    expect(getRecordingStorageExtension("application/x-msdownload")).toBe("bin");
  });

  it("uses the MIME-derived extension for the actual private storage upload", async () => {
    const upload = vi.fn(async (...args: unknown[]) => {
      void args;
      return { error: null };
    });
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: SCRIPT_ID,
        user_id: USER_ID,
        title: script.title,
        content: script.content,
        target_seconds: script.targetSeconds,
        locale: script.locale,
        created_at: script.createdAt,
        updated_at: script.updatedAt
      },
      error: null
    }));
    const client = {
      auth: {},
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle }))
          }))
        }))
      })),
      storage: { from: vi.fn(() => ({ upload })) }
    } as unknown as AppSupabaseClient;

    await uploadOwnedRecording(client, USER_ID, {
      scriptId: SCRIPT_ID,
      file: new File([createPcmWave()], "attacker.exe", { type: "audio/wav" }),
      durationSeconds: 60
    });

    const storageKey = upload.mock.calls[0]?.[0];
    expect(storageKey).toMatch(new RegExp(`^${USER_ID}/${SCRIPT_ID}/[0-9a-f-]+\\.wav$`));
    expect(storageKey).not.toContain("attacker");
    expect(storageKey).not.toContain(".exe");
  });

  it("reuses an identical owned upload after an ambiguous response", async () => {
    const wave = createPcmWave({ durationSeconds: 1 });
    const upload = vi.fn(async (...args: unknown[]) => {
      void args;
      return { error: { message: "The resource already exists" } };
    });
    const download = vi.fn(async () => ({
      data: new Blob([wave], { type: "audio/wav" }),
      error: null
    }));
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: SCRIPT_ID,
        user_id: USER_ID,
        title: script.title,
        content: script.content,
        target_seconds: script.targetSeconds,
        locale: script.locale,
        created_at: script.createdAt,
        updated_at: script.updatedAt
      },
      error: null
    }));
    const client = {
      auth: {},
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle }))
          }))
        }))
      })),
      storage: { from: vi.fn(() => ({ upload, download })) }
    } as unknown as AppSupabaseClient;

    const result = await uploadOwnedRecording(client, USER_ID, {
      scriptId: SCRIPT_ID,
      recordingId: RECORDING_ID,
      file: new File([wave], "take.wav", { type: "audio/wav" }),
      durationSeconds: 1
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(RECORDING_REF);
    expect(result.audioStorageKey).toBe(RECORDING_REF);
  });

  it("rejects an inconsistent or truncated PCM WAV header", () => {
    const inconsistent = createPcmWave();
    new DataView(inconsistent.buffer).setUint32(28, 1, true);
    expect(parseMobilePcmWav(inconsistent)).toBeNull();

    const truncated = createPcmWave().slice(0, 45);
    expect(parseMobilePcmWav(truncated)).toBeNull();

    const overlong = createPcmWave({ durationSeconds: 121 });
    expect(parseMobilePcmWav(overlong)).toBeNull();
  });

  it("marks fresh voice inserts uncached and only race reuse as cached", () => {
    expect(
      didReuseGeneratedScriptAudioCache({ insertSucceeded: true, finalCacheFound: true })
    ).toBe(false);
    expect(
      didReuseGeneratedScriptAudioCache({ insertSucceeded: false, finalCacheFound: true })
    ).toBe(true);
  });
});
