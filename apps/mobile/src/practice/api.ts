import type { MobileAuthController } from "../auth/mobile-auth";
import type { MobileAuthState } from "../auth/state-machine";
import { ProgressMemory } from "./progress-memory";
import { SavedTakeAudioMemory, type SavedTakeAudioVisit } from "../audio/saved-take-memory";
import {
  acceptMobilePronunciationConsent,
  acceptMobileVoiceConsent,
  createMobileAccountDeletionRequest,
  createMobileVoiceDeletionRequest,
  createMobileScript,
  createMobileVoiceFromSample,
  downloadMobileScriptAudio,
  downloadMobileTakeAudio,
  type MobileTakeAudioDownloadState,
  evaluateMobileRecording,
  fetchMobileVoiceSetup,
  fetchMobilePronunciationConsent,
  fetchMobileProcessingConsent,
  fetchMobileAccountDeletionStatus,
  fetchMobileVoiceDeletionStatus,
  fetchMobileProgress,
  updateMobileTakeMetadata,
  type TakeMetadataPatch,
  type TakeMetadataRequestState,
  fetchMobileReview,
  fetchMobileScript,
  fetchMobileScripts,
  requestMobileScriptListen,
  advanceMobileVoiceDeletion,
  uploadMobileRecording,
  type CreateMobileScriptInput,
  type EvaluateMobileRecordingInput,
  type MobileAudioDownloadState,
  type MobileAccountDeletionRequestStateResult,
  type MobileVoiceDeletionRequestState,
  type MobileApiTimingCallback,
  type MobileApiTimingLabel,
  type MobileListenRequestState,
  type MobileProgress,
  type MobileProgressRequestState,
  type MobileProcessingConsentRequestState,
  type MobileRecordingUploadState,
  type MobileReview,
  type MobileReviewRequestState,
  type MobileScript,
  type MobileScriptRequestState,
  type MobileVoiceSetupRequestState,
  type ScriptsRequestState,
  type UploadMobileRecordingInput,
  type UploadedMobileRecording
} from "../lib/api";

export type {
  CreateMobileScriptInput,
  MobileProgress,
  MobileReview,
  MobileScript,
  UploadedMobileRecording
};

export type PracticeRequestFailure =
  | { kind: "offline" }
  | { kind: "invalid-request"; reasonCode: string }
  | { kind: "unauthorized"; reasonCode: string }
  | { kind: "forbidden"; reasonCode: string }
  | { kind: "not-found"; reasonCode: string }
  | { kind: "conflict"; reasonCode: string }
  | { kind: "payload-too-large"; reasonCode: string }
  | { kind: "unsupported-media-type"; reasonCode: string }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "server-error"; status: number }
  | { kind: "invalid-response" }
  | { kind: "timeout" }
  | { kind: "network-error" };

type RequestState = { kind: string; reasonCode?: string };

export interface PracticeApi {
  readonly progressMemory?: ProgressMemory;
  readonly savedTakeAudioMemory?: SavedTakeAudioMemory;
  prepareSavedTakeAudio?(review: MobileReview): Promise<MobileTakeAudioDownloadState>;
  listScripts(): Promise<ScriptsRequestState>;
  createScript(input: CreateMobileScriptInput): Promise<MobileScriptRequestState>;
  getScript(scriptId: string): Promise<MobileScriptRequestState>;
  requestListen(scriptId: string): Promise<MobileListenRequestState>;
  getVoiceSetup(): Promise<MobileVoiceSetupRequestState>;
  getPronunciationConsent(): Promise<MobileProcessingConsentRequestState>;
  getVoiceCloningConsent(): Promise<MobileProcessingConsentRequestState>;
  getAccountDeletionStatus(): Promise<MobileAccountDeletionRequestStateResult>;
  createAccountDeletionRequest(): Promise<MobileAccountDeletionRequestStateResult>;
  getVoiceDeletionStatus(): Promise<MobileVoiceDeletionRequestState>;
  createVoiceDeletionRequest(): Promise<MobileVoiceDeletionRequestState>;
  advanceVoiceDeletion(): Promise<MobileVoiceDeletionRequestState>;
  acceptPronunciationConsent(): Promise<MobileProcessingConsentRequestState>;
  acceptVoiceConsent(): Promise<MobileVoiceSetupRequestState>;
  createVoiceFromSample(sample: File): Promise<MobileVoiceSetupRequestState>;
  downloadAudio(audioId: string): Promise<MobileAudioDownloadState>;
  downloadTakeAudio(takeId: string): Promise<MobileTakeAudioDownloadState>;
  uploadRecording(input: UploadMobileRecordingInput): Promise<MobileRecordingUploadState>;
  evaluateRecording(input: EvaluateMobileRecordingInput): Promise<MobileReviewRequestState>;
  getReview(scriptId: string, takeId: string): Promise<MobileReviewRequestState>;
  updateTakeMetadata(takeId: string, input: TakeMetadataPatch): Promise<TakeMetadataRequestState>;
  getProgress(): Promise<MobileProgressRequestState>;
}

type PracticeApiOptions = Readonly<{
  auth: MobileAuthController;
  bffBaseUrl: string;
  ownerUserId: string;
  onSessionInvalid?: () => void | Promise<void>;
  onTiming?: MobileApiTimingCallback;
}>;

export const MOBILE_PERFORMANCE_MEASURE_PREFIX = "mobile_api_";

export function recordMobileApiTiming(
  sample: { label: MobileApiTimingLabel; durationMs: number },
  performanceSink: Pick<Performance, "clearMeasures" | "measure"> = performance
) {
  const name = `${MOBILE_PERFORMANCE_MEASURE_PREFIX}${sample.label}`;
  const durationMs = Math.max(0, sample.durationMs);

  try {
    performanceSink.clearMeasures(name);
    performanceSink.measure(name, { start: 0, duration: durationMs });
  } catch {
    // Performance collection must never change the practice request.
  }

  return name;
}

function sessionFailure<T extends RequestState>(reasonCode: string): T {
  return { kind: "unauthorized", reasonCode } as unknown as T;
}

function networkFailure<T extends RequestState>(): T {
  return { kind: "network-error" } as T;
}

export function shouldRefreshPracticeRequest(state: RequestState) {
  return state.kind === "unauthorized" &&
    state.reasonCode === "session_expired";
}

export function isPracticeOwnerStateCurrent(state: MobileAuthState, ownerUserId: string) {
  return state.kind === "refreshing" ||
    (state.kind === "authenticated" && state.userId === ownerUserId);
}

export function getPracticeErrorCopy(state: PracticeRequestFailure | RequestState) {
  switch (state.kind) {
    case "offline":
    case "network-error":
      return "通信を確認して、もう一度お試しください。";
    case "timeout":
      return "処理に時間がかかっています。少し待ってから再試行してください。";
    case "rate-limited":
      return "ただいま混み合っています。少し待ってから再試行してください。";
    case "payload-too-large":
      return "音声サイズが大きすぎます。短く録り直してください。";
    case "unsupported-media-type":
      return "この音声形式は送信できません。録り直してください。";
    case "not-found":
      return "対象のデータが見つかりません。台本一覧から選び直してください。";
    case "unauthorized":
      return "ログイン状態を確認できませんでした。もう一度ログインしてください。";
    case "forbidden":
      return "このデータを表示する権限を確認できませんでした。";
    case "conflict":
      return state.reasonCode === "evaluation_in_progress"
        ? "同じTakeを評価中です。少し待ってから再試行してください。"
        : "この操作を完了できませんでした。内容を確認して再試行してください。";
    case "invalid-request":
      return state.reasonCode === "voice_sample_invalid"
        ? "声の録音を確認して、もう一度録音してください。"
        : "この操作を完了できませんでした。内容を確認して再試行してください。";
    case "server-error":
    case "invalid-response":
    default:
      return "処理を完了できませんでした。少し待ってから再試行してください。";
  }
}

export function createPracticeApi({
  auth,
  bffBaseUrl,
  ownerUserId,
  onSessionInvalid,
  onTiming = recordMobileApiTiming
}: PracticeApiOptions): PracticeApi {
  const listenRequests = new Map<string, Promise<MobileListenRequestState>>();
  const metadataWrites = new Set<Promise<TakeMetadataRequestState>>();
  const progressMemory = new ProgressMemory(() => afterMetadataWrites(() =>
    request(token => fetchMobileProgress(bffBaseUrl, token, { onTiming }))));
  const savedTakeAudioMemory = new SavedTakeAudioMemory(ownerIsCurrent);

  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    savedTakeAudioMemory.invalidate();
    const finish = progressMemory.beginMutation();
    try { return await operation(); }
    finally { savedTakeAudioMemory.invalidate(); finish(); }
  }

  function updateTakeMetadata(takeId: string, input: TakeMetadataPatch) {
    const pending = mutate(() => request(token => updateMobileTakeMetadata(bffBaseUrl, token, takeId, input, { onTiming })));
    metadataWrites.add(pending);
    const settled = () => { metadataWrites.delete(pending); };
    void pending.then(settled, settled);
    return pending;
  }

  async function afterMetadataWrites<T>(read: () => Promise<T>) {
    // A screen may unmount during a save. New screens must read after that write,
    // while still fetching canonical data instead of carrying client metadata.
    await Promise.allSettled([...metadataWrites]);
    return read();
  }

  function ownerIsCurrent() {
    return !progressMemory.isRevoked() && isPracticeOwnerStateCurrent(auth.getState(), ownerUserId);
  }

  async function invalidateSession() {
    savedTakeAudioMemory.invalidate();
    if (ownerIsCurrent()) {
      await onSessionInvalid?.();
    }
  }

  async function request<T extends RequestState>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    if (!ownerIsCurrent()) {
      savedTakeAudioMemory.revoke();
      return sessionFailure<T>("session_owner_changed");
    }

    let accessToken: string | null;

    try {
      accessToken = await auth.getAccessToken();
    } catch {
      return networkFailure<T>();
    }

    if (!accessToken) {
      const refresh = await auth.refresh();
      if (!refresh.ok) {
        if (refresh.reasonCode === "auth_refresh_failed") {
          return networkFailure<T>();
        }
        await invalidateSession();
        return sessionFailure<T>(refresh.reasonCode);
      }
      accessToken = await auth.getAccessToken();
    }

    if (!accessToken || !ownerIsCurrent()) {
      await invalidateSession();
      return sessionFailure<T>("session_missing");
    }

    let state = await operation(accessToken);
    accessToken = null;

    if (!ownerIsCurrent()) {
      return sessionFailure<T>("session_owner_changed");
    }

    if (!shouldRefreshPracticeRequest(state)) {
      if (state.kind === "unauthorized") {
        await invalidateSession();
      }
      return state;
    }

    const refresh = await auth.refresh();
    if (!refresh.ok) {
      if (refresh.reasonCode === "auth_refresh_failed") {
        return networkFailure<T>();
      }
      await invalidateSession();
      return sessionFailure<T>(refresh.reasonCode);
    }

    const refreshedAccessToken = await auth.getAccessToken();
    if (!refreshedAccessToken || !ownerIsCurrent()) {
      await invalidateSession();
      return sessionFailure<T>("session_missing");
    }

    state = await operation(refreshedAccessToken);
    if (!ownerIsCurrent()) {
      return sessionFailure<T>("session_owner_changed");
    }
    if (state.kind === "unauthorized") {
      await invalidateSession();
    }
    return state;
  }

  async function sessionFingerprint(token: string) {
    // Retain only a one-way credential fingerprint; never the raw token or a log.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function validateAudioVisit(visit: SavedTakeAudioVisit, token: string): Promise<MobileReviewRequestState> {
    const epoch = savedTakeAudioMemory.validationEpoch();
    const session = await sessionFingerprint(token);
    const result = await fetchMobileReview(bffBaseUrl, token, visit.scriptId, visit.takeId, { onTiming });
    if (!savedTakeAudioMemory.current(visit) || epoch !== savedTakeAudioMemory.validationEpoch()) return { kind: "invalid-response" };
    if (result.kind !== "success") { savedTakeAudioMemory.invalidate(); return result; }
    savedTakeAudioMemory.authorize(visit, epoch, session, result.review.audioIdentity);
    return { ...result, review: { ...result.review, audioVisit: visit } };
  }

  async function getReview(scriptId: string, takeId: string) {
    const visit = savedTakeAudioMemory.beginVisit(scriptId, takeId);
    try {
      const result = await afterMetadataWrites(() => request(token => validateAudioVisit(visit, token)));
      if (result.kind !== "success" && savedTakeAudioMemory.current(visit)) savedTakeAudioMemory.invalidate();
      return result;
    } catch {
      if (savedTakeAudioMemory.current(visit)) savedTakeAudioMemory.invalidate();
      return { kind: "network-error" as const };
    }
  }

  async function prepareSavedTakeAudio(review: MobileReview): Promise<MobileTakeAudioDownloadState> {
    const visit = review.audioVisit;
    if (!visit || !savedTakeAudioMemory.current(visit) || visit.takeId !== review.takeId || visit.scriptId !== review.scriptId) return { kind: "invalid-response" };
    return afterMetadataWrites(() => request(async token => {
      const session = await sessionFingerprint(token);
      if (!savedTakeAudioMemory.authorized(visit, session)) {
        const validated = await validateAudioVisit(visit, token);
        if (validated.kind !== "success") return validated;
      }
      return savedTakeAudioMemory.load(visit, session, async () => {
        const audio = await downloadMobileTakeAudio(bffBaseUrl, token, visit.takeId, { onTiming });
        const currentToken = await auth.getAccessToken();
        if (!currentToken || await sessionFingerprint(currentToken) !== session) {
          savedTakeAudioMemory.invalidate();
          return { kind: "unauthorized", reasonCode: "session_changed" };
        }
        return audio;
      });
    }));
  }

  function requestListen(scriptId: string) {
    const existing = listenRequests.get(scriptId);
    if (existing) {
      return existing;
    }

    const pending = request((token) =>
      requestMobileScriptListen(bffBaseUrl, token, scriptId, { onTiming })
    );
    listenRequests.set(scriptId, pending);
    const clearPending = () => {
      if (listenRequests.get(scriptId) === pending) {
        listenRequests.delete(scriptId);
      }
    };
    void pending.then(clearPending, clearPending);
    return pending;
  }

  return {
    progressMemory,
    savedTakeAudioMemory,
    prepareSavedTakeAudio,
    listScripts: () => request((token) => fetchMobileScripts(bffBaseUrl, token, { onTiming })),
    createScript: (input) => mutate(() => request((token) => createMobileScript(bffBaseUrl, token, input, { onTiming }))),
    getScript: (scriptId) => request((token) => fetchMobileScript(bffBaseUrl, token, scriptId, { onTiming })),
    requestListen,
    getPronunciationConsent: () => request((token) => fetchMobilePronunciationConsent(bffBaseUrl, token, { onTiming })),
    getVoiceCloningConsent: () => request((token) => fetchMobileProcessingConsent(bffBaseUrl, token, "voice_cloning", { onTiming })),
    getAccountDeletionStatus: () => request((token) => fetchMobileAccountDeletionStatus(bffBaseUrl, token, { onTiming })),
    createAccountDeletionRequest: () => mutate(() => request((token) => createMobileAccountDeletionRequest(bffBaseUrl, token, { onTiming }))),
    getVoiceDeletionStatus: () => request((token) => fetchMobileVoiceDeletionStatus(bffBaseUrl, token, { onTiming })),
    createVoiceDeletionRequest: () => mutate(() => request((token) => createMobileVoiceDeletionRequest(bffBaseUrl, token, { onTiming }))),
    advanceVoiceDeletion: () => mutate(() => request((token) => advanceMobileVoiceDeletion(bffBaseUrl, token, { onTiming }))),
    acceptPronunciationConsent: () => request((token) => acceptMobilePronunciationConsent(bffBaseUrl, token, { onTiming })),
    getVoiceSetup: () => request((token) => fetchMobileVoiceSetup(bffBaseUrl, token, { onTiming })),
    acceptVoiceConsent: () => request((token) => acceptMobileVoiceConsent(bffBaseUrl, token, { onTiming })),
    createVoiceFromSample: (sample) => request((token) => createMobileVoiceFromSample(bffBaseUrl, token, sample, { onTiming })),
    downloadAudio: (audioId) => request((token) => downloadMobileScriptAudio(bffBaseUrl, token, audioId, { onTiming })),
    downloadTakeAudio: (takeId) => afterMetadataWrites(() => request((token) => downloadMobileTakeAudio(bffBaseUrl, token, takeId, { onTiming }))),
    uploadRecording: (input) => request((token) => uploadMobileRecording(bffBaseUrl, token, input, { onTiming })),
    evaluateRecording: (input) => mutate(() => request((token) => evaluateMobileRecording(bffBaseUrl, token, input, { onTiming }))),
    getReview,
    updateTakeMetadata,
    getProgress: () => afterMetadataWrites(() => request((token) => fetchMobileProgress(bffBaseUrl, token, { onTiming })))
  };
}
