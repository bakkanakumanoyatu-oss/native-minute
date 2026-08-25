import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_MOBILE_AUDIO_BYTES,
  createMobileApiTimingCollector,
  createMobileAccountDeletionRequest,
  createMobileVoiceDeletionRequest,
  createMobileScript,
  downloadMobileScriptAudio,
  evaluateMobileRecording,
  fetchHealth,
  fetchMobileProgress,
  fetchMobileAccountDeletionStatus,
  fetchMobileVoiceDeletionStatus,
  fetchMobileReview,
  fetchMobileScript,
  fetchMobileScripts,
  initialHealthState,
  requestMobileScriptListen,
  advanceMobileVoiceDeletion,
  uploadMobileRecording
} from "./api";

const BFF_BASE_URL = "https://native-minute.example";
const ACCESS_TOKEN = "access-material-fixture";
const RECORDING_REF_FIXTURE = "55555555-5555-4555-8555-555555555555";

const SCRIPT_FIXTURE = {
  id: "script-fixture",
  title: "Morning update",
  content: "A one-minute practice script.",
  targetSeconds: 60,
  locale: "en-US",
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z"
};

const EVALUATION_FIXTURE = {
  score: 82,
  accuracyScore: 84,
  fluencyScore: 80,
  rhythmScore: 81,
  summaryJa: "安定しています。",
  strengthsJa: ["明瞭です。"],
  weakWords: [{ word: "minute", score: 64, note: "母音を確認しましょう。" }],
  scriptWordCount: 5,
  transcriptWordCount: 5
};

const COACH_FIXTURE = {
  titleJa: "次の一歩",
  summaryJa: "リズムを保ちましょう。",
  bulletPointsJa: ["一定の速さで話す"],
  nextStepJa: "もう一度録音しましょう。",
  focusWords: ["minute"]
};

const REVIEW_FIXTURE = {
  takeId: "take-fixture",
  scriptId: SCRIPT_FIXTURE.id,
  createdAt: "2026-07-20T00:00:00.000Z",
  reviewedAt: "2026-07-20T00:00:01.000Z",
  transcriptText: "A one minute practice script.",
  evaluation: EVALUATION_FIXTURE,
  coach: COACH_FIXTURE
};

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function expectBearerRequest(
  fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>,
  path: string,
  method: string
) {
  expect(fetchImpl).toHaveBeenCalledWith(
    BFF_BASE_URL + path,
    expect.objectContaining({
      method,
      credentials: "omit",
      cache: "no-store",
      headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` })
    })
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("initialHealthState", () => {
  it("shows an offline state without attempting a request", () => {
    expect(initialHealthState(false)).toEqual({ kind: "offline" });
  });
});

describe("fetchHealth", () => {
  it("returns connected for the safe health response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            status: "ok",
            service: "native-minute-bff",
            timestamp: "2026-07-18T00:00:00.000Z"
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl })).resolves.toEqual({
      kind: "connected",
      service: "native-minute-bff"
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      BFF_BASE_URL + "/api/mobile/health",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store"
      })
    );
  });

  it("distinguishes server errors from network errors", async () => {
    const serverErrorFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const networkErrorFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network unavailable"));

    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl: serverErrorFetch })).resolves.toEqual({
      kind: "server-error",
      status: 503
    });
    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl: networkErrorFetch })).resolves.toEqual({
      kind: "network-error"
    });
  });

  it("rejects a response that does not match the public contract", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { status: "unknown" } }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    await expect(fetchHealth(BFF_BASE_URL, { fetchImpl })).resolves.toEqual({
      kind: "invalid-response"
    });
  });

  it("returns timeout after aborting a slow request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const resultPromise = fetchHealth(BFF_BASE_URL, {
      fetchImpl,
      timeoutMs: 10
    });
    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual({ kind: "timeout" });
  });
});

describe("fetchMobileScripts", () => {
  it("sends one Bearer credential without cookies and validates owned-list data", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            scripts: [
              SCRIPT_FIXTURE
            ]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toMatchObject({ kind: "success", scripts: [{ id: "script-fixture" }] });
    expect(fetchImpl).toHaveBeenCalledWith(
      BFF_BASE_URL + "/api/mobile/scripts",
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`
        })
      })
    );
  });

  it.each([
    [401, "session_expired", "unauthorized"],
    [403, "account_deletion_in_progress", "forbidden"]
  ] as const)("maps status %s to a safe state", async (status, reasonCode, kind) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { reasonCode } }), {
        status,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind, reasonCode });
  });

  it("honors only a bounded Retry-After value", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { reasonCode: "rate_limited" } }), {
        status: 429,
        headers: { "Retry-After": "45" }
      })
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind: "rate-limited", retryAfterSeconds: 45 });
  });

  it("rejects an unsafe or malformed success body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { scripts: [{ id: "only-id" }] } }), {
        status: 200
      })
    );

    await expect(
      fetchMobileScripts(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind: "invalid-response" });
  });
});

describe("mobile script requests", () => {
  it("creates a script with Bearer auth and validates the canonical response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data: { script: SCRIPT_FIXTURE } }, 201));

    await expect(
      createMobileScript(
        BFF_BASE_URL,
        ACCESS_TOKEN,
        {
          title: SCRIPT_FIXTURE.title,
          content: SCRIPT_FIXTURE.content,
          targetSeconds: 60,
          locale: "en-US"
        },
        { fetchImpl }
      )
    ).resolves.toEqual({ kind: "success", script: SCRIPT_FIXTURE });

    expectBearerRequest(fetchImpl, "/api/mobile/scripts", "POST");
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json" })
    );
    expect(JSON.parse(String(request?.body))).toEqual({
      title: SCRIPT_FIXTURE.title,
      content: SCRIPT_FIXTURE.content,
      targetSeconds: 60,
      locale: "en-US"
    });
  });

  it("encodes a script id and rejects a mismatched canonical script", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data: { script: SCRIPT_FIXTURE } }));

    await expect(
      fetchMobileScript(BFF_BASE_URL, ACCESS_TOKEN, "another/script", { fetchImpl })
    ).resolves.toEqual({ kind: "invalid-response" });
    expectBearerRequest(fetchImpl, "/api/mobile/scripts/another%2Fscript", "GET");
  });

  it("requests listen audio without exposing request details", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, data: { audioId: "audio-fixture", cached: true } })
    );

    await expect(
      requestMobileScriptListen(BFF_BASE_URL, ACCESS_TOKEN, SCRIPT_FIXTURE.id, {
        fetchImpl
      })
    ).resolves.toEqual({ kind: "success", audioId: "audio-fixture", cached: true });
    expectBearerRequest(
      fetchImpl,
      `/api/mobile/scripts/${SCRIPT_FIXTURE.id}/listen`,
      "POST"
    );
  });
});

describe("downloadMobileScriptAudio", () => {
  it("accepts only a bounded audio Blob and reports static timing labels", async () => {
    const collector = createMobileApiTimingCollector();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": "3"
        }
      })
    );

    const result = await downloadMobileScriptAudio(
      BFF_BASE_URL,
      ACCESS_TOKEN,
      "audio/fixture",
      { fetchImpl, onTiming: collector.onTiming }
    );

    expect(result).toMatchObject({ kind: "success", contentType: "audio/wav" });
    expect(result.kind === "success" ? result.audio.size : null).toBe(3);
    expectBearerRequest(fetchImpl, "/api/mobile/script-audio/audio%2Ffixture", "GET");
    expect(collector.snapshot().map((sample) => sample.label)).toEqual([
      "request",
      "audio_download"
    ]);
    expect(Object.keys(collector.snapshot()[0] ?? {}).sort()).toEqual([
      "durationMs",
      "label"
    ]);
  });

  it("rejects a non-audio success response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not audio", { headers: { "Content-Type": "text/plain" } }));

    await expect(
      downloadMobileScriptAudio(BFF_BASE_URL, ACCESS_TOKEN, "audio-fixture", {
        fetchImpl
      })
    ).resolves.toEqual({ kind: "invalid-response" });
  });

  it("rejects audio above 15 MiB from either declared or actual size", async () => {
    const declaredFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(MAX_MOBILE_AUDIO_BYTES + 1)
        }
      })
    );
    const actualFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Blob([new Uint8Array(MAX_MOBILE_AUDIO_BYTES + 1)], { type: "audio/wav" }), {
        headers: { "Content-Type": "audio/wav" }
      })
    );

    await expect(
      downloadMobileScriptAudio(BFF_BASE_URL, ACCESS_TOKEN, "audio-fixture", {
        fetchImpl: declaredFetch
      })
    ).resolves.toEqual({
      kind: "payload-too-large",
      reasonCode: "audio_too_large"
    });
    await expect(
      downloadMobileScriptAudio(BFF_BASE_URL, ACCESS_TOKEN, "audio-fixture", {
        fetchImpl: actualFetch
      })
    ).resolves.toEqual({
      kind: "payload-too-large",
      reasonCode: "audio_too_large"
    });
  });
});

describe("uploadMobileRecording", () => {
  it("uses multipart without setting its boundary and returns only the opaque recording ref", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          ok: true,
          data: {
            recordingRef: RECORDING_REF_FIXTURE,
            durationSeconds: 59.4,
            contentType: "audio/wav"
          }
        },
        201
      )
    );
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

    await expect(
      uploadMobileRecording(
        BFF_BASE_URL,
        ACCESS_TOKEN,
        {
          scriptId: SCRIPT_FIXTURE.id,
          recordingRef: RECORDING_REF_FIXTURE,
          file,
          durationSeconds: 59.4
        },
        { fetchImpl }
      )
    ).resolves.toEqual({
      kind: "success",
      recording: {
        recordingRef: RECORDING_REF_FIXTURE,
        durationSeconds: 59.4,
        contentType: "audio/wav"
      }
    });

    expectBearerRequest(fetchImpl, "/api/mobile/recordings", "POST");
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
    const headers = request?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    const formData = request?.body as FormData;
    expect(formData.get("scriptId")).toBe(SCRIPT_FIXTURE.id);
    expect(formData.get("recordingRef")).toBe(RECORDING_REF_FIXTURE);
    expect(formData.get("durationSeconds")).toBe("59.4");
    expect(formData.get("file")).toBeInstanceOf(Blob);
  });

  it("fails locally for an oversized recording without sending it", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const file = new Blob([new Uint8Array(MAX_MOBILE_AUDIO_BYTES + 1)], {
      type: "audio/wav"
    });

    await expect(
      uploadMobileRecording(BFF_BASE_URL, ACCESS_TOKEN, {
        scriptId: SCRIPT_FIXTURE.id,
        recordingRef: RECORDING_REF_FIXTURE,
        file
      }, { fetchImpl })
    ).resolves.toEqual({
      kind: "payload-too-large",
      reasonCode: "recording_too_large"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID recording reference before upload", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      uploadMobileRecording(BFF_BASE_URL, ACCESS_TOKEN, {
        scriptId: SCRIPT_FIXTURE.id,
        recordingRef: "owner/script/path.wav",
        file: new Blob([new Uint8Array([1])], { type: "audio/wav" })
      }, { fetchImpl })
    ).resolves.toEqual({
      kind: "invalid-request",
      reasonCode: "recording_invalid"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("evaluateMobileRecording", () => {
  it("sends the caller-stable takeId and opaque recording ref", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, data: { review: REVIEW_FIXTURE } })
    );

    await expect(
      evaluateMobileRecording(
        BFF_BASE_URL,
        ACCESS_TOKEN,
        {
          scriptId: SCRIPT_FIXTURE.id,
          takeId: REVIEW_FIXTURE.takeId,
          recordingRef: RECORDING_REF_FIXTURE
        },
        { fetchImpl }
      )
    ).resolves.toEqual({ kind: "success", review: REVIEW_FIXTURE });

    expectBearerRequest(fetchImpl, "/api/mobile/evaluate", "POST");
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload).toEqual({
      scriptId: SCRIPT_FIXTURE.id,
      takeId: REVIEW_FIXTURE.takeId,
      recordingRef: RECORDING_REF_FIXTURE
    });
    expect(payload.audioPath).toBeUndefined();
    expect(payload.audioStorageKey).toBeUndefined();
  });

  it("rejects a canonical response for another take", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { review: { ...REVIEW_FIXTURE, takeId: "another-take" } }
      })
    );

    await expect(
      evaluateMobileRecording(
        BFF_BASE_URL,
        ACCESS_TOKEN,
        {
          scriptId: SCRIPT_FIXTURE.id,
          takeId: REVIEW_FIXTURE.takeId,
          recordingRef: RECORDING_REF_FIXTURE
        },
        { fetchImpl }
      )
    ).resolves.toEqual({ kind: "invalid-response" });
  });
});

describe("review and progress", () => {
  it("validates the owned review and centralized encoded path", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, data: { review: REVIEW_FIXTURE } })
    );

    await expect(
      fetchMobileReview(
        BFF_BASE_URL,
        ACCESS_TOKEN,
        SCRIPT_FIXTURE.id,
        REVIEW_FIXTURE.takeId,
        { fetchImpl }
      )
    ).resolves.toEqual({ kind: "success", review: REVIEW_FIXTURE });
    expectBearerRequest(
      fetchImpl,
      `/api/mobile/scripts/${SCRIPT_FIXTURE.id}/reviews/${REVIEW_FIXTURE.takeId}`,
      "GET"
    );
  });

  it("accepts server-ranked latest, best, and history without recalculating them", async () => {
    const take = {
      id: REVIEW_FIXTURE.takeId,
      scriptId: SCRIPT_FIXTURE.id,
      score: 82,
      accuracyScore: 84,
      fluencyScore: 80,
      rhythmScore: 81,
      reviewedAt: REVIEW_FIXTURE.reviewedAt,
      createdAt: REVIEW_FIXTURE.createdAt,
      transcriptText: REVIEW_FIXTURE.transcriptText,
      weakWords: EVALUATION_FIXTURE.weakWords,
      coach: COACH_FIXTURE,
      evaluation: EVALUATION_FIXTURE
    };
    const progress = {
      scripts: [
        {
          script: {
            id: SCRIPT_FIXTURE.id,
            title: SCRIPT_FIXTURE.title,
            content: SCRIPT_FIXTURE.content,
            locale: SCRIPT_FIXTURE.locale,
            targetSeconds: SCRIPT_FIXTURE.targetSeconds,
            updatedAt: SCRIPT_FIXTURE.updatedAt
          },
          takeCount: 1,
          latestTake: take,
          bestTake: take,
          previousTake: null,
          takeHistory: [take],
          latestVsPrevious: null,
          latestVsBest: null,
          improvementTrend: "insufficient_data"
        }
      ],
      totalScripts: 1,
      totalReviewedTakes: 1,
      bestTakeCount: 1
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data: { progress } }));

    await expect(
      fetchMobileProgress(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind: "success", progress });
    expectBearerRequest(fetchImpl, "/api/mobile/progress", "GET");
  });

  it("rejects a progress count that does not match server history", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          progress: {
            scripts: [
              {
                script: {
                  id: SCRIPT_FIXTURE.id,
                  title: SCRIPT_FIXTURE.title,
                  content: SCRIPT_FIXTURE.content,
                  locale: SCRIPT_FIXTURE.locale,
                  targetSeconds: 60,
                  updatedAt: SCRIPT_FIXTURE.updatedAt
                },
                takeCount: 1,
                latestTake: null,
                bestTake: null,
                previousTake: null,
                takeHistory: [],
                latestVsPrevious: null,
                latestVsBest: null,
                improvementTrend: "insufficient_data"
              }
            ],
            totalScripts: 1,
            totalReviewedTakes: 0,
            bestTakeCount: 0
          }
        }
      })
    );

    await expect(
      fetchMobileProgress(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind: "invalid-response" });
  });
});

describe("mobile account-deletion requests", () => {
  it.each([
    ["cancelled", "none"],
    ["expired", "none"]
  ] as const)("accepts the canonical %s terminal state without accepting unknown states", async (requestState, nextAction) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { deletion: { requestState, nextAction } }
      })
    );

    await expect(
      fetchMobileAccountDeletionStatus(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind: "success", requestState, nextAction });
    expectBearerRequest(fetchImpl, "/api/mobile/account-deletion/status", "GET");
  });

  it("keeps an unknown deletion state as a safe invalid response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { deletion: { requestState: "future_unknown_state", nextAction: "none" } }
      })
    );

    await expect(
      fetchMobileAccountDeletionStatus(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({ kind: "invalid-response" });
  });

  it("starts a fresh request through the Bearer-only endpoint after a terminal status", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          deletion: {
            requestState: "requested",
            nextAction: "wait_for_review",
            created: true
          }
        }
      }, 201)
    );

    await expect(
      createMobileAccountDeletionRequest(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })
    ).resolves.toEqual({
      kind: "success",
      requestState: "requested",
      nextAction: "wait_for_review",
      created: true
    });
    expectBearerRequest(fetchImpl, "/api/mobile/account-deletion/request", "POST");
  });
});

describe("mobile voice-only deletion requests", () => {
  const processingPayload = {
    ok: true,
    data: {
      deletion: {
        state: "processing",
        phase: "provider_cleanup",
        canRetry: false,
        canAdvance: true,
        operationId: "must-not-reach-the-client",
        providerVoiceId: "must-not-reach-the-client",
        locator: "must-not-reach-the-client"
      }
    }
  };

  it("uses the Bearer-only status endpoint and keeps only the safe state allowlist", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(processingPayload))
      .mockResolvedValueOnce(jsonResponse(processingPayload));

    await expect(fetchMobileVoiceDeletionStatus(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })).resolves.toEqual({
      kind: "success", state: "processing", phase: "provider_cleanup", canRetry: false, canAdvance: true
    });
    expectBearerRequest(fetchImpl, "/api/mobile/voice-deletion/status", "GET");
  });

  it("uses bounded POST endpoints with no target or operation identifier", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(processingPayload))
      .mockResolvedValueOnce(jsonResponse(processingPayload));

    await expect(createMobileVoiceDeletionRequest(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })).resolves.toMatchObject({ kind: "success", state: "processing" });
    expectBearerRequest(fetchImpl, "/api/mobile/voice-deletion/request", "POST");
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ body: "{}" }));

    await expect(advanceMobileVoiceDeletion(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })).resolves.toMatchObject({ kind: "success", state: "processing" });
    expectBearerRequest(fetchImpl, "/api/mobile/voice-deletion/advance", "POST");
    expect(fetchImpl.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ body: "{}" }));
  });

  it.each([
    "not_requested", "processing", "retry_available", "manual_required", "completed", "already_no_voice"
  ])("accepts the canonical %s state", async (state) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ok: true,
      data: { deletion: { state, phase: state === "completed" ? "completed" : state === "manual_required" ? "manual_required" : "none", canRetry: false, canAdvance: false } }
    }));

    await expect(fetchMobileVoiceDeletionStatus(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })).resolves.toMatchObject({ kind: "success", state });
  });

  it("fails closed for malformed, unknown, and unsafe retry responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { deletion: { state: "future", phase: "none", canRetry: false, canAdvance: false } } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { deletion: { state: "retry_available", phase: "snapshot", canRetry: false, canAdvance: false, retryAfterSeconds: 0 } } }));

    await expect(fetchMobileVoiceDeletionStatus(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })).resolves.toEqual({ kind: "invalid-response" });
    await expect(fetchMobileVoiceDeletionStatus(BFF_BASE_URL, ACCESS_TOKEN, { fetchImpl })).resolves.toEqual({ kind: "invalid-response" });
  });
});

describe("safe request failures", () => {
  it("returns timeout after aborting a slow authenticated request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    );

    const resultPromise = fetchMobileScript(
      BFF_BASE_URL,
      ACCESS_TOKEN,
      SCRIPT_FIXTURE.id,
      { fetchImpl, timeoutMs: 10 }
    );
    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toEqual({ kind: "timeout" });
  });

  it.each([
    [400, "request_invalid", { kind: "invalid-request", reasonCode: "request_invalid" }],
    [401, "session_expired", { kind: "unauthorized", reasonCode: "session_expired" }],
    [403, "origin_forbidden", { kind: "forbidden", reasonCode: "origin_forbidden" }],
    [404, "script_not_found", { kind: "not-found", reasonCode: "script_not_found" }],
    [409, "request_conflict", { kind: "conflict", reasonCode: "request_conflict" }],
    [413, "recording_too_large", { kind: "payload-too-large", reasonCode: "recording_too_large" }],
    [415, "recording_type_unsupported", { kind: "unsupported-media-type", reasonCode: "recording_type_unsupported" }],
    [503, "internal_provider_details", { kind: "server-error", status: 503 }]
  ] as const)("maps status %s without returning raw details", async (status, reasonCode, expected) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: {
            reasonCode,
            message: "provider raw fixture must not escape",
            details: { provider: "secret-provider-id" }
          }
        },
        status
      )
    );

    await expect(
      fetchMobileScript(BFF_BASE_URL, ACCESS_TOKEN, SCRIPT_FIXTURE.id, {
        fetchImpl
      })
    ).resolves.toEqual(expected);
  });
});
