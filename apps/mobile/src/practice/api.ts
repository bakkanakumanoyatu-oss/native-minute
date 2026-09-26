import type { MobileAuthController } from "../auth/mobile-auth";
import { SCRIPT_LENGTH_EDIT_GUIDANCE } from "../../../../lib/script-length";
import type { MobileAuthState } from "../auth/state-machine";
import { scriptsDisplayMemory, reviewDisplayMemory, type ReviewDisplay } from "./display-loaders";
import type { DisplayMemory } from "./display-memory";
import { ProgressMemory } from "./progress-memory";
import { SavedTakeAudioMemory, type SavedTakeAudioVisit } from "../audio/saved-take-memory";
import {
  acceptMobilePronunciationConsent,
  acceptMobileVoiceConsent,
  createMobileAccountDeletionRequest,
  createMobileVoiceDeletionRequest,
  createMobileScript,
  mutateMobileScript,
  type ScriptMutationInput,
  type PracticeIdentity,
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
  type MobileTakeMetadata,
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
  readonly scriptsMemory?: DisplayMemory<MobileScript[]>;
  readonly reviewMemory?: DisplayMemory<ReviewDisplay>;
  readonly savedTakeAudioMemory?: SavedTakeAudioMemory;
  prepareSavedTakeAudio?(review: MobileReview): Promise<MobileTakeAudioDownloadState>;
  prefetchSavedTakeAudio?(review: MobileReview): Promise<void>;
  listScripts(signal?: AbortSignal): Promise<ScriptsRequestState>;
  createScript(input: CreateMobileScriptInput): Promise<MobileScriptRequestState>;
  mutateScript?(scriptId: string, input: ScriptMutationInput): Promise<MobileScriptRequestState>;
  listArchivedScripts?(): Promise<ScriptsRequestState>;
  getScript(scriptId: string, signal?: AbortSignal): Promise<MobileScriptRequestState>;
  requestListen(scriptId: string, identity?: PracticeIdentity): Promise<MobileListenRequestState>;
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
  createVoiceFromSample(sample: File, operationId?: string): Promise<MobileVoiceSetupRequestState>;
  downloadAudio(audioId: string): Promise<MobileAudioDownloadState>;
  downloadTakeAudio(takeId: string): Promise<MobileTakeAudioDownloadState>;
  uploadRecording(input: UploadMobileRecordingInput): Promise<MobileRecordingUploadState>;
  evaluateRecording(input: EvaluateMobileRecordingInput): Promise<MobileReviewRequestState>;
  getReview(scriptId: string, takeId: string, signal?: AbortSignal): Promise<MobileReviewRequestState>;
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
      return state.reasonCode === "quota_limit_reached"
        ? "今はこの操作の利用上限に達しています。"
        : state.reasonCode === "quota_operation_already_used"
        ? "この操作は処理済みか確認中です。結果を確認してください。"
        : state.reasonCode === "evaluation_in_progress"
        ? "同じTakeを評価中です。少し待ってから再試行してください。"
        : "この操作を完了できませんでした。内容を確認して再試行してください。";
    case "invalid-request":
      return state.reasonCode === "script_length_exceeded"
        ? SCRIPT_LENGTH_EDIT_GUIDANCE
        : state.reasonCode === "voice_sample_invalid"
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
  let scriptMutationSequence = 0;
  const listenRequests = new Map<string, Promise<MobileListenRequestState>>();
  const metadataWrites = new Set<Promise<TakeMetadataRequestState>>();
  const progressMemory = new ProgressMemory(signal => afterMetadataWrites(() =>
    request(token => fetchMobileProgress(bffBaseUrl, token, { onTiming, signal }))), undefined,
    () => isPracticeOwnerStateCurrent(auth.getState(), ownerUserId));
  const savedTakeAudioMemory = new SavedTakeAudioMemory(ownerIsCurrent);
  const displayOwnerIsCurrent = () => {
    const state = auth.getState();
    return ownerIsCurrent() && isPracticeOwnerStateCurrent(state, ownerUserId);
  };
  const listScripts = (signal?: AbortSignal) => request(token => fetchMobileScripts(bffBaseUrl, token, { onTiming, signal }));
  const getScript = (scriptId: string, signal?: AbortSignal) => request(token => fetchMobileScript(bffBaseUrl, token, scriptId, { onTiming, signal }));
  const scriptsMemory = scriptsDisplayMemory({ listScripts }, displayOwnerIsCurrent);
  const reviewMemory = reviewDisplayMemory({ getReview, getScript, savedTakeAudioMemory }, displayOwnerIsCurrent, {
    onFailure: (key, error) => { if (error.kind === "not-found" || error.kind === "forbidden") removeUnavailableReview(key, error); },
    onSuccess: (_key, data) => patchProgressTake(data.review)
  });


  function patchProgressTake(metadata: MobileTakeMetadata) {
    const differs = (take: { id: string; favorite: boolean; displayName: string | null } | null) =>
      take?.id === metadata.takeId && (take.favorite !== metadata.favorite || take.displayName !== metadata.displayName);
    const patch = <T extends { id: string; favorite: boolean; displayName: string | null }>(take: T | null): T | null =>
      take?.id === metadata.takeId ? { ...take, favorite: metadata.favorite, displayName: metadata.displayName } : take;
    progressMemory.memory.update((_key, progress) => progress.scripts.some(item =>
      [item.latestTake, item.bestTake, item.previousTake, ...item.takeHistory].some(differs)), progress => ({ ...progress,
      scripts: progress.scripts.map(item => ({ ...item, latestTake: patch(item.latestTake), bestTake: patch(item.bestTake),
        previousTake: patch(item.previousTake), revisionHistory: item.revisionHistory?.map(revision => ({ ...revision, latestTake: patch(revision.latestTake), bestTake: patch(revision.bestTake) })), takeHistory: item.takeHistory.map(take => patch(take)!) })) }));
  }
  function removeUnavailableReview(key: string, error: PracticeRequestFailure) {
    const [scriptId, takeId] = key.split("/");
    const scriptUnavailable = "reasonCode" in error && error.reasonCode.startsWith("script_");
    reviewMemory.remove(k => scriptUnavailable ? k.startsWith(scriptId + "/") : k === key, error);
    if (scriptUnavailable) scriptsMemory.update(() => true, scripts => scripts.filter(script => script.id !== scriptId));
    // These server-selected aggregates cannot safely be inferred after a denial.
    progressMemory.memory.remove((_key, progress) => !!progress?.scripts.some(item => item.script.id === scriptId &&
      (scriptUnavailable || [item.latestTake, item.bestTake, item.previousTake, ...item.takeHistory].some(take => take?.id === takeId))));
    void progressMemory.revalidate();
  }
  async function mutate<T extends RequestState>(operation: () => Promise<T>, scope: "take" | "script" | "evaluate" | "account" | "voice", takeId?: string, apply?: (result: T) => void): Promise<T> {
    savedTakeAudioMemory.invalidate();
    const relevantReview = (key: string) => scope === "account" || (scope === "script" && !!takeId && key.startsWith(takeId + "/")) || ((scope === "take" || scope === "evaluate") && key.endsWith("/" + takeId));
    const finishProgress = scope !== "voice" ? progressMemory.beginMutation() : () => undefined;
    const finishScripts = scope === "script" || scope === "account" ? scriptsMemory.beginMutation() : () => undefined;
    const finishReview = scope !== "voice" ? reviewMemory.beginMutation(relevantReview) : () => undefined;
    const markUncertain = () => {
      if (scope !== "voice") progressMemory.memory.markDirty();
      if (scope === "script" || scope === "account") scriptsMemory.markDirty();
      if (scope === "take" || scope === "script" || scope === "account") reviewMemory.markDirty(relevantReview);
    };
    try {
      const result = await operation();
      if (!ownerIsCurrent()) return result;
      if (result.kind === "success") apply?.(result);
      const uncertain = ["timeout", "network-error", "invalid-response", "server-error"].includes(result.kind);
      if (uncertain || result.kind === "success") {
        if (scope === "script" || scope === "evaluate" || scope === "account" || (scope === "take" && uncertain)) progressMemory.memory.markDirty();
        if (scope === "account" || (scope === "script" && uncertain)) scriptsMemory.markDirty();
        if (scope === "account" || scope === "script" || (scope === "take" && uncertain)) reviewMemory.markDirty(relevantReview);
      }
      if (scope === "take" && (result.kind === "not-found" || result.kind === "forbidden")) {
        for (const key of reviewMemory.keys().filter(relevantReview)) removeUnavailableReview(key, result as unknown as PracticeRequestFailure);
      }
      return result;
    } catch (error) {
      if (ownerIsCurrent()) markUncertain();
      throw error;
    } finally { savedTakeAudioMemory.invalidate(); finishProgress(); finishScripts(); finishReview(); }
  }

  function updateTakeMetadata(takeId: string, input: TakeMetadataPatch) {
    const pending = mutate(() => request(token => updateMobileTakeMetadata(bffBaseUrl, token, takeId, input, { onTiming })), "take", takeId, result => {
      if (result.kind !== "success") return;
      patchProgressTake(result.metadata);
      reviewMemory.update((_key, data) => data.review.takeId === takeId, data => ({ ...data, review: { ...data.review, ...result.metadata } }));
    });
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
      return { kind: "invalid-response" } as T;
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

  async function validateAudioVisit(visit: SavedTakeAudioVisit, token: string, signal?: AbortSignal): Promise<MobileReviewRequestState> {
    const epoch = savedTakeAudioMemory.validationEpoch();
    const session = await sessionFingerprint(token);
    const result = await fetchMobileReview(bffBaseUrl, token, visit.scriptId, visit.takeId, { onTiming, signal });
    if (!savedTakeAudioMemory.current(visit) || epoch !== savedTakeAudioMemory.validationEpoch()) return { kind: "invalid-response" };
    if (result.kind !== "success") { savedTakeAudioMemory.invalidate(); return result; }
    savedTakeAudioMemory.authorize(visit, epoch, session, result.review.audioIdentity);
    return { ...result, review: { ...result.review, audioVisit: visit } };
  }

  async function getReview(scriptId: string, takeId: string, signal?: AbortSignal) {
    const visit = savedTakeAudioMemory.beginVisit(scriptId, takeId);
    try {
      const result = await afterMetadataWrites(() => request(token => validateAudioVisit(visit, token, signal)));
      if (result.kind !== "success" && savedTakeAudioMemory.current(visit)) savedTakeAudioMemory.invalidate();
      return result;
    } catch {
      if (savedTakeAudioMemory.current(visit)) savedTakeAudioMemory.invalidate();
      return { kind: "invalid-response" as const };
    }
  }

  async function prepareSavedTakeAudio(review: MobileReview): Promise<MobileTakeAudioDownloadState> {
    if (!review.audioVisit) {
      // An exact metadata write may have fenced an entry's pending validation.
      // Only an explicit Play can recover that missing capability. This shares
      // the mounted Review request and cannot start work after its route exits.
      const key = `${review.scriptId}/${review.takeId}`;
      await reviewMemory.refreshKey(key, "audio");
      const current = reviewMemory.peek(key)?.review;
      if (!current?.audioVisit) return { kind: "invalid-response" };
      review = current;
    }
    const visit = review.audioVisit;
    if (!visit || !savedTakeAudioMemory.current(visit) || visit.takeId !== review.takeId || visit.scriptId !== review.scriptId) return { kind: "invalid-response" };
    return afterMetadataWrites(() => request(async token => {
      const session = await sessionFingerprint(token);
      if (!savedTakeAudioMemory.authorized(visit, session)) {
        const validated = await validateAudioVisit(visit, token);
        if (validated.kind !== "success") return validated;
      }
      return loadSavedTakeAudio(visit, session, token);
    }));
  }

  function loadSavedTakeAudio(visit: SavedTakeAudioVisit, session: string, token: string) {
    return savedTakeAudioMemory.load(visit, session, async signal => {
      const audio = await downloadMobileTakeAudio(bffBaseUrl, token, visit.takeId, { onTiming, signal });
      if (signal.aborted) return { kind: "invalid-response" };
      const currentToken = await auth.getAccessToken();
      if (signal.aborted) return { kind: "invalid-response" };
      if (!currentToken || await sessionFingerprint(currentToken) !== session) {
        if (!signal.aborted) savedTakeAudioMemory.invalidate();
        return { kind: "unauthorized", reasonCode: "session_changed" };
      }
      return audio;
    });
  }

  async function prefetchSavedTakeAudio(review: MobileReview): Promise<void> {
    const visit = review.audioVisit;
    if (!visit || visit.takeId !== review.takeId || visit.scriptId !== review.scriptId || !savedTakeAudioMemory.current(visit)) return;
    const epoch = savedTakeAudioMemory.validationEpoch();
    try {
      // Only consume the successful Review proof. No revalidation, auth refresh,
      // automatic retry, or UI error transition from this speculative operation.
      const token = await auth.getAccessToken();
      const session = token ? await sessionFingerprint(token) : null;
      if (epoch !== savedTakeAudioMemory.validationEpoch() || !savedTakeAudioMemory.current(visit)) return;
      if (!token || !session || !savedTakeAudioMemory.authorized(visit, session)) {
        savedTakeAudioMemory.invalidate();
        return;
      }
      await loadSavedTakeAudio(visit, session, token);
    } catch {
      if (epoch === savedTakeAudioMemory.validationEpoch() && savedTakeAudioMemory.current(visit)) savedTakeAudioMemory.invalidate();
    }
  }

  function requestListen(scriptId: string, identity?: PracticeIdentity) {
    const requestKey = `${scriptId}/${identity?.expectedRevisionId}/${identity?.expectedPracticeEpoch}`;
    const existing = listenRequests.get(requestKey);
    if (existing) {
      return existing;
    }

    const operationId = crypto.randomUUID();
    const pending = request((token) =>
      requestMobileScriptListen(bffBaseUrl, token, scriptId, { onTiming, ...identity, operationId })
    );
    listenRequests.set(requestKey, pending);
    const clearPending = () => {
      if (listenRequests.get(requestKey) === pending) {
        listenRequests.delete(requestKey);
      }
    };
    void pending.then(clearPending, clearPending);
    return pending;
  }

  return {
    progressMemory,
    savedTakeAudioMemory,
    scriptsMemory,
    reviewMemory,
    prepareSavedTakeAudio,
    prefetchSavedTakeAudio,
    listScripts,
    listArchivedScripts: () => request(token => fetchMobileScripts(bffBaseUrl, token, { onTiming, archived: true })),
    mutateScript: (scriptId, input) => {
      const sequence = ++scriptMutationSequence;
      return mutate(() => request(token => mutateMobileScript(bffBaseUrl, token, scriptId, input, { onTiming })), "script", scriptId, result => {
      if (result.kind !== "success") return;
      if (sequence !== scriptMutationSequence) { scriptsMemory.markDirty(); return; }
      scriptsMemory.update(() => true, scripts => {
        const existing = scripts.find(script => script.id === scriptId);
        if (existing && existing.lockVersion > result.script.lockVersion) return scripts;
        return (result.script.archivedAt ? scripts.filter(script => script.id !== scriptId) : [result.script, ...scripts.filter(script => script.id !== scriptId)])
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    });
    },
    createScript: (input) => mutate(() => request((token) => createMobileScript(bffBaseUrl, token, input, { onTiming })), "script", undefined, result => {
      if (result.kind === "success") scriptsMemory.update(() => true, scripts => [result.script, ...scripts.filter(script => script.id !== result.script.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }),
    getScript,
    requestListen,
    getPronunciationConsent: () => request((token) => fetchMobilePronunciationConsent(bffBaseUrl, token, { onTiming })),
    getVoiceCloningConsent: () => request((token) => fetchMobileProcessingConsent(bffBaseUrl, token, "voice_cloning", { onTiming })),
    getAccountDeletionStatus: () => request((token) => fetchMobileAccountDeletionStatus(bffBaseUrl, token, { onTiming })),
    createAccountDeletionRequest: () => mutate(() => request((token) => createMobileAccountDeletionRequest(bffBaseUrl, token, { onTiming })), "account"),
    getVoiceDeletionStatus: () => request((token) => fetchMobileVoiceDeletionStatus(bffBaseUrl, token, { onTiming })),
    createVoiceDeletionRequest: () => mutate(() => request((token) => createMobileVoiceDeletionRequest(bffBaseUrl, token, { onTiming })), "voice"),
    advanceVoiceDeletion: () => mutate(() => request((token) => advanceMobileVoiceDeletion(bffBaseUrl, token, { onTiming })), "voice"),
    acceptPronunciationConsent: () => request((token) => acceptMobilePronunciationConsent(bffBaseUrl, token, { onTiming })),
    getVoiceSetup: () => request((token) => fetchMobileVoiceSetup(bffBaseUrl, token, { onTiming })),
    acceptVoiceConsent: () => request((token) => acceptMobileVoiceConsent(bffBaseUrl, token, { onTiming })),
    createVoiceFromSample: (sample, operationId) => request((token) => createMobileVoiceFromSample(bffBaseUrl, token, sample, { onTiming, operationId })),
    downloadAudio: (audioId) => request((token) => downloadMobileScriptAudio(bffBaseUrl, token, audioId, { onTiming })),
    downloadTakeAudio: (takeId) => afterMetadataWrites(() => request((token) => downloadMobileTakeAudio(bffBaseUrl, token, takeId, { onTiming }))),
    uploadRecording: (input) => request((token) => uploadMobileRecording(bffBaseUrl, token, input, { onTiming })),
    evaluateRecording: (input) => mutate(() => request((token) => evaluateMobileRecording(bffBaseUrl, token, input, { onTiming })), "evaluate", input.takeId, result => {
      if (result.kind !== "success") return;
      const script = scriptsMemory.peek("scripts")?.find(script => script.id === input.scriptId);
      const progressScript = progressMemory.memory.peek("progress")?.scripts.find(item => item.script.id === input.scriptId)?.script;
      reviewMemory.seed(`${input.scriptId}/${input.takeId}`, { review: result.review, scriptTitle: result.review.scriptSnapshot?.title ?? script?.title ?? progressScript?.title ?? "" });
    }),
    getReview,
    updateTakeMetadata,
    getProgress: () => afterMetadataWrites(() => request((token) => fetchMobileProgress(bffBaseUrl, token, { onTiming })))
  };
}
