export type HealthConnectionState =
  | { kind: "checking" }
  | { kind: "connected"; service: string }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "server-error"; status: number }
  | { kind: "invalid-response" }
  | { kind: "network-error" };

type HealthPayload = {
  ok: true;
  data: {
    status: "ok";
    service: string;
    timestamp: string;
  };
};

export type MobileApiTimingLabel =
  | "request"
  | "audio_download"
  | "upload"
  | "evaluate_total"
  | "voice_setup";

export type MobileApiTimingSample = {
  label: MobileApiTimingLabel;
  durationMs: number;
};

export type MobileApiTimingCallback = (sample: MobileApiTimingSample) => void;

export type MobileApiTimingCollector = {
  onTiming: MobileApiTimingCallback;
  snapshot(): MobileApiTimingSample[];
  clear(): void;
};

export type MobileApiRequestOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onTiming?: MobileApiTimingCallback;
};

export type MobileScript = {
  id: string;
  title: string;
  content: string;
  targetSeconds: number;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMobileScriptInput = {
  title: string;
  content: string;
  targetSeconds?: 60;
  locale?: "en-US";
};

export type MobileListenAudio = {
  audioId: string;
  cached: boolean;
};

export type MobileVoiceSetup = {
  status: "ready" | "consent_required" | "sample_required";
  created: boolean;
};

export type UploadMobileRecordingInput = {
  scriptId: string;
  recordingRef: string;
  file: Blob;
  durationSeconds?: number;
};

export type UploadedMobileRecording = {
  recordingRef: string;
  durationSeconds: number | null;
  contentType: string;
};

export type EvaluateMobileRecordingInput = {
  scriptId: string;
  takeId: string;
  recordingRef: string;
};

export type MobileWeakWord = {
  word: string;
  score: number;
  note: string;
};

export type MobileEvaluation = {
  score: number;
  accuracyScore: number;
  fluencyScore: number;
  rhythmScore: number;
  summaryJa: string;
  strengthsJa: string[];
  weakWords: MobileWeakWord[];
  scriptWordCount: number;
  transcriptWordCount: number;
};

export type MobileCoachFeedback = {
  titleJa: string;
  summaryJa: string;
  bulletPointsJa: string[];
  nextStepJa: string;
  focusWords: string[];
};

export type MobileReview = {
  takeId: string;
  scriptId: string;
  createdAt: string;
  reviewedAt: string | null;
  transcriptText: string;
  evaluation: MobileEvaluation;
  coach: MobileCoachFeedback;
};

export type MobileProgressTake = {
  id: string;
  scriptId: string;
  score: number;
  accuracyScore: number;
  fluencyScore: number;
  rhythmScore: number;
  reviewedAt: string | null;
  createdAt: string;
  transcriptText: string | null;
  weakWords: MobileWeakWord[];
  coach: MobileCoachFeedback;
  evaluation: MobileEvaluation;
};

export type MobileTakeDiff = {
  scoreDelta: number;
  accuracyDelta: number;
  fluencyDelta: number;
  rhythmDelta: number;
  improvedWeakWords: string[];
  regressedWeakWords: string[];
  commonWeakWords: string[];
  coachShift: {
    currentSummary: string;
    bestSummary: string;
  };
};

export type MobileScriptProgress = {
  script: {
    id: string;
    title: string;
    content: string;
    locale: string;
    targetSeconds: number;
    updatedAt: string;
  };
  takeCount: number;
  latestTake: MobileProgressTake | null;
  bestTake: MobileProgressTake | null;
  previousTake: MobileProgressTake | null;
  takeHistory: MobileProgressTake[];
  latestVsPrevious: MobileTakeDiff | null;
  latestVsBest: MobileTakeDiff | null;
  improvementTrend: "up" | "down" | "flat" | "insufficient_data";
};

export type MobileProgress = {
  scripts: MobileScriptProgress[];
  totalScripts: number;
  totalReviewedTakes: number;
  bestTakeCount: number;
};

export type MobileApiFailure =
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

export type ScriptsRequestState =
  | { kind: "success"; scripts: MobileScript[] }
  | { kind: "unauthorized"; reasonCode: string }
  | { kind: "forbidden"; reasonCode: string }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "server-error"; status: number }
  | { kind: "invalid-response" }
  | { kind: "timeout" }
  | { kind: "network-error" };

export type MobileScriptRequestState =
  | { kind: "success"; script: MobileScript }
  | MobileApiFailure;

export type MobileListenRequestState =
  | ({ kind: "success" } & MobileListenAudio)
  | MobileApiFailure;

export type MobileAudioDownloadState =
  | { kind: "success"; audio: Blob; contentType: string }
  | MobileApiFailure;

export type MobileRecordingUploadState =
  | { kind: "success"; recording: UploadedMobileRecording }
  | MobileApiFailure;

export type MobileReviewRequestState =
  | { kind: "success"; review: MobileReview }
  | MobileApiFailure;

export type MobileProgressRequestState =
  | { kind: "success"; progress: MobileProgress }
  | MobileApiFailure;

export type MobileVoiceSetupRequestState =
  | ({ kind: "success" } & MobileVoiceSetup)
  | MobileApiFailure;

export const MAX_MOBILE_AUDIO_BYTES = 15 * 1024 * 1024;

const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_LISTEN_TIMEOUT_MS = 120_000;
const DEFAULT_AUDIO_TIMEOUT_MS = 30_000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 45_000;
const DEFAULT_EVALUATE_TIMEOUT_MS = 120_000;
const DEFAULT_VOICE_SETUP_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 180_000;
const MAX_TIMING_SAMPLES = 100;

const MOBILE_API_PATHS = {
  health: "/api/mobile/health",
  scripts: "/api/mobile/scripts",
  script: (scriptId: string) => `/api/mobile/scripts/${encodeURIComponent(scriptId)}`,
  listen: (scriptId: string) =>
    `/api/mobile/scripts/${encodeURIComponent(scriptId)}/listen`,
  scriptAudio: (audioId: string) =>
    `/api/mobile/script-audio/${encodeURIComponent(audioId)}`,
  recordings: "/api/mobile/recordings",
  evaluate: "/api/mobile/evaluate",
  voiceSetup: "/api/mobile/voice-setup",
  review: (scriptId: string, takeId: string) =>
    `/api/mobile/scripts/${encodeURIComponent(scriptId)}/reviews/${encodeURIComponent(takeId)}`,
  progress: "/api/mobile/progress"
} as const;

type RequestAttempt<T> =
  | { kind: "response"; response: Response; body: T }
  | { kind: "timeout" }
  | { kind: "network-error" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isHealthPayload(value: unknown): value is HealthPayload {
  if (!isObject(value) || value.ok !== true || !isObject(value.data)) {
    return false;
  }

  return (
    value.data.status === "ok" &&
    isNonEmptyString(value.data.service) &&
    isTimestamp(value.data.timestamp)
  );
}

function isMobileScript(value: unknown): value is MobileScript {
  if (!isObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    typeof value.title === "string" &&
    typeof value.content === "string" &&
    isFiniteNumber(value.targetSeconds) &&
    typeof value.locale === "string" &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isMobileWeakWord(value: unknown): value is MobileWeakWord {
  return (
    isObject(value) &&
    typeof value.word === "string" &&
    isFiniteNumber(value.score) &&
    typeof value.note === "string"
  );
}

function isMobileEvaluation(value: unknown): value is MobileEvaluation {
  return (
    isObject(value) &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.accuracyScore) &&
    isFiniteNumber(value.fluencyScore) &&
    isFiniteNumber(value.rhythmScore) &&
    typeof value.summaryJa === "string" &&
    isStringArray(value.strengthsJa) &&
    Array.isArray(value.weakWords) &&
    value.weakWords.every(isMobileWeakWord) &&
    isNonNegativeInteger(value.scriptWordCount) &&
    isNonNegativeInteger(value.transcriptWordCount)
  );
}

function isMobileCoachFeedback(value: unknown): value is MobileCoachFeedback {
  return (
    isObject(value) &&
    typeof value.titleJa === "string" &&
    typeof value.summaryJa === "string" &&
    isStringArray(value.bulletPointsJa) &&
    typeof value.nextStepJa === "string" &&
    isStringArray(value.focusWords)
  );
}

function isMobileReview(value: unknown): value is MobileReview {
  return (
    isObject(value) &&
    isNonEmptyString(value.takeId) &&
    isNonEmptyString(value.scriptId) &&
    isTimestamp(value.createdAt) &&
    isNullableTimestamp(value.reviewedAt) &&
    typeof value.transcriptText === "string" &&
    isMobileEvaluation(value.evaluation) &&
    isMobileCoachFeedback(value.coach)
  );
}

function isMobileProgressTake(value: unknown): value is MobileProgressTake {
  return (
    isObject(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.scriptId) &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.accuracyScore) &&
    isFiniteNumber(value.fluencyScore) &&
    isFiniteNumber(value.rhythmScore) &&
    isNullableTimestamp(value.reviewedAt) &&
    isTimestamp(value.createdAt) &&
    (value.transcriptText === null || typeof value.transcriptText === "string") &&
    Array.isArray(value.weakWords) &&
    value.weakWords.every(isMobileWeakWord) &&
    isMobileCoachFeedback(value.coach) &&
    isMobileEvaluation(value.evaluation)
  );
}

function isMobileTakeDiff(value: unknown): value is MobileTakeDiff {
  return (
    isObject(value) &&
    isFiniteNumber(value.scoreDelta) &&
    isFiniteNumber(value.accuracyDelta) &&
    isFiniteNumber(value.fluencyDelta) &&
    isFiniteNumber(value.rhythmDelta) &&
    isStringArray(value.improvedWeakWords) &&
    isStringArray(value.regressedWeakWords) &&
    isStringArray(value.commonWeakWords) &&
    isObject(value.coachShift) &&
    typeof value.coachShift.currentSummary === "string" &&
    typeof value.coachShift.bestSummary === "string"
  );
}

function isNullableProgressTake(value: unknown): value is MobileProgressTake | null {
  return value === null || isMobileProgressTake(value);
}

function isNullableTakeDiff(value: unknown): value is MobileTakeDiff | null {
  return value === null || isMobileTakeDiff(value);
}

function isMobileScriptProgress(value: unknown): value is MobileScriptProgress {
  if (!isObject(value) || !isObject(value.script)) {
    return false;
  }

  const script = value.script;
  const takes = [value.latestTake, value.bestTake, value.previousTake];
  const takeHistory = value.takeHistory;
  const validScript =
    isNonEmptyString(script.id) &&
    typeof script.title === "string" &&
    typeof script.content === "string" &&
    typeof script.locale === "string" &&
    isFiniteNumber(script.targetSeconds) &&
    isTimestamp(script.updatedAt);
  const validTakes =
    takes.every(isNullableProgressTake) &&
    takes.every((take) => take === null || take.scriptId === script.id) &&
    Array.isArray(takeHistory) &&
    takeHistory.every(isMobileProgressTake) &&
    takeHistory.every((take) => take.scriptId === script.id);
  const historyCountMatches =
    Array.isArray(takeHistory) && value.takeCount === takeHistory.length;

  return (
    validScript &&
    isNonNegativeInteger(value.takeCount) &&
    historyCountMatches &&
    validTakes &&
    isNullableTakeDiff(value.latestVsPrevious) &&
    isNullableTakeDiff(value.latestVsBest) &&
    ["up", "down", "flat", "insufficient_data"].includes(
      value.improvementTrend as string
    )
  );
}

function isMobileProgress(value: unknown): value is MobileProgress {
  return (
    isObject(value) &&
    Array.isArray(value.scripts) &&
    value.scripts.every(isMobileScriptProgress) &&
    isNonNegativeInteger(value.totalScripts) &&
    isNonNegativeInteger(value.totalReviewedTakes) &&
    isNonNegativeInteger(value.bestTakeCount)
  );
}

function getSuccessData(value: unknown): Record<string, unknown> | null {
  return isObject(value) && value.ok === true && isObject(value.data)
    ? value.data
    : null;
}

function parseScriptsPayload(value: unknown) {
  const data = getSuccessData(value);
  return data && Array.isArray(data.scripts) && data.scripts.every(isMobileScript)
    ? data.scripts
    : null;
}

function parseScriptPayload(value: unknown) {
  const data = getSuccessData(value);
  return data && isMobileScript(data.script) ? data.script : null;
}

function parseListenPayload(value: unknown): MobileListenAudio | null {
  const data = getSuccessData(value);
  return data && isNonEmptyString(data.audioId) && typeof data.cached === "boolean"
    ? { audioId: data.audioId, cached: data.cached }
    : null;
}

function parseVoiceSetupPayload(value: unknown): MobileVoiceSetup | null {
  const data = getSuccessData(value);

  return data &&
    (data.status === "ready" || data.status === "consent_required" || data.status === "sample_required") &&
    typeof data.created === "boolean"
    ? { status: data.status, created: data.created }
    : null;
}

function parseRecordingPayload(value: unknown): UploadedMobileRecording | null {
  const data = getSuccessData(value);
  return data &&
    isUuid(data.recordingRef) &&
    (data.durationSeconds === null || isFiniteNumber(data.durationSeconds)) &&
    isAudioContentType(data.contentType)
    ? {
        recordingRef: data.recordingRef,
        durationSeconds: data.durationSeconds,
        contentType: normalizeContentType(data.contentType)
      }
    : null;
}

function parseReviewPayload(value: unknown): MobileReview | null {
  const data = getSuccessData(value);

  if (!data) {
    return null;
  }

  const review = isObject(data.review) ? data.review : data;
  return isMobileReview(review) ? review : null;
}

function parseProgressPayload(value: unknown): MobileProgress | null {
  const data = getSuccessData(value);

  if (!data) {
    return null;
  }

  const progress = isObject(data.progress) ? data.progress : data;
  return isMobileProgress(progress) ? progress : null;
}

function parseErrorReason(value: unknown) {
  if (!isObject(value) || !isObject(value.error)) {
    return "request_failed";
  }

  const reasonCode = value.error.reasonCode;
  return typeof reasonCode === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(reasonCode)
    ? reasonCode
    : "request_failed";
}

function parseRetryAfter(value: string | null) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 300 ? seconds : 30;
}

function normalizeContentType(value: unknown) {
  return typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
}

function isAudioContentType(value: unknown) {
  return normalizeContentType(value).startsWith("audio/");
}

function resolveTimeout(timeoutMs: number | undefined, fallbackMs: number) {
  if (!Number.isFinite(timeoutMs) || (timeoutMs as number) <= 0) {
    return fallbackMs;
  }

  return Math.min(Math.floor(timeoutMs as number), MAX_TIMEOUT_MS);
}

function apiUrl(bffBaseUrl: string, path: string) {
  return bffBaseUrl.replace(/\/+$/, "") + path;
}

function bearerHeaders(accessToken: string, json = false): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

function reportTiming(
  callback: MobileApiTimingCallback | undefined,
  label: MobileApiTimingLabel,
  startedAt: number
) {
  if (!callback) {
    return;
  }

  try {
    callback({
      label,
      durationMs: Math.max(0, Date.now() - startedAt)
    });
  } catch {
    // Timing observers must never alter the practice flow.
  }
}

async function executeBoundedRequest<T>(
  url: string,
  init: RequestInit,
  readBody: (response: Response) => Promise<T>,
  options: MobileApiRequestOptions,
  defaultTimeoutMs: number,
  operationTiming?: Exclude<MobileApiTimingLabel, "request">
): Promise<RequestAttempt<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeout(options.timeoutMs, defaultTimeoutMs)
  );

  try {
    const response = await fetchImpl(url, {
      ...init,
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal
    });
    const body = await readBody(response);
    return { kind: "response", response, body };
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return { kind: "timeout" };
    }

    return { kind: "network-error" };
  } finally {
    clearTimeout(timeout);
    reportTiming(options.onTiming, "request", startedAt);
    if (operationTiming) {
      reportTiming(options.onTiming, operationTiming, startedAt);
    }
  }
}

function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function requestJson(
  bffBaseUrl: string,
  path: string,
  accessToken: string,
  init: Omit<RequestInit, "credentials" | "cache" | "signal">,
  options: MobileApiRequestOptions,
  defaultTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  operationTiming?: Exclude<MobileApiTimingLabel, "request">
) {
  return executeBoundedRequest(
    apiUrl(bffBaseUrl, path),
    {
      ...init,
      headers: {
        ...bearerHeaders(accessToken, init.body !== undefined && !(init.body instanceof FormData)),
        ...(init.headers as Record<string, string> | undefined)
      }
    },
    readJson,
    options,
    defaultTimeoutMs,
    operationTiming
  );
}

function mapFailure(response: Response, payload: unknown): MobileApiFailure {
  const reasonCode = parseErrorReason(payload);

  if (response.status === 400 || response.status === 422) {
    return { kind: "invalid-request", reasonCode };
  }

  if (response.status === 401) {
    return { kind: "unauthorized", reasonCode };
  }

  if (response.status === 403) {
    return { kind: "forbidden", reasonCode };
  }

  if (response.status === 404) {
    return { kind: "not-found", reasonCode };
  }

  if (response.status === 409) {
    return { kind: "conflict", reasonCode };
  }

  if (response.status === 413) {
    return { kind: "payload-too-large", reasonCode };
  }

  if (response.status === 415) {
    return { kind: "unsupported-media-type", reasonCode };
  }

  if (response.status === 429) {
    return {
      kind: "rate-limited",
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after"))
    };
  }

  return { kind: "server-error", status: response.status };
}

function mapAttemptFailure(
  attempt: Extract<RequestAttempt<unknown>, { kind: "timeout" | "network-error" }>
): MobileApiFailure {
  return { kind: attempt.kind };
}

function mapScriptsFailure(response: Response, payload: unknown): ScriptsRequestState {
  const failure = mapFailure(response, payload);

  switch (failure.kind) {
    case "unauthorized":
    case "forbidden":
    case "rate-limited":
    case "server-error":
      return failure;
    default:
      return { kind: "server-error", status: response.status };
  }
}

function invalidInput(reasonCode: string): MobileApiFailure {
  return { kind: "invalid-request", reasonCode };
}

function recordingFilename(contentType: string) {
  const extensions: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg"
  };

  return `recording.${extensions[normalizeContentType(contentType)] ?? "bin"}`;
}

export function createMobileApiTimingCollector(): MobileApiTimingCollector {
  const samples: MobileApiTimingSample[] = [];

  return {
    onTiming(sample) {
      if (
        !["request", "audio_download", "upload", "evaluate_total"].includes(
          sample.label
        ) ||
        !isFiniteNumber(sample.durationMs) ||
        sample.durationMs < 0
      ) {
        return;
      }

      samples.push({ label: sample.label, durationMs: sample.durationMs });
      if (samples.length > MAX_TIMING_SAMPLES) {
        samples.splice(0, samples.length - MAX_TIMING_SAMPLES);
      }
    },
    snapshot() {
      return samples.map((sample) => ({ ...sample }));
    },
    clear() {
      samples.length = 0;
    }
  };
}

export function initialHealthState(isOnline: boolean): HealthConnectionState {
  return isOnline ? { kind: "checking" } : { kind: "offline" };
}

export async function fetchHealth(
  bffBaseUrl: string,
  options: MobileApiRequestOptions = {}
): Promise<HealthConnectionState> {
  const attempt = await executeBoundedRequest(
    apiUrl(bffBaseUrl, MOBILE_API_PATHS.health),
    {
      method: "GET",
      headers: { Accept: "application/json" }
    },
    readJson,
    options,
    DEFAULT_HEALTH_TIMEOUT_MS
  );

  if (attempt.kind !== "response") {
    return { kind: attempt.kind };
  }

  if (!attempt.response.ok) {
    return { kind: "server-error", status: attempt.response.status };
  }

  if (!isHealthPayload(attempt.body)) {
    return { kind: "invalid-response" };
  }

  return {
    kind: "connected",
    service: attempt.body.data.service
  };
}

export async function fetchMobileScripts(
  bffBaseUrl: string,
  accessToken: string,
  options: MobileApiRequestOptions = {}
): Promise<ScriptsRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.scripts,
    accessToken,
    { method: "GET" },
    options
  );

  if (attempt.kind !== "response") {
    return { kind: attempt.kind };
  }

  if (!attempt.response.ok) {
    return mapScriptsFailure(attempt.response, attempt.body);
  }

  const scripts = parseScriptsPayload(attempt.body);
  return scripts ? { kind: "success", scripts } : { kind: "invalid-response" };
}

export async function createMobileScript(
  bffBaseUrl: string,
  accessToken: string,
  input: CreateMobileScriptInput,
  options: MobileApiRequestOptions = {}
): Promise<MobileScriptRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.scripts,
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
    options
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const script = parseScriptPayload(attempt.body);
  return script ? { kind: "success", script } : { kind: "invalid-response" };
}

export async function fetchMobileScript(
  bffBaseUrl: string,
  accessToken: string,
  scriptId: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileScriptRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.script(scriptId),
    accessToken,
    { method: "GET" },
    options
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const script = parseScriptPayload(attempt.body);
  return script && script.id === scriptId
    ? { kind: "success", script }
    : { kind: "invalid-response" };
}

export async function requestMobileScriptListen(
  bffBaseUrl: string,
  accessToken: string,
  scriptId: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileListenRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.listen(scriptId),
    accessToken,
    { method: "POST" },
    options,
    DEFAULT_LISTEN_TIMEOUT_MS
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const listen = parseListenPayload(attempt.body);
  return listen ? { kind: "success", ...listen } : { kind: "invalid-response" };
}

export async function fetchMobileVoiceSetup(
  bffBaseUrl: string,
  accessToken: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileVoiceSetupRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.voiceSetup,
    accessToken,
    { method: "GET" },
    options,
    DEFAULT_REQUEST_TIMEOUT_MS,
    "voice_setup"
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const setup = parseVoiceSetupPayload(attempt.body);
  return setup ? { kind: "success", ...setup } : { kind: "invalid-response" };
}

export async function acceptMobileVoiceConsent(
  bffBaseUrl: string,
  accessToken: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileVoiceSetupRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.voiceSetup,
    accessToken,
    { method: "POST", body: JSON.stringify({ accepted: true }) },
    options,
    DEFAULT_REQUEST_TIMEOUT_MS,
    "voice_setup"
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const setup = parseVoiceSetupPayload(attempt.body);
  return setup ? { kind: "success", ...setup } : { kind: "invalid-response" };
}

export async function createMobileVoiceFromSample(
  bffBaseUrl: string,
  accessToken: string,
  sample: File,
  options: MobileApiRequestOptions = {}
): Promise<MobileVoiceSetupRequestState> {
  if (!isAudioContentType(sample.type) || sample.size === 0 || sample.size > 10 * 1024 * 1024) {
    return invalidInput("voice_sample_invalid");
  }

  const formData = new FormData();
  formData.append("file", sample, sample.name || "voice-sample.audio");
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.voiceSetup,
    accessToken,
    { method: "POST", body: formData },
    options,
    DEFAULT_VOICE_SETUP_TIMEOUT_MS,
    "voice_setup"
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const setup = parseVoiceSetupPayload(attempt.body);
  return setup ? { kind: "success", ...setup } : { kind: "invalid-response" };
}

type AudioResponseBody =
  | { kind: "error"; payload: unknown }
  | { kind: "invalid-response" }
  | { kind: "payload-too-large" }
  | { kind: "audio"; audio: Blob; contentType: string };

async function readAudioResponse(response: Response): Promise<AudioResponseBody> {
  if (!response.ok) {
    return { kind: "error", payload: await readJson(response) };
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (!isAudioContentType(contentType)) {
    return { kind: "invalid-response" };
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return { kind: "invalid-response" };
    }

    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes)) {
      return { kind: "invalid-response" };
    }

    if (declaredBytes > MAX_MOBILE_AUDIO_BYTES) {
      return { kind: "payload-too-large" };
    }
  }

  const audio = await response.blob();
  if (audio.size === 0 || !isAudioContentType(audio.type)) {
    return { kind: "invalid-response" };
  }

  if (audio.size > MAX_MOBILE_AUDIO_BYTES) {
    return { kind: "payload-too-large" };
  }

  return { kind: "audio", audio, contentType };
}

export async function downloadMobileScriptAudio(
  bffBaseUrl: string,
  accessToken: string,
  audioId: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileAudioDownloadState> {
  const attempt = await executeBoundedRequest(
    apiUrl(bffBaseUrl, MOBILE_API_PATHS.scriptAudio(audioId)),
    {
      method: "GET",
      headers: {
        Accept: "audio/*",
        Authorization: `Bearer ${accessToken}`
      }
    },
    readAudioResponse,
    options,
    DEFAULT_AUDIO_TIMEOUT_MS,
    "audio_download"
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    const payload = attempt.body.kind === "error" ? attempt.body.payload : null;
    return mapFailure(attempt.response, payload);
  }

  if (attempt.body.kind === "payload-too-large") {
    return { kind: "payload-too-large", reasonCode: "audio_too_large" };
  }

  if (attempt.body.kind !== "audio") {
    return { kind: "invalid-response" };
  }

  return {
    kind: "success",
    audio: attempt.body.audio,
    contentType: attempt.body.contentType
  };
}

export async function uploadMobileRecording(
  bffBaseUrl: string,
  accessToken: string,
  input: UploadMobileRecordingInput,
  options: MobileApiRequestOptions = {}
): Promise<MobileRecordingUploadState> {
  if (
    !isNonEmptyString(input.scriptId) ||
    !isUuid(input.recordingRef) ||
    input.file.size === 0
  ) {
    return invalidInput("recording_invalid");
  }

  if (input.file.size > MAX_MOBILE_AUDIO_BYTES) {
    return { kind: "payload-too-large", reasonCode: "recording_too_large" };
  }

  if (!isAudioContentType(input.file.type)) {
    return { kind: "unsupported-media-type", reasonCode: "recording_type_unsupported" };
  }

  if (
    input.durationSeconds !== undefined &&
    (!isFiniteNumber(input.durationSeconds) ||
      input.durationSeconds <= 0 ||
      input.durationSeconds > 120)
  ) {
    return invalidInput("recording_duration_invalid");
  }

  const formData = new FormData();
  formData.append("scriptId", input.scriptId);
  formData.append("recordingRef", input.recordingRef);
  if (input.durationSeconds !== undefined) {
    formData.append("durationSeconds", String(input.durationSeconds));
  }
  formData.append("file", input.file, recordingFilename(input.file.type));

  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.recordings,
    accessToken,
    { method: "POST", body: formData },
    options,
    DEFAULT_UPLOAD_TIMEOUT_MS,
    "upload"
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const recording = parseRecordingPayload(attempt.body);
  return recording
    ? { kind: "success", recording }
    : { kind: "invalid-response" };
}

export async function evaluateMobileRecording(
  bffBaseUrl: string,
  accessToken: string,
  input: EvaluateMobileRecordingInput,
  options: MobileApiRequestOptions = {}
): Promise<MobileReviewRequestState> {
  if (
    !isNonEmptyString(input.scriptId) ||
    !isNonEmptyString(input.takeId) ||
    !isUuid(input.recordingRef)
  ) {
    return invalidInput("evaluation_input_invalid");
  }

  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.evaluate,
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
    options,
    DEFAULT_EVALUATE_TIMEOUT_MS,
    "evaluate_total"
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const review = parseReviewPayload(attempt.body);
  return review &&
    review.takeId === input.takeId &&
    review.scriptId === input.scriptId
    ? { kind: "success", review }
    : { kind: "invalid-response" };
}

export async function fetchMobileReview(
  bffBaseUrl: string,
  accessToken: string,
  scriptId: string,
  takeId: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileReviewRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.review(scriptId, takeId),
    accessToken,
    { method: "GET" },
    options
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const review = parseReviewPayload(attempt.body);
  return review && review.takeId === takeId && review.scriptId === scriptId
    ? { kind: "success", review }
    : { kind: "invalid-response" };
}

export async function fetchMobileProgress(
  bffBaseUrl: string,
  accessToken: string,
  options: MobileApiRequestOptions = {}
): Promise<MobileProgressRequestState> {
  const attempt = await requestJson(
    bffBaseUrl,
    MOBILE_API_PATHS.progress,
    accessToken,
    { method: "GET" },
    options
  );

  if (attempt.kind !== "response") {
    return mapAttemptFailure(attempt);
  }

  if (!attempt.response.ok) {
    return mapFailure(attempt.response, attempt.body);
  }

  const progress = parseProgressPayload(attempt.body);
  return progress
    ? { kind: "success", progress }
    : { kind: "invalid-response" };
}
