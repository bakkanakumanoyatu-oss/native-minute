"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseVoiceDeletionUiResponse,
  voiceDeletionStatusCopy,
  type VoiceDeletionUiState
} from "./voice-deletion-state";

export { parseVoiceDeletionUiResponse, voiceDeletionStatusCopy, type VoiceDeletionUiState, type VoiceDeletionUiStateName } from "./voice-deletion-state";

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; deletion: VoiceDeletionUiState }
  | { kind: "error"; message: string };

const MAX_AUTOMATIC_ADVANCES = 3;

async function readDeletionResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  return response.ok ? parseVoiceDeletionUiResponse(payload) : null;
}

export function VoiceDeletionPanel() {
  const [panel, setPanel] = useState<PanelState>({ kind: "loading" });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const advanceBudget = useRef(MAX_AUTOMATIC_ADVANCES);

  const refresh = useCallback(async (resetAdvanceBudget = true) => {
    if (resetAdvanceBudget) {
      advanceBudget.current = MAX_AUTOMATIC_ADVANCES;
    }
    setPanel({ kind: "loading" });
    try {
      const deletion = await readDeletionResponse(await fetch("/api/voice-deletion/status", { credentials: "same-origin", cache: "no-store" }));
      setPanel(deletion ? { kind: "ready", deletion } : { kind: "error", message: "状態を確認できませんでした。通信を確認して、もう一度お試しください。" });
    } catch {
      setPanel({ kind: "error", message: "通信に失敗しました。状態は変更されていない可能性があります。もう一度お試しください。" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (panel.kind !== "ready" || panel.deletion.state !== "processing" || !panel.deletion.canAdvance || advanceBudget.current < 1) {
      return;
    }

    let active = true;
    void (async () => {
      while (advanceBudget.current > 0 && active) {
        advanceBudget.current -= 1;
        const advanced = await readDeletionResponse(await fetch("/api/voice-deletion/advance", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        }).catch(() => new Response(null, { status: 503 })));
        if (!advanced || !active) {
          break;
        }

        const refreshed = await readDeletionResponse(await fetch("/api/voice-deletion/status", { credentials: "same-origin", cache: "no-store" }).catch(() => new Response(null, { status: 503 })));
        if (!refreshed || !active) {
          break;
        }
        setPanel({ kind: "ready", deletion: refreshed });
        if (refreshed.state !== "processing" || !refreshed.canAdvance) {
          break;
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [panel]);

  async function requestDeletion() {
    if (isRequesting) {
      return;
    }
    setIsRequesting(true);
    try {
      const requested = await readDeletionResponse(await fetch("/api/voice-deletion/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }));
      setIsConfirming(false);
      if (!requested) {
        setPanel({ kind: "error", message: "削除を開始できませんでした。通信を確認して、もう一度お試しください。" });
        return;
      }
      await refresh();
    } catch {
      setPanel({ kind: "error", message: "通信に失敗しました。削除状況を確認してから、もう一度お試しください。" });
    } finally {
      setIsRequesting(false);
    }
  }

  async function retry() {
    if (panel.kind !== "ready" || !panel.deletion.canRetry || isRequesting) {
      return;
    }
    setIsRequesting(true);
    advanceBudget.current = MAX_AUTOMATIC_ADVANCES;
    try {
      const advanced = await readDeletionResponse(await fetch("/api/voice-deletion/advance", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}"
      }));
      if (!advanced) {
        setPanel({ kind: "error", message: "再試行を開始できませんでした。状態を確認して、もう一度お試しください。" });
        return;
      }
      await refresh(false);
    } catch {
      setPanel({ kind: "error", message: "通信に失敗しました。削除状況を確認してから、もう一度お試しください。" });
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-500">Voice data</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-950">削除するデータを確認</h2>

      {panel.kind === "loading" ? <p className="mt-3 text-sm leading-6 text-ink-600">削除状況を確認しています…</p> : null}
      {panel.kind === "error" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
          <p>{panel.message}</p>
          <button type="button" onClick={() => void refresh()} className="mt-3 font-semibold underline">状態を再確認する</button>
        </div>
      ) : null}

      {panel.kind === "ready" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-ink-700">{voiceDeletionStatusCopy(panel.deletion)}</p>

          {panel.deletion.state === "not_requested" ? (
            <button type="button" onClick={() => setIsConfirming(true)} className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white sm:w-auto">
              クローンボイスを削除する
            </button>
          ) : null}

          {panel.deletion.state === "retry_available" ? (
            <div>
              {panel.deletion.retryAfterSeconds ? <p className="mb-3 text-sm text-ink-600">再試行まで約 {panel.deletion.retryAfterSeconds} 秒です。</p> : null}
              <button type="button" disabled={!panel.deletion.canRetry || isRequesting} onClick={() => void retry()} className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                {isRequesting ? "再試行しています…" : "削除を再試行する"}
              </button>
            </div>
          ) : null}

          {panel.deletion.state === "manual_required" ? (
            <Link href="/support" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">Support を開く</Link>
          ) : null}

          {panel.deletion.state === "completed" ? (
            <div className="space-y-2">
              <p className="text-sm leading-6 text-ink-600">お手本を再び使うには Voice Setup で新しく同意し、声を準備してください。</p>
              <Link href="/setup/voice" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white sm:w-auto">Voice Setup を開く</Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {isConfirming ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="dialog" aria-label="クローンボイス削除の確認">
          <p className="font-semibold">クローンボイスと、それを作るために保存した音声データを削除します。アカウントと英語学習の記録は残ります。</p>
          <p className="mt-3">削除: クローンボイス、音声サンプル、同意録音、個人用のお手本音声とキャッシュ、既定ボイス設定。</p>
          <p className="mt-2">残るもの: アカウント、ログイン、台本、練習録音、Take、文字起こし、発音評価、進捗。</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={isRequesting} onClick={() => void requestDeletion()} className="inline-flex justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{isRequesting ? "開始しています…" : "クローンボイスを削除する"}</button>
            <button type="button" disabled={isRequesting} onClick={() => setIsConfirming(false)} className="inline-flex justify-center rounded-2xl border border-amber-300 bg-white px-4 py-3 font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60">キャンセル</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
