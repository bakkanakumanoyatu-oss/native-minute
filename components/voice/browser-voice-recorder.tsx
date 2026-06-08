"use client";

import { useEffect, useRef, useState } from "react";

type BrowserVoiceRecorderProps = {
  id: string;
  title: string;
  description: string;
  filePrefix: string;
  minSeconds: number;
  selectedFile: File | null;
  onUseRecording: (file: File) => void;
  disabled?: boolean;
};

type RecorderStatus = "idle" | "starting" | "recording" | "recorded";

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function getExtension(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized.includes("webm")) {
    return "webm";
  }

  if (normalized.includes("mp4")) {
    return "m4a";
  }

  if (normalized.includes("mpeg")) {
    return "mp3";
  }

  if (normalized.includes("wav")) {
    return "wav";
  }

  return "webm";
}

function formatSeconds(value: number | null) {
  if (value === null) {
    return null;
  }

  return `${value}秒`;
}

export function BrowserVoiceRecorder({
  id,
  title,
  description,
  filePrefix,
  minSeconds,
  selectedFile,
  onUseRecording,
  disabled = false
}: BrowserVoiceRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"info" | "error">("info");

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      streamRef.current = null;
    };
  }, []);

  function setInfo(nextMessage: string) {
    setMessage(nextMessage);
    setMessageKind("info");
  }

  function setError(nextMessage: string) {
    setMessage(nextMessage);
    setMessageKind("error");
  }

  function replacePreviewUrl(nextPreviewUrl: string | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
  }

  function clearPendingRecording() {
    setPendingFile(null);
    setDurationSeconds(null);
    setStatus("idle");
    setMessage(null);
    replacePreviewUrl(null);
  }

  async function handleStartRecording() {
    setMessage(null);
    setStatus("starting");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("idle");
      setError("このブラウザではその場録音に対応していません。下のファイル選択を使ってください。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = getSupportedMimeType();
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setPendingFile(null);
      setDurationSeconds(null);
      replacePreviewUrl(null);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || supportedMimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const elapsedMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
        const measuredSeconds = elapsedMs > 0 ? Math.max(1, Math.round(elapsedMs / 1000)) : null;

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        startedAtRef.current = null;

        if (!blob.size) {
          setStatus("idle");
          setError("録音が空でした。マイクの許可を確認して、もう一度録音してください。");
          return;
        }

        if (measuredSeconds !== null && measuredSeconds < minSeconds) {
          setStatus("idle");
          setDurationSeconds(measuredSeconds);
          setError(`${minSeconds}秒以上録音してください。短い録音は声の準備に使えません。`);
          return;
        }

        const file = new File([blob], `${filePrefix}-${Date.now()}.${getExtension(type)}`, { type });
        setPendingFile(file);
        setDurationSeconds(measuredSeconds);
        setStatus("recorded");
        setInfo("録音できました。再生して確認し、問題なければこの録音を使ってください。");
        replacePreviewUrl(URL.createObjectURL(file));
      };

      recorder.start();
      setStatus("recording");
    } catch {
      setStatus("idle");
      setError("マイクを使えませんでした。ブラウザのマイク許可を確認するか、ファイル選択を使ってください。");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
    }
  }

  function handleStopRecording() {
    if (!recorderRef.current) {
      return;
    }

    recorderRef.current.stop();
    setStatus("idle");
  }

  function handleUseRecording() {
    if (!pendingFile) {
      setError("先に録音してください。");
      return;
    }

    onUseRecording(pendingFile);
    setInfo("この録音を使います。必要なら下でファイルを選び直せます。");
  }

  const selectedFileLabel = selectedFile ? "使用中の録音があります" : "まだ録音を選んでいません";
  const durationLabel = formatSeconds(durationSeconds);

  return (
    <div data-testid={`${id}-browser-recorder`} className="space-y-4 rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
      <div>
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="mt-1 text-sm leading-6 text-ink-600">{description}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={status === "recording" ? handleStopRecording : handleStartRecording}
          disabled={disabled || status === "starting"}
          aria-busy={status === "starting"}
          className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "recording" ? "停止する" : status === "starting" ? "マイクを準備中..." : "録音を開始"}
        </button>

        {pendingFile ? (
          <>
            <button
              type="button"
              onClick={clearPendingRecording}
              disabled={disabled || status === "recording"}
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              録り直す
            </button>
            <button
              type="button"
              onClick={handleUseRecording}
              disabled={disabled || status === "recording"}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              この録音を使う
            </button>
          </>
        ) : null}
      </div>

      {previewUrl ? (
        <div className="space-y-2">
          <audio controls src={previewUrl} className="w-full" />
          <p className="text-xs leading-5 text-ink-600">
            {durationLabel ? `録音時間: ${durationLabel}。` : null}
            再生して、声が聞こえることを確認してください。
          </p>
        </div>
      ) : null}

      <p className="text-xs font-semibold text-[var(--accent-strong)]">{selectedFileLabel}</p>
      <p className="text-xs leading-5 text-ink-600">
        マイクが使えない場合は、下のファイル選択を使えます。録音の中身や保存先の詳細は画面に表示しません。
      </p>
      {message ? (
        <p data-testid={`${id}-browser-recorder-message`} className={`text-sm leading-6 ${messageKind === "error" ? "text-amber-800" : "text-ink-600"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
