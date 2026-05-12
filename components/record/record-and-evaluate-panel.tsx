"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeBrowserAudioFileToPcmWav } from "@/lib/browser-pcm-wav";
import { getGuidanceActionBadgeLabel, getGuidancePrimaryButtonLabel, getGuidanceToneClasses } from "@/lib/guidance-ui";
import { getRecordNextStepGuidance, getRecordRecoveryGuidance } from "@/lib/record-recovery-guidance";
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
  transcriptionMessage,
  pronunciationProvider,
  pronunciationSupported,
  pronunciationMessage,
  pronunciationDiagnostics,
  practiceContext
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
      setErrorMessage("マイクの取得に失敗しました。権限を確認するか、音声ファイルを選択してください。", "record");
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
      setErrorMessage("先に録音するか、音声ファイルを選択してください。", "record", 400);
      return;
    }

    if (!pronunciationSupported) {
      setErrorMessage(pronunciationMessage ?? "pronunciation evaluator の設定を確認してください。", "evaluate", 503);
      return;
    }

    if (needsDevFallback && transcriptionSupported && transcriptText.trim().length === 0) {
      setErrorMessage("mock transcription では補助 transcript が必要です。開発用の補助 transcript を入れてから再試行してください。", "evaluate", 400);
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
          setInfoMessage("Azure evaluation 用に録音を wav/PCM へ変換しています。", "upload");
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
  const azureRecordingFormatMessage = azureRequiresWavUpload
    ? azureNeedsNormalization
      ? "Azure evaluation では、この録音を upload 前に wav/PCM へ自動変換します。変換できない環境では wav ファイルを選び直します。"
      : "Azure evaluation では PCM WAV を使います。非 wav 録音は client 側で正規化してから upload します。"
    : null;
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
  const nextStepGuidance = getRecordNextStepGuidance({
    hasSelectedFile: Boolean(selectedFile),
    hasUploadedRecording: Boolean(uploadedRecording),
    isMeasuringDuration,
    isMissingRequiredFallback,
    shortRecordingPrompt,
    transcriptionSupported,
    transcriptionMessage,
    practiceContext
  });
  const currentStageLabel = isPreparingUploadFile
    ? "変換中"
    : isUploading
    ? "保存中"
    : isEvaluating
      ? "評価中"
      : uploadedRecording
        ? "録音は保存済み"
        : selectedFile
          ? "録音は準備完了"
          : "録音待ち";
  const currentStageDescription = isPreparingUploadFile
    ? "Azure evaluation 用に wav/PCM へ正規化しています。"
    : isUploading
    ? "recordings bucket に保存しています。"
    : isEvaluating
      ? "transcription → evaluation → save を進めています。"
      : uploadedRecording
        ? "この録音はすでに保存済みなので、次の再試行は評価から再開できます。"
      : selectedFile
        ? "録音は選択済みです。必要なら再生プレビューで確認してから進められます。"
        : !pronunciationSupported
          ? "録音前に pronunciation evaluator の前提を整える必要があります。"
        : !transcriptionSupported
          ? "録音前に文字起こし provider の前提を整える必要があります。"
          : "録音するか音声ファイルを選ぶと、評価の準備に進みます。";
  const currentStageDecisionHint = isPreparingUploadFile
    ? "いまは待機で十分です。変換が終わると upload に進みます。"
    : isUploading
    ? "いまは待機で十分です。保存が終わると評価に進みます。"
    : isEvaluating
      ? "いまは待機で十分です。完了すると結果確認に進みます。"
      : uploadedRecording
        ? "いまは保存済み録音で評価を続けるか、録音を差し替えるかを決める段階です。"
      : selectedFile
        ? "いまはこの録音で進むか、録り直すかを決める段階です。"
      : azureRequiresWavUpload
        ? "いまは Azure 用の音声をどう正規化して進めるかも合わせて決める段階です。"
      : !pronunciationSupported
          ? "いまは evaluation 設定を直すまでの戻り先を決める段階です。"
        : !transcriptionSupported
          ? "いまは設定を直すまでの戻り先を決める段階です。"
          : "いまは録音を準備する段階です。";
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
  const nextActionTitle = recoveryGuidance
    ? recoveryGuidance.retryKeepsUpload
      ? "保存済み録音で次に進む"
      : "立て直し方を決める"
    : uploadedRecording
      ? "保存済み録音で次に進む"
    : selectedFile
        ? "この録音で次に進む"
      : !pronunciationSupported
        ? "evaluation 設定を確認するまでの戻り先を決める"
      : !transcriptionSupported
        ? "設定を確認するまでの戻り先を決める"
        : "録音を準備する";
  const nextActionDescription = recoveryGuidance
    ? recoveryGuidance.retryKeepsUpload
      ? "recovery の内容は上で確認できています。ここでは、同じ録音で続けるか、録音を差し替えるか、必要なら listen に戻るかを決めます。"
      : "recovery の内容は上で確認できています。ここでは、上の案内どおり立て直すか、録音を準備し直すか、必要なら listen に戻るかを決めます。"
    : isMissingRequiredFallback
      ? "いまは補助 transcript を入れてから進む段階です。入力が済めば、この録音のまま評価に進めます。script を聞き直したいときは listen に戻れます。"
    : azureNeedsNormalization
      ? "いま選んでいる録音は Azure 用に自動で wav/PCM へ正規化してから進めます。変換に失敗したときだけ wav ファイルへ差し替えます。"
    : uploadedRecording
      ? "いまは録音の保存までは終わっています。違和感がなければそのまま評価を続け、変えたいなら録音を差し替え、迷うなら listen を 1 回だけ挟めます。"
    : selectedFile
        ? "いまは録音の準備ができています。違和感がなければ評価に進み、変えたいなら録音を作り直し、迷うなら listen を聞き直します。"
        : azureRequiresWavUpload
          ? "Azure pronunciation assessment を使う間も、この画面の録音をそのまま使えます。非 wav のときは upload 前に client 側で wav/PCM へ正規化します。"
        : !pronunciationSupported
          ? "いまは pronunciation evaluator 設定の復旧待ちです。設定を直すまで評価保存は進めず、listen に戻るか scripts に戻るかを先に決めます。"
        : !transcriptionSupported
          ? "いまは transcription 設定の復旧待ちです。設定を直すまで評価保存は進めず、listen に戻るか、上の Recovery plan に沿って scripts へ戻ります。"
          : "録音がまだないので、まず録音方法を選びます。script を聞き直したいときは listen に戻れます。";
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
                label: "listen を聞き直す",
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
                label: "listen を聞き直す",
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
            {
              id: "select-file",
              label: "音声ファイルを選ぶ",
              tone: "secondary",
              disabled: isBusy,
              onClick: () => fileInputRef.current?.click()
            },
            ...(listenHref
              ? [
                  {
                    id: "return-listen",
                    label: "先に listen を聞く",
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
                    label: "listen に戻る",
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
                    label: "listen に戻る",
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
      <div className="rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">record</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">録音して、結果を作る</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          まず録音を用意します。選んだ音声でよければ、そのまま評価して review へ進みます。
        </p>
        <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">Details / provider と形式の前提</summary>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            録音ファイルを保存してから、audio-first contract のまま transcription → evaluation → save を通します。
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-ink-500">文字起こし provider</p>
          <p
            data-testid="record-transcription-status"
            data-provider={transcriptionProvider}
            data-supported={transcriptionSupported ? "true" : "false"}
            className="mt-2 text-sm leading-6 text-ink-700"
          >
            {transcriptionSupported
              ? `${transcriptionProvider} を使用します。`
              : transcriptionMessage ?? "transcription provider の設定を確認してください。"}
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-ink-500">評価 provider</p>
          <p
            data-testid="record-pronunciation-status"
            data-provider={pronunciationProvider}
            data-supported={pronunciationSupported ? "true" : "false"}
            className="mt-2 text-sm leading-6 text-ink-700"
          >
            {pronunciationSupported
              ? `${pronunciationProvider} を使用します。`
              : pronunciationMessage ?? "pronunciation evaluator の設定を確認してください。"}
          </p>
          {pronunciationDiagnostics.length > 0 && (azureRequiresWavUpload || !pronunciationSupported) ? (
            <ul data-testid="record-pronunciation-diagnostics" className="mt-3 space-y-2 text-sm leading-6 text-ink-600">
              {pronunciationDiagnostics.map((diagnostic) => (
                <li key={diagnostic.key}>
                  • {diagnostic.label}: {diagnostic.message}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
          <p className="mt-2 font-semibold text-ink-900">{currentStageLabel}</p>
          <p className="mt-2">{currentStageDescription}</p>
          <p className="mt-2 text-ink-600">{currentStageDecisionHint}</p>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">録音入力</p>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            録音を作る操作はここで行います。次に押す主ボタンは下の `Next action` で決め、迷ったら listen を補助で挟めます。
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            対応形式は {RECORDING_FORMAT_LABEL}、サイズ目安は {Math.round(MAX_RECORDING_BYTES / (1024 * 1024))}MB までです。合わない file は upload 前に止めます。
          </p>
          {azureRecordingFormatMessage ? (
            <p className="mt-2 text-sm leading-6 text-amber-700">{azureRecordingFormatMessage}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            disabled={isBusy}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRecording ? "録音を止める" : "マイクで録音する"}
          </button>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
            音声ファイルを選択
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

        {selectedFile ? (
          <div data-testid="record-selected-file" className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">録音状態</p>
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
                この録音はすでに保存済みです。再試行では再 upload せず、評価からやり直します。
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4 text-sm leading-6 text-ink-700">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
            <p className="mt-2">まだ録音はありません。まず録音方法を選び、迷ったら下の `Next action` から listen に戻るかを決めます。</p>
          </div>
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

        {!recoveryGuidance ? (
          <section className={`rounded-2xl border p-4 ${getGuidanceToneClasses(nextStepGuidance.tone)}`}>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next step</p>
            <h3 className="mt-2 text-lg font-semibold text-ink-900">{nextStepGuidance.titleJa}</h3>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(nextStepGuidance.actionKind)}</p>
            <p className="mt-3 text-sm leading-6 text-ink-800">{nextStepGuidance.summaryJa}</p>
            {nextStepGuidance.sourceHintJa ? <p className="mt-3 text-sm leading-6 text-ink-600">{nextStepGuidance.sourceHintJa}</p> : null}
            <p className="mt-3 text-sm leading-6 text-ink-700">この画面での実行指示: {nextStepGuidance.executionCueJa}</p>
            {nextStepGuidance.focusReasonJa ? <p className="mt-3 text-sm leading-6 text-ink-600">今これを優先する理由: {nextStepGuidance.focusReasonJa}</p> : null}
            {nextStepGuidance.focusSummaryJa ? <p className="mt-3 text-sm leading-6 text-ink-700">{nextStepGuidance.focusSummaryJa}</p> : null}
            {nextStepGuidance.focusWords.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {nextStepGuidance.focusWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                    {word}
                  </span>
                ))}
              </div>
            ) : null}
            <ol className="mt-4 space-y-2 text-sm leading-6 text-ink-700">
              {nextStepGuidance.stepsJa.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm font-semibold text-ink-900">次の一手: {nextStepGuidance.primaryActionLabelJa}</p>
            <p className="mt-2 text-sm leading-6 text-ink-600">迷ったら `Current step` に戻って段階を確認し、録音の違和感は再生プレビューで 1 回だけ見直します。</p>
          </section>
        ) : null}

        {recoveryGuidance ? (
          <section
            data-testid="record-recovery-guidance"
            className={`rounded-2xl border p-4 ${getGuidanceToneClasses(recoveryGuidance.tone)}`}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Recovery plan</p>
            <h3 className="mt-2 text-lg font-semibold text-ink-900">{recoveryGuidance.titleJa}</h3>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(recoveryGuidance.actionKind)}</p>
            <p className="mt-3 text-sm leading-6 text-ink-800">{recoveryGuidance.summaryJa}</p>
            {recoveryGuidance.sourceHintJa ? <p className="mt-3 text-sm leading-6 text-ink-600">{recoveryGuidance.sourceHintJa}</p> : null}
            <p className="mt-3 text-sm leading-6 text-ink-700">この画面での実行指示: {recoveryGuidance.executionCueJa}</p>
            {recoveryGuidance.focusReasonJa ? <p className="mt-3 text-sm leading-6 text-ink-600">今これを優先する理由: {recoveryGuidance.focusReasonJa}</p> : null}
            {recoveryGuidance.focusSummaryJa ? <p className="mt-3 text-sm leading-6 text-ink-700">{recoveryGuidance.focusSummaryJa}</p> : null}
            {recoveryGuidance.focusWords.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {recoveryGuidance.focusWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                    {word}
                  </span>
                ))}
              </div>
            ) : null}
            <ol className="mt-4 space-y-2 text-sm leading-6 text-ink-700">
              {recoveryGuidance.stepsJa.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm font-semibold text-ink-900">次の一手: {recoveryGuidance.primaryActionLabelJa}</p>
            {recoveryGuidance.retryKeepsUpload ? (
              <p className="mt-2 text-sm leading-6 text-ink-600">この録音は保存済みなので、再試行では再 upload せず評価だけをやり直します。</p>
            ) : null}
            <p className="mt-2 text-sm leading-6 text-ink-600">迷ったら Current step に戻り、いまが録音準備・保存済み再試行・立て直しのどこかを確認すると判断しやすいです。</p>
          </section>
        ) : null}

        {showNextAction ? (
          <section className={`rounded-2xl border p-4 ${getGuidanceToneClasses("steady")}`}>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
            <h3 className="mt-2 text-lg font-semibold text-ink-900">{nextActionTitle}</h3>
            <p className="mt-3 text-sm leading-6 text-ink-700">{nextActionDescription}</p>
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
            <p className="mt-3 text-sm leading-6 text-ink-600">迷ったら上の Next step / Recovery plan に戻り、重点を変えずに進めるかだけを決めれば十分です。</p>
          </section>
        ) : null}

        {canSaveEvaluation ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">補助 transcript</p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              これは `TRANSCRIPTION_PROVIDER=mock` のときだけ使う補助入力です。主導線は録音ファイルの保存で、必要なときだけ `Next step / Next action` を補助します。
            </p>
            <textarea
              data-testid="record-transcript-fallback"
              value={transcriptText}
              onChange={(event) => setTranscriptText(event.target.value)}
              placeholder={needsDevFallback ? "mock provider では補助 transcript が必要です。" : "通常は空欄のままで大丈夫です。"}
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
                補助 transcript を消す
              </button>
            ) : null}
            {isMissingRequiredFallback ? (
              <p data-testid="record-transcript-fallback-warning" className="mt-3 text-sm text-amber-700">
                mock provider では、この補助 transcript を入れないと評価保存に進めません。
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">補助 transcript</p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              いまは保存済み結果を作る前提が足りないため、この補助入力では先に進めません。上の `Recovery plan` と `Next action` で戻り先を決めます。
            </p>
          </div>
        )}

        {!showNextAction ? (
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
