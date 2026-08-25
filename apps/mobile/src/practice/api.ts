import type { MobileAuthController } from "../auth/mobile-auth";
import type { MobileAuthState } from "../auth/state-machine";
import {
  acceptMobilePronunciationConsent,
  acceptMobileVoiceConsent,
  createMobileAccountDeletionRequest,
  createMobileVoiceDeletionRequest,
  createMobileScript,
  createMobileVoiceFromSample,
  downloadMobileScriptAudio,
  evaluateMobileRecording,
  fetchMobileVoiceSetup,
  fetchMobilePronunciationConsent,
  fetchMobileProcessingConsent,
  fetchMobileAccountDeletionStatus,
  fetchMobileVoiceDeletionStatus,
  fetchMobileProgress,
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
  uploadRecording(input: UploadMobileRecordingInput): Promise<MobileRecordingUploadState>;
  evaluateRecording(input: EvaluateMobileRecordingInput): Promise<MobileReviewRequestState>;
  getReview(scriptId: string, takeId: string): Promise<MobileReviewRequestState>;
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

  function ownerIsCurrent() {
    return isPracticeOwnerStateCurrent(auth.getState(), ownerUserId);
  }

  async function invalidateSession() {
    if (ownerIsCurrent()) {
      await onSessionInvalid?.();
    }
  }

  async function request<T extends RequestState>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    if (!ownerIsCurrent()) {
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
    listScripts: () => request((token) => fetchMobileScripts(bffBaseUrl, token, { onTiming })),
    createScript: (input) => request((token) => createMobileScript(bffBaseUrl, token, input, { onTiming })),
    getScript: (scriptId) => request((token) => fetchMobileScript(bffBaseUrl, token, scriptId, { onTiming })),
    requestListen,
    getPronunciationConsent: () => request((token) => fetchMobilePronunciationConsent(bffBaseUrl, token, { onTiming })),
    getVoiceCloningConsent: () => request((token) => fetchMobileProcessingConsent(bffBaseUrl, token, "voice_cloning", { onTiming })),
    getAccountDeletionStatus: () => request((token) => fetchMobileAccountDeletionStatus(bffBaseUrl, token, { onTiming })),
    createAccountDeletionRequest: () => request((token) => createMobileAccountDeletionRequest(bffBaseUrl, token, { onTiming })),
    getVoiceDeletionStatus: () => request((token) => fetchMobileVoiceDeletionStatus(bffBaseUrl, token, { onTiming })),
    createVoiceDeletionRequest: () => request((token) => createMobileVoiceDeletionRequest(bffBaseUrl, token, { onTiming })),
    advanceVoiceDeletion: () => request((token) => advanceMobileVoiceDeletion(bffBaseUrl, token, { onTiming })),
    acceptPronunciationConsent: () => request((token) => acceptMobilePronunciationConsent(bffBaseUrl, token, { onTiming })),
    getVoiceSetup: () => request((token) => fetchMobileVoiceSetup(bffBaseUrl, token, { onTiming })),
    acceptVoiceConsent: () => request((token) => acceptMobileVoiceConsent(bffBaseUrl, token, { onTiming })),
    createVoiceFromSample: (sample) => request((token) => createMobileVoiceFromSample(bffBaseUrl, token, sample, { onTiming })),
    downloadAudio: (audioId) => request((token) => downloadMobileScriptAudio(bffBaseUrl, token, audioId, { onTiming })),
    uploadRecording: (input) => request((token) => uploadMobileRecording(bffBaseUrl, token, input, { onTiming })),
    evaluateRecording: (input) => request((token) => evaluateMobileRecording(bffBaseUrl, token, input, { onTiming })),
    getReview: (scriptId, takeId) => request((token) => fetchMobileReview(bffBaseUrl, token, scriptId, takeId, { onTiming })),
    getProgress: () => request((token) => fetchMobileProgress(bffBaseUrl, token, { onTiming }))
  };
}
