"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeBrowserAudioFileToPcmWav } from "@/lib/browser-pcm-wav";
import { getGuidancePrimaryButtonLabel, getGuidanceToneClasses } from "@/lib/guidance-ui";
import { getRecordRecoveryGuidance } from "@/lib/record-recovery-guidance";
import { getShortRecordingPrompt } from "@/lib/recording";
import { MAX_RECORDING_BYTES, RECORDING_FORMAT_LABEL, RECORDING_MIME_TYPES } from "@/services/storage/constants";

type UploadResponse = {
  ok: boolean;
  message?: string;
  data?: {
    audioPath: string;
    audioStorageKey: string;
    durationSeconds: number | null;
  };
};

type EvaluateResponse = {
  ok: boolean;
  message?: string;
  data?: {
    takeId: string;
  };
};

type UploadedRecordingReference = NonNullable<UploadResponse["data"]>;
type MessagePhase = "record" | "upload" | "evaluate" | null;
type MessageKind = "info" | "error";

type RecordAndEvaluatePanelProps = {
  scriptId: string;
  targetSeconds: number;
  listenHref?: string;
  transcriptionProvider: string;
  transcriptionSupported: boolean;
  transcriptionMessage: string | null;
  pronunciationProvider: string;
  pronunciationSupported: boolean;
  pronunciationMessage: string | null;
  pronunciationDiagnostics: Array<{
    key: string;
    label: string;
    ok: boolean;
    message: string;
  }>;
  practiceContext: {
    takeCount: number;
    improvementTrend: "up" | "down" | "flat" | "insufficient_data";
    latestTake: {
      weakWords: string[];
      coachNextStepJa: string;
      coachFocusWords: string[];
    } | null;
    latestVsBest: {
      regressedWeakWords: string[];
      commonWeakWords: string[];
    } | null;
  } | null;
};

type RecordDecisionAction = {
  id: string;
  label: string;
  tone: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
};

function getRecordDecisionButtonClasses(tone: RecordDecisionAction["tone"]) {
  if (tone === "primary") {
    return "inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]";
  }

  return "inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50";
}

function measureAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement("audio");

    const finalize = (duration: number | null) => {
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.max(1, Math.round(audio.duration)) : null;
      finalize(duration);
    };
    audio.onerror = () => finalize(null);
    audio.src = objectUrl;
  });
}

function getRecordingExtension(filename: string) {
  if (!filename.includes(".")) {
    return "";
  }

  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function inferClientRecordingContentType(file: File) {
  if (file.type) {
    return file.type === "video/webm" ? "audio/webm" : file.type;
  }

  const extension = getRecordingExtension(file.name);

  if (extension === "webm") {
    return "audio/webm";
  }

  if (extension === "wav") {
    return "audio/wav";
  }

  if (extension === "mp3") {
    return "audio/mpeg";
  }

  if (extension === "ogg") {
    return "audio/ogg";
  }

  if (extension === "m4a") {
    return "audio/mp4";
  }

  return "";
}

function getRecordingValidationMessage(file: File) {
  if (!file.size) {
    return "録音ファイルが空です。録音を確認してください。";
  }

  if (file.size > MAX_RECORDING_BYTES) {
    return "録音ファイルが大きすぎます。1分以内の音声で再試行してください。";
  }

  const contentType = inferClientRecordingContentType(file);

  if (!contentType || !RECORDING_MIME_TYPES.has(contentType)) {
    return `対応していない録音形式です。${RECORDING_FORMAT_LABEL} を使用してください。`;
  }

  return null;
}

function isAzurePronunciationProvider(provider: string) {
  return provider.trim().toLowerCase() === "azure";
}

function isLikelyWaveRecording(file: File) {
  const contentType = inferClientRecordingContentType(file).toLowerCase();
  return contentType === "audio/wav" || contentType === "audio/wave" || contentType === "audio/x-wav";
}

export function RecordAndEvaluatePanel({
  scriptId,
  targetSeconds,
  listenHref,
  transcriptionProvider,
  transcriptionSupported,
  pronunciationProvider,
  pronunciationSupported,
  pronunciationMessage,
}: RecordAndEvaluatePanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const fileSelectionTokenRef = useRef(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [uploadedRecording, setUploadedRecording] = useState<UploadedRecordingReference | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isMeasuringDuration, setIsMeasuringDuration] = useState(false);
  const [isPreparingUploadFile, setIsPreparingUploadFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messagePhase, setMessagePhase] = useState<MessagePhase>(null);
  const [messageStatus, setMessageStatus] = useState<number | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("info");

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function clearMessage() {
    setMessage(null);
    setMessagePhase(null);
    setMessageStatus(null);
    setMessageKind("info");
  }

  function setInfoMessage(nextMessage: string, phase: MessagePhase = null) {
    setMessage(nextMessage);
    setMessagePhase(phase);
    setMessageStatus(null);
    setMessageKind("info");
  }

  function setErrorMessage(nextMessage: string, phase: Exclude<MessagePhase, null>, status: number | null = null) {
    setMessage(nextMessage);
    setMessagePhase(phase);
    setMessageStatus(status);
    setMessageKind("error");
  }

  function applySelectedFile(file: File, measuredDuration?: number | null) {
    fileSelectionTokenRef.current += 1;
    setSelectedFile(file);
    setDurationSeconds(measuredDuration ?? null);
    setUploadedRecording(null);
    setIsMeasuringDuration(false);
    clearMessage();
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return URL.createObjectURL(file);
    });

    return fileSelectionTokenRef.current;
  }

  async function handleFileSelection(file: File) {
    const validationMessage = getRecordingValidationMessage(file);

    if (validationMessage) {
      setErrorMessage(validationMessage, "record", 400);
      return;
    }

    const selectionToken = applySelectedFile(file);
    setIsMeasuringDuration(true);
    const measuredDuration = await measureAudioDuration(file);

    if (fileSelectionTokenRef.current !== selectionToken) {
      return;
    }

    setIsMeasuringDuration(false);

    if (measuredDuration !== null) {
      setDurationSeconds(measuredDuration);
    }
  }

  async function handleStartRecording() {
    clearMessage();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMessage("このブラウザでは録音に対応していません。下のファイル選択を使ってください。", "record");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined
      });

      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `recording-${scriptId}.webm`, { type });
        const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
        const measuredSeconds = elapsedMs > 0 ? Math.max(1, Math.round(elapsedMs / 1000)) : null;

        applySelectedFile(file, measuredSeconds);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        chunksRef.current = [];
        startedAtRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setErrorMessage("マイクの取得に失敗しました。権限を確認するか、音声ファイルを使ってください。", "record");
    }
  }

  function handleStopRecording() {
    if (!recorderRef.current) {
      return;
    }

    recorderRef.current.stop();
    setIsRecording(false);
  }

  function handleClearSelectedRecording() {
    setSelectedFile(null);
    setDurationSeconds(null);
    setUploadedRecording(null);
    setIsMeasuringDuration(false);
    clearMessage();
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
  }

  async function handleSubmit() {
    if (isMeasuringDuration) {
      setInfoMessage("音声の長さを確認中です。自動判定が終わるまで少し待つか、必要なら秒数欄を確認してから再試行してください。");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("先にマイクで録音してください。録音済みファイルを使う場合はファイル用メニューを開きます。", "record", 400);
      return;
    }

    if (!pronunciationSupported) {
      setErrorMessage(pronunciationMessage ?? "評価の準備を確認してください。", "evaluate", 503);
      return;
    }

    if (needsDevFallback && transcriptionSupported && transcriptText.trim().length === 0) {
      setErrorMessage("開発用の入力が必要です。詳細を開いて入力してから再試行してください。", "evaluate", 400);
      return;
    }

    setIsPreparingUploadFile(azureNeedsNormalization);
    setIsUploading(!azureNeedsNormalization);
    setIsEvaluating(false);
    clearMessage();

    let activePhase: "upload" | "evaluate" = uploadedRecording ? "evaluate" : "upload";

    try {
      let recordingReference = uploadedRecording;
      let fileToUpload = selectedFile;

      if (!recordingReference) {
        if (azureNeedsNormalization) {
          setInfoMessage("評価前に録音を整えています。", "upload");
          fileToUpload = await normalizeBrowserAudioFileToPcmWav(selectedFile);
        }

        setIsPreparingUploadFile(false);
        setIsUploading(true);

        const uploadFormData = new FormData();
        uploadFormData.append("scriptId", scriptId);
        uploadFormData.append("file", fileToUpload);

        if (durationSeconds) {
          uploadFormData.append("durationSeconds", String(durationSeconds));
        }

        const uploadResponse = await fetch("/api/uploads/recording", {
          method: "POST",
          body: uploadFormData
        });

        const uploaded = (await uploadResponse.json()) as UploadResponse;

        if (!uploadResponse.ok || !uploaded.ok || !uploaded.data) {
          setErrorMessage(uploaded.message ?? "録音ファイルの保存に失敗しました。", "upload", uploadResponse.status);
          return;
        }

        recordingReference = uploaded.data;
        setUploadedRecording(uploaded.data);
      }

      activePhase = "evaluate";
      setIsUploading(false);
      setIsEvaluating(true);

      const evaluateResponse = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scriptId,
          audioPath: recordingReference.audioPath,
          audioStorageKey: recordingReference.audioStorageKey,
          durationSeconds: durationSeconds ?? recordingReference.durationSeconds ?? undefined,
          transcriptText: transcriptText.trim() || undefined
        })
      });

      const evaluated = (await evaluateResponse.json()) as EvaluateResponse;

      if (!evaluateResponse.ok || !evaluated.ok || !evaluated.data?.takeId) {
        setErrorMessage(evaluated.message ?? "評価に失敗しました。", "evaluate", evaluateResponse.status);
        return;
      }

      router.push(`/scripts/${scriptId}/review/${evaluated.data.takeId}`);
      router.refresh();
    } catch (error) {
      if (error instanceof Error && error.message) {
        setErrorMessage(error.message, activePhase);
      } else {
        setErrorMessage("通信に失敗しました。少し待ってからもう一度お試しください。", activePhase);
      }
    } finally {
      setIsPreparingUploadFile(false);
      setIsUploading(false);
      setIsEvaluating(false);
    }
  }

  const isBusy = isPreparingUploadFile || isUploading || isEvaluating;
  const canSaveEvaluation = transcriptionSupported && pronunciationSupported;
  const needsDevFallback = transcriptionProvider === "mock";
  const isMissingRequiredFallback = needsDevFallback && transcriptionSupported && transcriptText.trim().length === 0;
  const shortRecordingPrompt = isMeasuringDuration ? null : getShortRecordingPrompt(durationSeconds, targetSeconds);
  const azureRequiresWavUpload = isAzurePronunciationProvider(pronunciationProvider);
  const azureNeedsNormalization = Boolean(selectedFile && azureRequiresWavUpload && !isLikelyWaveRecording(selectedFile));
  const recoveryGuidance =
    message && messageKind === "error" && messagePhase
        ? getRecordRecoveryGuidance({
          phase: messagePhase,
          message,
          status: messageStatus,
          transcriptionProvider,
          pronunciationProvider,
          hasUploadedRecording: Boolean(uploadedRecording),
          shortRecordingPrompt
        })
      : null;
  const submitLabel = isPreparingUploadFile
    ? "wav/PCM へ変換中..."
    : isUploading
    ? "録音を保存中..."
    : isEvaluating
      ? "評価中..."
      : uploadedRecording && messagePhase === "evaluate" && messageKind === "error"
        ? "保存済み録音で評価を再試行する"
      : uploadedRecording
        ? "保存済み録音で評価を続ける"
      : "評価して保存する";
  const canShowPrepareActions = !selectedFile && canSaveEvaluation;
  const showNextAction = Boolean(selectedFile || recoveryGuidance || canShowPrepareActions || !canSaveEvaluation);
  const nextActionActions: RecordDecisionAction[] = recoveryGuidance
    ? [
        {
          id: "primary-submit",
          label: messagePhase === "evaluate" && messageKind === "error" && uploadedRecording
            ? getGuidancePrimaryButtonLabel("retry_saved_evaluate")
            : submitLabel,
          tone: "primary",
          disabled: isBusy || isMeasuringDuration || !selectedFile || !canSaveEvaluation || isMissingRequiredFallback,
          onClick: () => {
            void handleSubmit();
          }
        },
        {
          id: "clear-recording",
          label: uploadedRecording ? "録音を差し替える" : "録音を準備し直す",
          tone: "secondary",
          disabled: isBusy || !selectedFile,
          onClick: handleClearSelectedRecording
        },
        ...(listenHref
          ? [
              {
                id: "return-listen",
                label: "見本を聞き直す",
                tone: "secondary" as const,
                disabled: isBusy,
                onClick: () => {
                  router.push(listenHref);
                }
              }
            ]
          : [])
      ]
    : selectedFile
        ? [
            {
              id: "primary-submit",
              label: submitLabel,
            tone: "primary",
            disabled: isBusy || isMeasuringDuration || !selectedFile || !canSaveEvaluation || isMissingRequiredFallback,
            onClick: () => {
              void handleSubmit();
            }
          },
        {
          id: "clear-recording",
          label: uploadedRecording ? "録音を差し替える" : "録音を作り直す",
          tone: "secondary",
          disabled: isBusy,
          onClick: handleClearSelectedRecording
        },
        ...(listenHref
          ? [
              {
                id: "return-listen",
                label: "見本を聞き直す",
                tone: "secondary" as const,
                disabled: isBusy,
                onClick: () => {
                  router.push(listenHref);
                }
              }
            ]
          : [])
      ]
      : canShowPrepareActions
        ? [
            {
              id: "start-recording",
              label: "マイクで録音する",
              tone: "primary",
              disabled: isBusy,
              onClick: () => {
                void handleStartRecording();
              }
            },
            ...(listenHref
              ? [
                  {
                    id: "return-listen",
                    label: "先に見本を聞く",
                    tone: "secondary" as const,
                    disabled: isBusy,
                    onClick: () => {
                      router.push(listenHref);
                    }
                  }
                ]
              : [])
          ]
      : !pronunciationSupported
        ? [
            ...(listenHref
              ? [
                  {
                    id: "return-listen",
                    label: "聞く画面に戻る",
                    tone: "primary" as const,
                    onClick: () => {
                      router.push(listenHref);
                    }
                  }
                ]
              : []),
            {
              id: "return-scripts",
              label: "scripts に戻る",
              tone: "secondary",
              onClick: () => {
                router.push("/scripts");
              }
            }
          ]
      : !transcriptionSupported
        ? [
            ...(listenHref
              ? [
                  {
                    id: "return-listen",
                    label: "聞く画面に戻る",
                    tone: "primary" as const,
                    onClick: () => {
                      router.push(listenHref);
                    }
                  }
                ]
              : [])
          ]
      : [];

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isBusy}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRecording ? "録音を止める" : "マイクで録音する"}
          </button>

          {selectedFile ? (
            <button
              type="button"
              onClick={handleClearSelectedRecording}
              disabled={isBusy}
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              録音を消す
            </button>
          ) : null}
        </div>

        <details className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">音声ファイルを使う</summary>
          <p className="mt-3 text-sm leading-6 text-ink-600">手元に録音済みの音声がある場合だけ使います。</p>
          <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
            ファイルを選択
            <input
              ref={fileInputRef}
              data-testid="record-file-input"
              type="file"
              accept=".webm,.wav,.m4a,.mp3,.ogg,audio/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.currentTarget.value = "";
                if (file) {
                  void handleFileSelection(file);
                }
              }}
            />
          </label>
        </details>

        {selectedFile ? (
          <div data-testid="record-selected-file" className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs font-semibold text-ink-500">録音状態</p>
            <p className="text-sm font-semibold text-ink-900">{selectedFile.name}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-500">
              {selectedFile.type || "音声ファイル"} / {Math.round(selectedFile.size / 1024)}KB / {durationSeconds ?? "未計測"}秒
            </p>
          {isMeasuringDuration ? (
              <p className="mt-2 text-sm text-ink-600">音声の長さを確認しています。判定が終わるまで評価保存は待機します。</p>
            ) : durationSeconds === null ? (
              <p className="mt-2 text-sm text-amber-700">音声の長さを自動判定できない場合だけ、下の秒数欄に手入力してください。</p>
            ) : null}
            {previewUrl ? (
              <audio controls preload="none" className="mt-4 w-full">
                <source src={previewUrl} type={selectedFile.type || "audio/webm"} />
              </audio>
            ) : null}
            {uploadedRecording && !isBusy ? (
              <p data-testid="record-upload-reuse-hint" className="mt-3 text-sm text-ink-600">
                この録音で評価をもう一度試せます。
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4 text-sm leading-6 text-ink-700">まだ録音はありません。</p>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">録音秒数</span>
          <input
            value={durationSeconds ?? ""}
            onChange={(event) => setDurationSeconds(event.target.value ? Number(event.target.value) : null)}
            type="number"
            min={1}
            max={600}
            placeholder="自動計測できない場合に入力"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        {shortRecordingPrompt ? (
          <p data-testid="record-short-warning" className="text-sm text-amber-700">
            {shortRecordingPrompt}
          </p>
        ) : null}

        {recoveryGuidance ? (
          <section
            data-testid="record-recovery-guidance"
            className={`rounded-2xl border p-4 ${getGuidanceToneClasses(recoveryGuidance.tone)}`}
          >
            <p className="text-xs font-semibold text-ink-500">うまくいかない時</p>
            <h3 className="mt-2 text-lg font-semibold text-ink-900">{recoveryGuidance.titleJa}</h3>
            <p className="mt-3 text-sm leading-6 text-ink-800">{recoveryGuidance.summaryJa}</p>
          </section>
        ) : null}

        {showNextAction ? (
          <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <p className="inline-flex rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
              ベータでは 評価は10回まで
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {nextActionActions.map((action) => (
                <button
                  key={action.id}
                  data-testid={action.id === "primary-submit" ? "record-submit-button" : undefined}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`${getRecordDecisionButtonClasses(action.tone)} ${action.disabled ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {canSaveEvaluation ? (
          <details className="rounded-2xl border border-dashed border-[var(--line)] bg-ink-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">詳細</summary>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              通常は空欄で大丈夫です。開発用の評価設定で必要なときだけ使います。
            </p>
            <textarea
              data-testid="record-transcript-fallback"
              value={transcriptText}
              onChange={(event) => setTranscriptText(event.target.value)}
              placeholder={needsDevFallback ? "開発用の評価設定では入力が必要です。" : "通常は空欄のままで大丈夫です。"}
              rows={5}
              className="mt-3 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
            {transcriptText.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setTranscriptText("")}
                disabled={isBusy}
                className="mt-3 inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                入力を消す
              </button>
            ) : null}
            {isMissingRequiredFallback ? (
              <p data-testid="record-transcript-fallback-warning" className="mt-3 text-sm text-amber-700">
                開発用の評価設定では、この入力が必要です。
              </p>
            ) : null}
          </details>
        ) : (
          <details className="rounded-2xl border border-dashed border-[var(--line)] bg-ink-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">詳細</summary>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              いまは保存済み結果を作る前提が足りないため、この入力では先に進めません。
            </p>
          </details>
        )}

        {!showNextAction ? (
          <div className="flex flex-col items-start gap-2">
            <button
              data-testid="record-submit-button"
              type="button"
              onClick={handleSubmit}
              disabled={isBusy || isMeasuringDuration || !selectedFile || !canSaveEvaluation || isMissingRequiredFallback}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {messagePhase === "evaluate" && messageKind === "error" && uploadedRecording
                ? getGuidancePrimaryButtonLabel("retry_saved_evaluate")
                : submitLabel}
            </button>
            <p className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
              ベータでは 評価は10回まで
            </p>
          </div>
        ) : null}

        {message ? (
          <button
            type="button"
            onClick={clearMessage}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
          >
            メッセージを閉じる
          </button>
        ) : null}

        {message ? <p className={`text-sm ${messageKind === "error" ? "text-amber-800" : "text-ink-600"}`}>{message}</p> : null}
      </div>
    </div>
  );
}
