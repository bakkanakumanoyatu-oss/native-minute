"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseVoiceDeletionUiResponse,
  voiceDeletionStatusCopy,
  type VoiceDeletionUiState
} from "./voice-deletion-state";
import {
  MAX_VOICE_DELETION_ADVANCES,
  canRetryVoiceDeletion,
  getVoiceDeletionTerminalActions,
  nextVoiceDeletionConfirmationState,
  needsVoiceDeletionContinuation,
  remainingVoiceDeletionAdvanceBudgetAfterRetry,
  recheckVoiceDeletionStatus,
  retainedVoiceDeletionDataCopy,
  runVoiceDeletionAdvanceBatch
} from "./voice-deletion-controller";

export { parseVoiceDeletionUiResponse, voiceDeletionStatusCopy, type VoiceDeletionUiState, type VoiceDeletionUiStateName } from "./voice-deletion-state";

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; deletion: VoiceDeletionUiState }
  | { kind: "error"; message: string };

async function readDeletionResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  return response.ok ? parseVoiceDeletionUiResponse(payload) : null;
}

export function VoiceDeletionPanel() {
  const [panel, setPanel] = useState<PanelState>({ kind: "loading" });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [needsExplicitContinuation, setNeedsExplicitContinuation] = useState(false);
  const [shouldStartAdvanceBatch, setShouldStartAdvanceBatch] = useState(true);
  const advanceBudget = useRef(MAX_VOICE_DELETION_ADVANCES);

  const refresh = useCallback(async ({
    resetAdvanceBudget = true,
    startAdvanceBatch = true
  }: {
    resetAdvanceBudget?: boolean;
    startAdvanceBatch?: boolean;
  } = {}) => {
    if (resetAdvanceBudget) {
      advanceBudget.current = MAX_VOICE_DELETION_ADVANCES;
    }
    setNeedsExplicitContinuation(false);
    setShouldStartAdvanceBatch(startAdvanceBatch);
    setPanel({ kind: "loading" });
    try {
      const deletion = await recheckVoiceDeletionStatus(async () => readDeletionResponse(await fetch("/api/voice-deletion/status", { credentials: "same-origin", cache: "no-store" })));
      if (!deletion) {
        setPanel({ kind: "error", message: "状態を確認できませんでした。通信を確認して、もう一度お試しください。" });
        return;
      }
      setNeedsExplicitContinuation(!startAdvanceBatch && needsVoiceDeletionContinuation(deletion, 0));
      setPanel({ kind: "ready", deletion });
    } catch {
      setPanel({ kind: "error", message: "通信に失敗しました。状態は変更されていない可能性があります。もう一度お試しください。" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!shouldStartAdvanceBatch || panel.kind !== "ready" || panel.deletion.state !== "processing" || !panel.deletion.canAdvance || advanceBudget.current < 1) {
      return;
    }

    let active = true;
    void (async () => {
      const batch = await runVoiceDeletionAdvanceBatch({
        maximumAdvances: advanceBudget.current,
        advance: async () => readDeletionResponse(await fetch("/api/voice-deletion/advance", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        }).catch(() => new Response(null, { status: 503 }))),
        getStatus: async () => readDeletionResponse(await fetch("/api/voice-deletion/status", {
          credentials: "same-origin",
          cache: "no-store"
        }).catch(() => new Response(null, { status: 503 })))
      });
      if (!active) {
        return;
      }
      advanceBudget.current = Math.max(0, advanceBudget.current - batch.advances);
      setShouldStartAdvanceBatch(false);
      if (batch.kind === "transport_failure") {
        setNeedsExplicitContinuation(false);
        setPanel({ kind: "error", message: "処理結果を推測しません。状態を再確認してから続けてください。" });
        return;
      }
      setNeedsExplicitContinuation(batch.needsContinuation);
      setPanel({ kind: "ready", deletion: batch.deletion });
    })();

    return () => {
      active = false;
    };
  }, [panel, shouldStartAdvanceBatch]);

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
    if (panel.kind !== "ready" || !canRetryVoiceDeletion(panel.deletion) || isRequesting) {
      return;
    }
    setIsRequesting(true);
    // The retry POST below is the first advance in this user-visible batch.
    advanceBudget.current = remainingVoiceDeletionAdvanceBudgetAfterRetry();
    setNeedsExplicitContinuation(false);
    setShouldStartAdvanceBatch(true);
    try {
      const advanced = await readDeletionResponse(await fetch("/api/voice-deletion/advance", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}"
      }));
      if (!advanced) {
        setPanel({ kind: "error", message: "再試行を開始できませんでした。状態を確認して、もう一度お試しください。" });
        return;
      }
      await refresh({ resetAdvanceBudget: false });
    } catch {
      setPanel({ kind: "error", message: "通信に失敗しました。削除状況を確認してから、もう一度お試しください。" });
    } finally {
      setIsRequesting(false);
    }
  }

  const terminalActions = panel.kind === "ready" ? getVoiceDeletionTerminalActions(panel.deletion.state) : null;

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-500">Voice data</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-950">削除するデータを確認</h2>

      {panel.kind === "loading" ? <p className="mt-3 text-sm leading-6 text-ink-600">削除状況を確認しています…</p> : null}
      {panel.kind === "error" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
          <p>{panel.message}</p>
          <button type="button" onClick={() => void refresh({ startAdvanceBatch: false })} className="mt-3 font-semibold underline">状態を再確認する</button>
        </div>
      ) : null}

      {panel.kind === "ready" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-ink-700">{voiceDeletionStatusCopy(panel.deletion)}</p>

          {panel.deletion.state === "not_requested" ? (
            <button type="button" onClick={() => setIsConfirming(nextVoiceDeletionConfirmationState("open"))} className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white sm:w-auto">
              クローンボイスを削除する
            </button>
          ) : null}

          {panel.deletion.state === "retry_available" ? (
            <div>
              {panel.deletion.retryAfterSeconds ? <p className="mb-3 text-sm text-ink-600">再試行まで約 {panel.deletion.retryAfterSeconds} 秒です。</p> : null}
              <button type="button" disabled={!canRetryVoiceDeletion(panel.deletion) || isRequesting} onClick={() => void retry()} className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                {isRequesting ? "再試行しています…" : "削除を再試行する"}
              </button>
              {!canRetryVoiceDeletion(panel.deletion) ? <button type="button" onClick={() => void refresh({ startAdvanceBatch: false })} className="mt-3 inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:ml-3 sm:mt-0 sm:w-auto">状態を再確認する</button> : null}
            </div>
          ) : null}

          {needsExplicitContinuation && needsVoiceDeletionContinuation(panel.deletion, 0) ? (
            <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
              <p className="text-sm leading-6 text-ink-700">処理は続いています。状態を再確認して続けられます。</p>
              <button type="button" onClick={() => void refresh()} className="mt-3 inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto">状態を再確認して続ける</button>
            </div>
          ) : null}

          {panel.deletion.state === "manual_required" ? (
            <Link href="/support" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">Support を開く</Link>
          ) : null}

          {panel.deletion.state === "completed" ? (
            <div className="space-y-2">
              <p className="text-sm leading-6 text-ink-600">お手本を再び使うには Voice Setup で新しく同意し、声を準備してください。</p>
              <Link href="/setup/voice" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white sm:w-auto">{terminalActions?.primary}</Link>
            </div>
          ) : null}

          {panel.deletion.state === "already_no_voice" ? (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-ink-600">新しくパーソナライズされた voice を使いたい場合は、Voice Setup から準備できます。</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/setup/voice" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto">{terminalActions?.primary}</Link>
                <Link href="/settings" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto">{terminalActions?.secondary}</Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isConfirming ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="dialog" aria-label="クローンボイス削除の確認">
          <p className="font-semibold">クローンボイスと、それを作るために保存した音声データを削除します。アカウントと英語学習の記録は残ります。</p>
          <p className="mt-3">削除: クローンボイス、音声サンプル、同意録音、個人用のお手本音声とキャッシュ、既定ボイス設定。</p>
          <p className="mt-2">残るもの: {retainedVoiceDeletionDataCopy}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={isRequesting} onClick={() => void requestDeletion()} className="inline-flex justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{isRequesting ? "開始しています…" : "クローンボイスを削除する"}</button>
            <button type="button" disabled={isRequesting} onClick={() => setIsConfirming(nextVoiceDeletionConfirmationState("cancel"))} className="inline-flex justify-center rounded-2xl border border-amber-300 bg-white px-4 py-3 font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60">キャンセル</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
