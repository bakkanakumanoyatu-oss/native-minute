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

const EVALUATE_WAIT_STAGES = [
  {
    label: "Take を送っています",
    helper: "録音を保存して、評価の準備をしています。",
    afterMs: 0
  },
  {
    label: "声を文字にしています",
    helper: "聞こえた言葉を確認しています。",
    afterMs: 2800
  },
  {
    label: "発音の目安を見ています",
    helper: "お手本との近さを見ています。",
    afterMs: 6500
  },
  {
    label: "次の1点をまとめています",
    helper: "Focus words と Take メモを作っています。",
    afterMs: 10500
  },
  {
    label: "Take メモを保存しています",
    helper: "Review に移動する準備をしています。",
    afterMs: 15000
  }
] as const;

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
    return "inline-flex items-center justify-center rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(242,109,91,0.22)] transition hover:bg-[var(--record-accent-strong)]";
  }

  return "inline-flex items-center justify-center rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)] transition hover:bg-white/15";
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
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [isMeasuringDuration, setIsMeasuringDuration] = useState(false);
  const [isPreparingUploadFile, setIsPreparingUploadFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messagePhase, setMessagePhase] = useState<MessagePhase>(null);
  const [messageStatus, setMessageStatus] = useState<number | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>("info");
  const [evaluateWaitStageIndex, setEvaluateWaitStageIndex] = useState(0);

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
    setIsStartingRecording(true);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setIsStartingRecording(false);
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
    } finally {
      setIsStartingRecording(false);
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
      setErrorMessage("先にマイクで Take を録ってください。録音済みファイルを使う場合はファイル用メニューを開きます。", "record", 400);
      return;
    }

    if (!pronunciationSupported) {
      setErrorMessage(pronunciationMessage ?? "評価の準備を確認してください。", "evaluate", 503);
      return;
    }

    if (needsDevFallback && transcriptionSupported && transcriptText.trim().length === 0) {
      setErrorMessage("ローカル確認用の入力が必要です。開発用入力を入れてから再試行してください。", "evaluate", 400);
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
  const isRecordButtonBusy = isBusy || isStartingRecording;
  const canSaveEvaluation = transcriptionSupported && pronunciationSupported;
  const needsDevFallback = transcriptionProvider === "mock";
  const isMissingRequiredFallback = needsDevFallback && transcriptionSupported && transcriptText.trim().length === 0;
  const shortRecordingPrompt = isMeasuringDuration ? null : getShortRecordingPrompt(durationSeconds, targetSeconds);
  const azureRequiresWavUpload = isAzurePronunciationProvider(pronunciationProvider);
  const azureNeedsNormalization = Boolean(selectedFile && azureRequiresWavUpload && !isLikelyWaveRecording(selectedFile));
  const evaluateWaitStage = EVALUATE_WAIT_STAGES[Math.min(evaluateWaitStageIndex, EVALUATE_WAIT_STAGES.length - 1)];

  useEffect(() => {
    if (!isBusy) {
      setEvaluateWaitStageIndex(0);
      return;
    }

    setEvaluateWaitStageIndex(0);

    const timers = EVALUATE_WAIT_STAGES.slice(1).map((stage, index) =>
      window.setTimeout(() => {
        setEvaluateWaitStageIndex(index + 1);
      }, stage.afterMs)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [isBusy]);

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
    ? "Take を保存中..."
    : isEvaluating
      ? "評価中..."
      : uploadedRecording && messagePhase === "evaluate" && messageKind === "error"
        ? "保存済み Take で評価を再試行する"
      : uploadedRecording
        ? "保存済み Take で評価を続ける"
      : "この Take で評価する";
  const canShowPrepareActions = !selectedFile && canSaveEvaluation;
  const showNextAction = Boolean(selectedFile || recoveryGuidance || !canSaveEvaluation);
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
          label: uploadedRecording ? "Take を差し替える" : "Take を録り直す",
          tone: "secondary",
          disabled: isBusy || !selectedFile,
          onClick: handleClearSelectedRecording
        },
        ...(listenHref
          ? [
              {
                id: "return-listen",
                label: "もう一度まねる",
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
          label: uploadedRecording ? "Take を差し替える" : "Take を録り直す",
          tone: "secondary",
          disabled: isBusy,
          onClick: handleClearSelectedRecording
        },
        ...(listenHref
          ? [
              {
                id: "return-listen",
                label: "もう一度まねる",
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
              label: isRecording ? "録音を止める" : isStartingRecording ? "マイクを準備中..." : "マイクで Take を録る",
              tone: "primary",
              disabled: isRecordButtonBusy,
              onClick: () => {
                if (isRecording) {
                  handleStopRecording();
                  return;
                }

                void handleStartRecording();
              }
            },
            ...(listenHref
              ? [
                  {
                    id: "return-listen",
                    label: "先にお手本をまねる",
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
                    label: "お手本へ戻る",
                    tone: "primary" as const,
                    onClick: () => {
                      router.push(listenHref);
                    }
                  }
                ]
              : []),
            {
              id: "return-scripts",
              label: "1分ストックに戻る",
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
                    label: "お手本へ戻る",
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
      <div className="space-y-5 rounded-3xl border border-[var(--line-inset)] bg-[var(--surface-primary)] p-5 shadow-[var(--shadow-studio-soft)]">
        <div className="rounded-[1.75rem] border border-[var(--line-dark)] bg-[linear-gradient(135deg,var(--control-panel),var(--control-panel-soft))] p-4 text-[var(--cta-primary-text)] shadow-[0_20px_46px_rgba(24,23,34,0.18)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(255,241,221,0.62)]">録音パネル</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--cta-primary-text)]">今日の Take を録る</h2>
          <p className="mt-2 text-sm leading-6 text-[rgba(255,241,221,0.76)]">マイクで1本録って、納得したら評価へ進みます。</p>
          <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isRecordButtonBusy}
            aria-busy={isStartingRecording}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(242,109,91,0.24)] transition hover:bg-[var(--record-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRecording ? "録音を止める" : isStartingRecording ? "マイクを準備中..." : "マイクで Take を録る"}
          </button>

          {selectedFile ? (
            <button
              type="button"
              onClick={handleClearSelectedRecording}
              disabled={isBusy}
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)] transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Take を消す
            </button>
          ) : null}
          </div>
        </div>

        <details className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">録音済みファイルを使う</summary>
          <p className="mt-3 text-sm leading-6 text-ink-600">手元に録音済みの音声がある場合だけ使います。</p>
          <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-sm font-semibold text-ink-800">
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
          <div data-testid="record-selected-file" className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-4 shadow-[0_14px_34px_rgba(45,38,31,0.08)]">
            <p className="text-xs font-semibold text-[var(--accent-strong)]">今回の Take</p>
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
              <div className="mt-4 rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] p-4">
                <p className="text-sm font-semibold text-ink-900">この Take を聞く</p>
                <audio
                  key={previewUrl}
                  controls
                  preload="metadata"
                  src={previewUrl}
                  className="mt-3 w-full"
                />
              </div>
            ) : null}
            {uploadedRecording && !isBusy ? (
              <p data-testid="record-upload-reuse-hint" className="mt-3 text-sm text-ink-600">
                この Take で評価をもう一度試せます。
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-notice)] p-4 text-sm leading-6 text-ink-800">まだ Take はありません。まず1本、声を残します。</p>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">Take の秒数</span>
          <input
            value={durationSeconds ?? ""}
            onChange={(event) => setDurationSeconds(event.target.value ? Number(event.target.value) : null)}
            type="number"
            min={1}
            max={600}
            placeholder="自動計測できない場合に入力"
            className="w-full rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-4 py-3 text-sm outline-none transition focus:border-[var(--record-accent)]"
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
          <section className="rounded-2xl border border-[var(--line-dark)] bg-[var(--control-panel)] p-4 text-[var(--cta-primary-text)] shadow-[0_18px_44px_rgba(24,23,34,0.16)]">
            <p className="inline-flex rounded-full border border-[var(--line-dark)] bg-white/10 px-3 py-1 text-xs font-semibold text-[rgba(255,241,221,0.78)]">
              ベータでは 評価は10回まで
            </p>
            {isBusy ? (
              <div
                data-testid="record-evaluate-staged-feedback"
                className="mt-4 rounded-2xl border border-[rgba(255,241,221,0.22)] bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--record-accent)]" aria-hidden="true" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(255,241,221,0.64)]">評価を進めています</p>
                </div>
                <p data-testid="record-evaluate-stage-label" className="mt-3 text-base font-semibold text-[var(--cta-primary-text)]">
                  {evaluateWaitStage.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-[rgba(255,241,221,0.76)]">{evaluateWaitStage.helper}</p>
                <div className="mt-4 flex gap-1.5" aria-hidden="true">
                  {EVALUATE_WAIT_STAGES.map((stage, index) => (
                    <span
                      key={stage.label}
                      className={`h-1.5 flex-1 rounded-full transition ${
                        index <= evaluateWaitStageIndex ? "bg-[var(--record-accent)]" : "bg-white/20"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-[rgba(255,241,221,0.62)]">
                  少し時間がかかることがあります。画面を閉じずにお待ちください。
                </p>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              {nextActionActions.map((action) => (
                <button
                  key={action.id}
                  data-testid={action.id === "primary-submit" ? "record-submit-button" : undefined}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-busy={action.id === "primary-submit" && isBusy ? true : undefined}
                  className={`${getRecordDecisionButtonClasses(action.tone)} ${action.disabled ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {canSaveEvaluation && needsDevFallback ? (
          <details open className="rounded-2xl border border-dashed border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">開発用入力</summary>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              ローカル確認用です。本番の録音では表示されません。
            </p>
            <textarea
              data-testid="record-transcript-fallback"
              value={transcriptText}
              onChange={(event) => setTranscriptText(event.target.value)}
              placeholder="ローカル確認用の読み取り結果を入力"
              rows={5}
              className="mt-3 w-full rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-4 py-3 text-sm outline-none transition focus:border-[var(--record-accent)]"
            />
            {transcriptText.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setTranscriptText("")}
                disabled={isBusy}
                className="mt-3 inline-flex rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-[var(--surface-inset-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                入力を消す
              </button>
            ) : null}
            {isMissingRequiredFallback ? (
              <p data-testid="record-transcript-fallback-warning" className="mt-3 text-sm text-amber-700">
                ローカル確認では、この入力が必要です。
              </p>
            ) : null}
          </details>
        ) : (
          <details className="rounded-2xl border border-dashed border-[var(--line-inset)] bg-[var(--surface-secondary)] p-4">
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
              aria-busy={isBusy}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--record-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {messagePhase === "evaluate" && messageKind === "error" && uploadedRecording
                ? getGuidancePrimaryButtonLabel("retry_saved_evaluate")
                : submitLabel}
            </button>
            <p className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-notice)] px-3 py-1 text-xs font-semibold text-ink-700">
              ベータでは 評価は10回まで
            </p>
          </div>
        ) : null}

        {message ? (
          <button
            type="button"
            onClick={clearMessage}
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-[var(--surface-inset-strong)]"
          >
            メッセージを閉じる
          </button>
        ) : null}

        {message ? <p className={`text-sm ${messageKind === "error" ? "text-amber-800" : "text-ink-600"}`}>{message}</p> : null}
      </div>
    </div>
  );
}
