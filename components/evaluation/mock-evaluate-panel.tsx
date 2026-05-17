"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EvaluatePayload = {
  ok: boolean;
  message?: string;
  data?: {
    takeId: string;
    evaluation: {
      score: number;
      accuracyScore: number;
      fluencyScore: number;
      rhythmScore: number;
      summaryJa: string;
      strengthsJa: string[];
      weakWords: Array<{ word: string; score: number; note: string }>;
      scriptWordCount: number;
      transcriptWordCount: number;
    };
    coach: {
      titleJa: string;
      summaryJa: string;
      bulletPointsJa: string[];
      nextStepJa: string;
      focusWords: string[];
    };
  };
};

export function MockEvaluatePanel({ scriptId, scriptText }: { scriptId: string; scriptText: string }) {
  const router = useRouter();
  const [audioPath, setAudioPath] = useState(`mock://recordings/${scriptId}`);
  const [audioStorageKey, setAudioStorageKey] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(58);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleEvaluate() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scriptId,
          audioPath: audioPath.trim() || undefined,
          audioStorageKey: audioStorageKey.trim() || undefined,
          transcriptText: transcriptText.trim() || undefined,
          durationSeconds
        })
      });

      const payload = (await response.json()) as EvaluatePayload;

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "評価に失敗しました。");
        return;
      }

      if (payload.data?.takeId) {
        router.push(`/scripts/${scriptId}/review/${payload.data.takeId}`);
      }
    } catch {
      setMessage("通信に失敗しました。少し待ってからお試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">開発用評価</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">保存済み結果を作るための開発用導線</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          結果確認画面は保存済み結果の表示専用です。record から文字起こし、評価、保存までを通すため、
          ここでは音声参照を必須にしつつ、mock transcriber 用の transcript も開発用に残しています。
        </p>
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-ink-500">参照中の script</p>
        <p className="mt-2 text-sm leading-6 text-ink-700">{scriptText}</p>
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
          <p className="mt-2">いまは開発用に保存済み結果を 1 件作り、結果確認ページの表示を確かめる段階です。</p>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">音声 path</span>
          <input
            value={audioPath}
            onChange={(event) => setAudioPath(event.target.value)}
            placeholder="mock://recordings/example-take"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">storage key</span>
          <input
            value={audioStorageKey}
            onChange={(event) => setAudioStorageKey(event.target.value)}
            placeholder="takes/user-id/take-id.wav"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">開発用 transcript</span>
          <textarea
            value={transcriptText}
            onChange={(event) => setTranscriptText(event.target.value)}
            placeholder="mock transcriber が使う transcript をここに入れます。"
            rows={7}
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">録音秒数</span>
          <input
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
            type="number"
            min={1}
            max={600}
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
          <p className="mt-2">音声参照と transcript を確認し、このまま評価して保存します。</p>
        </div>

        <button
          type="button"
          onClick={handleEvaluate}
          disabled={loading || (!audioPath.trim() && !audioStorageKey.trim())}
          className="inline-flex items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "保存中..." : "評価して保存する"}
        </button>

        <p className="text-xs leading-6 text-ink-500">
          現在の mock transcriber では、audio path / storage key に加えて transcript が必要です。実音声入力へ切り替えるまでの開発用導線です。
        </p>
        {message ? <p className="text-sm text-ink-600">{message}</p> : null}
      </div>
    </div>
  );
}
