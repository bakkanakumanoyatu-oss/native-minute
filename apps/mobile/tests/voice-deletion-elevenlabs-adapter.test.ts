import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createElevenLabsVoiceDeletionProviderAdapter } from "@/providers/voice-deletion";

const VOICE_ID = "voice_ABC-123";
const SAFE_ENV = { ELEVENLABS_API_KEY: "test-only-key" };

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function officialError(type = "bad_request", code = "bad_request") {
  return { detail: { type, code, message: "provider-private-message", request_id: "provider-private-request-id" } };
}

function createAdapter(response: Response | Promise<Response>, options: { timeoutMs?: number } = {}) {
  const fetchImpl = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
  return {
    fetchImpl,
    adapter: createElevenLabsVoiceDeletionProviderAdapter({ env: SAFE_ENV, fetchImpl, ...options })
  };
}

function stalledJsonResponse(status = 200) {
  return {
    status,
    json: () => new Promise<never>(() => {})
  } as unknown as Response;
}

describe("G5C-B2a ElevenLabs voice deletion adapter", () => {
  it("sends exactly one DELETE with server-only credentials and accepts only 200 status ok", async () => {
    const { adapter, fetchImpl } = createAdapter(jsonResponse(200, { status: "ok" }));

    await expect(adapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "deleted" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.elevenlabs.io/v1/voices/${VOICE_ID}`, {
      method: "DELETE",
      headers: { "xi-api-key": "test-only-key" },
      signal: expect.any(AbortSignal)
    });
  });

  it.each([
    ["an empty 200 body", new Response(null, { status: 200 })],
    ["invalid 200 JSON", new Response("not json", { status: 200 })],
    ["a 200 response without status", jsonResponse(200, {})],
    ["a 200 non-ok status", jsonResponse(200, { status: "queued" })],
    ["a 204 response", new Response(null, { status: 204 })]
  ])("treats DELETE %s as a protocol error", async (_label, response) => {
    const { adapter } = createAdapter(response);
    await expect(adapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "protocol_error" });
  });

  it.each([
    [404, officialError("not_found", "voice_not_found"), "not_found"],
    [404, officialError("not_found", "other_not_found"), "protocol_error"],
    [401, officialError("unauthorized", "invalid_api_key"), "auth_failed"],
    [403, officialError("forbidden", "forbidden"), "permission_denied"],
    [422, officialError("unprocessable_entity", "unprocessable_entity"), "provider_rejected"],
    [429, officialError("rate_limit_error", "rate_limit_exceeded"), "rate_limited"],
    [500, officialError("server_error", "internal_server_error"), "provider_unavailable"],
    [503, officialError("server_error", "service_unavailable"), "provider_unavailable"]
  ])("normalizes DELETE HTTP %i safely", async (status, payload, kind) => {
    const { adapter } = createAdapter(jsonResponse(status, payload));
    await expect(adapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind });
  });

  it.each([
    [401, "auth_failed"],
    [403, "permission_denied"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [422, "provider_rejected"],
    [418, "provider_rejected"]
  ])("uses DELETE HTTP %i as the authority when the error body is malformed", async (status, kind) => {
    const { adapter } = createAdapter(new Response("not json", { status }));
    const result = await adapter.deleteVoice({ providerResourceId: VOICE_ID });

    expect(result).toEqual({ kind });
    expect(JSON.stringify(result)).not.toContain("test-only-key");
    expect(JSON.stringify(result)).not.toContain(VOICE_ID);
  });

  it.each([
    [401, "auth_failed"],
    [403, "permission_denied"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [422, "provider_rejected"],
    [418, "provider_rejected"]
  ])("uses GET HTTP %i as the authority when the error body is empty", async (status, kind) => {
    const { adapter } = createAdapter(new Response(null, { status }));
    await expect(adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind });
  });

  it("does not call the provider for a missing credential or malformed provider resource ID", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const withoutCredential = createElevenLabsVoiceDeletionProviderAdapter({ env: {}, fetchImpl });
    const withCredential = createElevenLabsVoiceDeletionProviderAdapter({ env: SAFE_ENV, fetchImpl });

    await expect(withoutCredential.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "credential_missing" });
    await expect(withCredential.deleteVoice({ providerResourceId: "voice/unsafe" })).resolves.toEqual({
      kind: "invalid_provider_reference"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("distinguishes DELETE timeout from other network failures", async () => {
    const timeoutFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
    ) as unknown as typeof fetch;
    const timeoutAdapter = createElevenLabsVoiceDeletionProviderAdapter({ env: SAFE_ENV, fetchImpl: timeoutFetch, timeoutMs: 1 });
    const networkAdapter = createElevenLabsVoiceDeletionProviderAdapter({
      env: SAFE_ENV,
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch
    });

    await expect(timeoutAdapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "timeout" });
    await expect(networkAdapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "network_error" });
  });

  it("times out DELETE when the response body stalls", async () => {
    const { adapter } = createAdapter(stalledJsonResponse(), { timeoutMs: 1 });
    await expect(adapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "timeout" });
  });

  it.each([
    [true, { kind: "present", ownerSignal: "true" }],
    [false, { kind: "present", ownerSignal: "false" }],
    [null, { kind: "present", ownerSignal: "unknown" }],
    [undefined, { kind: "present", ownerSignal: "unknown" }]
  ])("makes an exact GET presence decision with is_owner=%s", async (is_owner, expected) => {
    const body = is_owner === undefined ? { voice_id: VOICE_ID } : { voice_id: VOICE_ID, is_owner };
    const { adapter, fetchImpl } = createAdapter(jsonResponse(200, body));

    await expect(adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.elevenlabs.io/v1/voices/${VOICE_ID}`, {
      method: "GET",
      headers: { "xi-api-key": "test-only-key" },
      signal: expect.any(AbortSignal)
    });
  });

  it.each([
    ["a different voice_id", jsonResponse(200, { voice_id: "other-voice" })],
    ["a missing voice_id", jsonResponse(200, {})],
    ["invalid JSON", new Response("not json", { status: 200 })],
    ["an invalid is_owner value", jsonResponse(200, { voice_id: VOICE_ID, is_owner: "yes" })]
  ])("treats GET 200 with %s as protocol error", async (_label, response) => {
    const { adapter } = createAdapter(response);
    await expect(adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "protocol_error" });
  });

  it.each([
    [404, officialError("not_found", "voice_not_found"), "verified_absent"],
    [404, officialError("not_found", "other_not_found"), "protocol_error"],
    [404, officialError(" not_found", "voice_not_found"), "protocol_error"],
    [404, officialError("not_found", " voice_not_found "), "protocol_error"],
    [404, { detail: "not found" }, "protocol_error"],
    [401, officialError("unauthorized", "invalid_api_key"), "auth_failed"],
    [403, officialError("forbidden", "forbidden"), "permission_denied"],
    [429, officialError("rate_limit_error", "concurrent_limit_exceeded"), "rate_limited"],
    [500, officialError("server_error", "internal_server_error"), "provider_unavailable"],
    [503, officialError("server_error", "service_unavailable"), "provider_unavailable"]
  ])("normalizes GET HTTP %i without overclaiming absence", async (status, payload, kind) => {
    const { adapter } = createAdapter(jsonResponse(status, payload));
    await expect(adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind });
  });

  it("retains only closed safe evidence for an exact diagnostic GET without changing normal reconciliation", async () => {
    const diagnostic = createAdapter(jsonResponse(404, officialError("not_found", "voice_not_found")));
    const normal = createAdapter(jsonResponse(404, officialError("not_found", "voice_not_found")));

    await expect(diagnostic.adapter.reconcileVoiceAbsenceWithSafeEvidence({ providerResourceId: VOICE_ID })).resolves.toEqual({
      result: { kind: "verified_absent" },
      evidence: {
        adapterOutcome: "strict_voice_not_found",
        httpStatusCategory: "not_found",
        safeProviderType: "not_found",
        safeProviderCode: "voice_not_found",
        mapperBranch: "strict_voice_not_found"
      }
    });
    await expect(normal.adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "verified_absent" });
  });

  it("allowlists diagnostic provider evidence and excludes raw provider data", async () => {
    const { adapter } = createAdapter(
      jsonResponse(401, {
        detail: {
          type: "unapproved_type",
          code: "invalid_api_key",
          message: "provider-private-message",
          request_id: "provider-private-request-id",
          nested: { token: "must-not-leak" }
        }
      })
    );

    const result = await adapter.reconcileVoiceAbsenceWithSafeEvidence({ providerResourceId: VOICE_ID });
    expect(result).toEqual({
      result: { kind: "auth_failed" },
      evidence: {
        adapterOutcome: "auth_failed",
        httpStatusCategory: "authentication_rejected",
        safeProviderType: "other",
        safeProviderCode: "invalid_api_key",
        mapperBranch: "http_authentication_rejected"
      }
    });
    const serialized = JSON.stringify(result);
    for (const sensitive of [VOICE_ID, "provider-private-message", "provider-private-request-id", "must-not-leak", "test-only-key"]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("collapses malformed diagnostic provider detail to unknown", async () => {
    const { adapter } = createAdapter(jsonResponse(403, { detail: { type: 123, code: ["forbidden"] } }));

    await expect(adapter.reconcileVoiceAbsenceWithSafeEvidence({ providerResourceId: VOICE_ID })).resolves.toEqual({
      result: { kind: "permission_denied" },
      evidence: {
        adapterOutcome: "permission_denied",
        httpStatusCategory: "authorization_rejected",
        safeProviderType: "unknown",
        safeProviderCode: "unknown",
        mapperBranch: "http_authorization_rejected"
      }
    });
  });

  it.each([
    [officialError(" not_found", "voice_not_found")],
    [officialError("not_found", " voice_not_found ")]
  ])("does not grant DELETE absence authority to whitespace-wrapped tokens", async (payload) => {
    const { adapter } = createAdapter(jsonResponse(404, payload));
    await expect(adapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "protocol_error" });
  });

  it("times out GET when the response body stalls", async () => {
    const { adapter } = createAdapter(stalledJsonResponse(), { timeoutMs: 1 });
    await expect(adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "timeout" });
  });

  it("does not turn either operation into orchestration", async () => {
    const deleteOnly = createAdapter(jsonResponse(200, { status: "ok" }));
    const getOnly = createAdapter(jsonResponse(404, officialError("not_found", "voice_not_found")));

    await expect(deleteOnly.adapter.deleteVoice({ providerResourceId: VOICE_ID })).resolves.toEqual({ kind: "deleted" });
    await expect(getOnly.adapter.reconcileVoiceAbsence({ providerResourceId: VOICE_ID })).resolves.toEqual({
      kind: "verified_absent"
    });
    expect(deleteOnly.fetchImpl).toHaveBeenCalledTimes(1);
    expect(getOnly.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
