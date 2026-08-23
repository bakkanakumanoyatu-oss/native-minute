import "server-only";

import type {
  DeleteVoiceInput,
  DeleteVoiceResult,
  ReconcileVoiceAbsenceInput,
  ReconcileVoiceAbsenceResult,
  VoiceDeletionProviderAdapter,
  VoiceDeletionProviderFailureKind
} from "./types";

const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";
const ELEVENLABS_REQUEST_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_RESOURCE_ID_LENGTH = 128;
const SAFE_PROVIDER_RESOURCE_ID = /^[A-Za-z0-9_-]+$/;

type FetchImplementation = typeof fetch;
type OfficialErrorDetail = { type: string; code: string };
type BoundedJsonResponse = { status: number; payload: unknown };

export type ElevenLabsVoiceDeletionAdapterOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
};

function hasSafeProviderResourceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PROVIDER_RESOURCE_ID_LENGTH &&
    SAFE_PROVIDER_RESOURCE_ID.test(value)
  );
}

function getApiKey(env: NodeJS.ProcessEnv) {
  const value = env.ELEVENLABS_API_KEY?.trim();
  return value || null;
}

function getVoiceUrl(providerResourceId: string) {
  return `${ELEVENLABS_VOICES_URL}/${encodeURIComponent(providerResourceId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOfficialErrorDetail(payload: unknown): OfficialErrorDetail | null {
  if (!isRecord(payload) || !isRecord(payload.detail)) {
    return null;
  }

  const type = payload.detail.type;
  const code = payload.detail.code;

  if (typeof type !== "string" || typeof code !== "string") {
    return null;
  }

  return { type, code };
}

function classifyErrorResponse(input: {
  status: number;
  detail: OfficialErrorDetail | null;
  allowVerifiedAbsence: boolean;
}): VoiceDeletionProviderFailureKind | "verified_absent" {
  if (input.status === 404) {
    if (input.detail?.type !== "not_found" || input.detail?.code !== "voice_not_found") {
      return "protocol_error";
    }

    return input.allowVerifiedAbsence ? "verified_absent" : "not_found";
  }

  if (input.status === 401) {
    return "auth_failed";
  }

  if (input.status === 403) {
    return "permission_denied";
  }

  if (input.status === 429) {
    return "rate_limited";
  }

  if (input.status >= 500 && input.status <= 599) {
    return "provider_unavailable";
  }

  if (input.status >= 400 && input.status <= 499) {
    return "provider_rejected";
  }

  return "protocol_error";
}

async function fetchWithTimeout(input: {
  fetchImpl: FetchImplementation;
  url: string;
  method: "DELETE" | "GET";
  apiKey: string;
  timeoutMs: number;
}): Promise<{ response: BoundedJsonResponse | null; failure: "timeout" | "network_error" | null }> {
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("elevenlabs_request_timeout"));
    }, input.timeoutMs);
  });

  try {
    const response = await Promise.race([
      input.fetchImpl(input.url, {
        method: input.method,
        headers: { "xi-api-key": input.apiKey },
        signal: controller.signal
      }),
      deadline
    ]);
    const payload = await Promise.race([
      Promise.resolve()
        .then(() => response.json())
        .catch(() => null),
      deadline
    ]);

    return { response: { status: response.status, payload }, failure: timedOut ? "timeout" : null };
  } catch {
    return { response: null, failure: timedOut ? "timeout" : "network_error" };
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function getRequestSetup(input: { providerResourceId: unknown; env: NodeJS.ProcessEnv }) {
  if (!hasSafeProviderResourceId(input.providerResourceId)) {
    return { kind: "invalid_provider_reference" } as const;
  }

  const apiKey = getApiKey(input.env);
  if (!apiKey) {
    return { kind: "credential_missing" } as const;
  }

  return { apiKey, providerResourceId: input.providerResourceId } as const;
}

function isSetupFailure(value: ReturnType<typeof getRequestSetup>): value is { kind: "invalid_provider_reference" | "credential_missing" } {
  return "kind" in value;
}

export class ElevenLabsVoiceDeletionProviderAdapter implements VoiceDeletionProviderAdapter {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: ElevenLabsVoiceDeletionAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? ELEVENLABS_REQUEST_TIMEOUT_MS;
  }

  async deleteVoice(input: DeleteVoiceInput): Promise<DeleteVoiceResult> {
    const setup = getRequestSetup({ providerResourceId: input?.providerResourceId, env: this.env });
    if (isSetupFailure(setup)) {
      return setup;
    }

    const request = await fetchWithTimeout({
      fetchImpl: this.fetchImpl,
      url: getVoiceUrl(setup.providerResourceId),
      method: "DELETE",
      apiKey: setup.apiKey,
      timeoutMs: this.timeoutMs
    });

    if (request.failure) {
      return { kind: request.failure };
    }

    if (!request.response || request.response.status !== 200) {
      if (!request.response) {
        return { kind: "network_error" };
      }

      const detail = parseOfficialErrorDetail(request.response.payload);
      const classification = classifyErrorResponse({
        status: request.response.status,
        detail,
        allowVerifiedAbsence: false
      });

      return { kind: classification === "verified_absent" ? "protocol_error" : classification };
    }

    const payload = request.response.payload;
    return isRecord(payload) && payload.status === "ok" ? { kind: "deleted" } : { kind: "protocol_error" };
  }

  async reconcileVoiceAbsence(input: ReconcileVoiceAbsenceInput): Promise<ReconcileVoiceAbsenceResult> {
    const setup = getRequestSetup({ providerResourceId: input?.providerResourceId, env: this.env });
    if (isSetupFailure(setup)) {
      return setup;
    }

    const request = await fetchWithTimeout({
      fetchImpl: this.fetchImpl,
      url: getVoiceUrl(setup.providerResourceId),
      method: "GET",
      apiKey: setup.apiKey,
      timeoutMs: this.timeoutMs
    });

    if (request.failure) {
      return { kind: request.failure };
    }

    if (!request.response) {
      return { kind: "network_error" };
    }

    if (request.response.status === 200) {
      const payload = request.response.payload;
      if (!isRecord(payload) || payload.voice_id !== setup.providerResourceId) {
        return { kind: "protocol_error" };
      }

      if (payload.is_owner === true) {
        return { kind: "present", ownerSignal: "true" };
      }

      if (payload.is_owner === false) {
        return { kind: "present", ownerSignal: "false" };
      }

      return payload.is_owner === undefined || payload.is_owner === null
        ? { kind: "present", ownerSignal: "unknown" }
        : { kind: "protocol_error" };
    }

    const detail = parseOfficialErrorDetail(request.response.payload);
    const classification = classifyErrorResponse({
      status: request.response.status,
      detail,
      allowVerifiedAbsence: true
    });

    return { kind: classification === "not_found" ? "protocol_error" : classification };
  }
}

export function createElevenLabsVoiceDeletionProviderAdapter(
  options: ElevenLabsVoiceDeletionAdapterOptions = {}
): VoiceDeletionProviderAdapter {
  return new ElevenLabsVoiceDeletionProviderAdapter(options);
}
