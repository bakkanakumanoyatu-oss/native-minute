import { useCallback, useEffect, useRef, useState } from "react";
import type { MobileVoiceDeletionStatus } from "../lib/api";
import { openTrustedLegalPage } from "../lib/trusted-legal-navigation";
import type { PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading } from "./ScreenParts";
import {
  MAX_VOICE_DELETION_ADVANCES,
  canRetryVoiceDeletion,
  getVoiceDeletionTerminalActions,
  nextVoiceDeletionConfirmationState,
  needsVoiceDeletionContinuation,
  recheckVoiceDeletionStatus,
  retainedVoiceDeletionDataCopy,
  runVoiceDeletionAdvanceBatch
} from "../../../../components/voice/voice-deletion-controller";

type DeletionScreenState =
  | { kind: "loading" }
  | { kind: "ready"; deletion: MobileVoiceDeletionStatus }
  | { kind: "recheck" }
  | { kind: "error"; error: PracticeRequestFailure };

export function mobileVoiceDeletionStatusCopy(deletion: MobileVoiceDeletionStatus) {
  switch (deletion.state) {
    case "not_requested":
      return "削除を開始する前に、対象と残るデータを確認できます。";
    case "processing":
      return "ボイスデータの削除状況を確認しています。画面を閉じても、次回この画面で状態を確認できます。";
    case "retry_available":
      return deletion.canRetry ? "もう一度確認して削除を進められます。" : "再試行できる時刻までお待ちください。";
    case "manual_required":
      return "一部のボイスデータについてサポートでの確認が必要です。アカウントと学習履歴は削除されていません。";
    case "completed":
      return "クローンボイスと関連するボイスデータを削除しました。学習履歴はそのまま残っています。";
    case "already_no_voice":
      return "削除対象のクローンボイスと関連するボイスデータはありません。アカウントと学習履歴はそのままです。";
  }
}

export function navigateToVoiceSetupAfterDeletion(onNavigate: (route: PracticeRoute) => void) {
  onNavigate({ name: "voice_setup" });
}

function needsSafeStatusRecheck(error: PracticeRequestFailure | null) {
  return error === null || error.kind === "network-error" || error.kind === "timeout" || error.kind === "server-error";
}

export function VoiceDeletionScreen({
  api,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [state, setState] = useState<DeletionScreenState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasExhaustedAdvanceBudget, setHasExhaustedAdvanceBudget] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const advanceBudget = useRef(MAX_VOICE_DELETION_ADVANCES);

  const reload = useCallback(() => {
    advanceBudget.current = MAX_VOICE_DELETION_ADVANCES;
    setHasExhaustedAdvanceBudget(false);
    setState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (!isOnline) {
      return () => { active = false; };
    }

    void recheckVoiceDeletionStatus(() => api.getVoiceDeletionStatus()).then((result) => {
      if (!active) {
        return;
      }
      setState(result?.kind === "success" ? { kind: "ready", deletion: result } : { kind: "error", error: result ?? { kind: "network-error" } });
    });

    return () => { active = false; };
  }, [api, isOnline, reloadKey]);

  useEffect(() => {
    if (!isOnline || state.kind !== "ready" || state.deletion.state !== "processing" || !state.deletion.canAdvance || advanceBudget.current < 1) {
      return;
    }

    let active = true;
    void (async () => {
      let requestFailure: PracticeRequestFailure | null = null;
      const batch = await runVoiceDeletionAdvanceBatch({
        maximumAdvances: advanceBudget.current,
        advance: async () => {
          const result = await api.advanceVoiceDeletion();
          if (result.kind === "success") {
            return result;
          }
          requestFailure = result;
          return null;
        },
        getStatus: async () => {
          const result = await api.getVoiceDeletionStatus();
          if (result.kind === "success") {
            return result;
          }
          requestFailure = result;
          return null;
        }
      });
      if (!active) {
        return;
      }
      advanceBudget.current = Math.max(0, advanceBudget.current - batch.advances);
      if (batch.kind === "transport_failure") {
        setHasExhaustedAdvanceBudget(false);
        setState(needsSafeStatusRecheck(requestFailure) ? { kind: "recheck" } : { kind: "error", error: requestFailure });
        return;
      }
      setHasExhaustedAdvanceBudget(batch.needsContinuation);
      setState({ kind: "ready", deletion: batch.deletion });
    })();

    return () => { active = false; };
  }, [api, isOnline, state]);

  async function requestDeletion() {
    if (!isOnline || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    const requested = await api.createVoiceDeletionRequest();
    setIsConfirming(false);
    if (requested.kind !== "success") {
      setState({ kind: "error", error: requested });
      setIsSubmitting(false);
      return;
    }
    advanceBudget.current = MAX_VOICE_DELETION_ADVANCES;
    setHasExhaustedAdvanceBudget(false);
    const refreshed = await api.getVoiceDeletionStatus();
    setState(refreshed.kind === "success" ? { kind: "ready", deletion: refreshed } : { kind: "error", error: refreshed });
    setIsSubmitting(false);
  }

  async function retryDeletion() {
    if (!isOnline || state.kind !== "ready" || !canRetryVoiceDeletion(state.deletion) || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    advanceBudget.current = MAX_VOICE_DELETION_ADVANCES;
    setHasExhaustedAdvanceBudget(false);
    const advanced = await api.advanceVoiceDeletion();
    if (advanced.kind !== "success") {
      setState({ kind: "error", error: advanced });
      setIsSubmitting(false);
      return;
    }
    const refreshed = await api.getVoiceDeletionStatus();
    setState(refreshed.kind === "success" ? { kind: "ready", deletion: refreshed } : { kind: "error", error: refreshed });
    setIsSubmitting(false);
  }

  async function openSupport() {
    setSupportError(null);
    try {
      await openTrustedLegalPage("support");
    } catch {
      setSupportError("Support を開けませんでした。通信状態を確認してもう一度お試しください。");
    }
  }

  const visibleState: DeletionScreenState = isOnline ? state : { kind: "error", error: { kind: "offline" } };
  const terminalActions = visibleState.kind === "ready" ? getVoiceDeletionTerminalActions(visibleState.deletion.state) : null;
  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading eyebrow="Voice data" title="クローンボイスの削除" detail="クローンボイスと関連するボイスデータだけを削除できます。アカウントと英語学習の記録は残ります。" />

      {visibleState.kind === "loading" ? <LoadingState label="削除状況を確認しています…" /> : null}
      {visibleState.kind === "recheck" ? (
        <div className="auth-error" role="alert">
          <p>処理結果を推測しません。状態を再確認してから続けてください。</p>
          <button type="button" className="secondary-button" onClick={reload}>状態を再確認する</button>
        </div>
      ) : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} retryLabel="状態を再確認する" /> : null}
      {visibleState.kind === "ready" ? (
        <div className="settings-stack">
          <div className="auth-notice" role="status">{mobileVoiceDeletionStatusCopy(visibleState.deletion)}</div>
          {visibleState.deletion.state === "not_requested" ? <button type="button" onClick={() => setIsConfirming(nextVoiceDeletionConfirmationState("open"))}>クローンボイスを削除する</button> : null}
          {visibleState.deletion.state === "retry_available" ? (
            <div className="settings-stack">
              {visibleState.deletion.retryAfterSeconds ? <p className="scope-note">再試行まで約 {visibleState.deletion.retryAfterSeconds} 秒です。</p> : null}
              <button type="button" disabled={!canRetryVoiceDeletion(visibleState.deletion) || isSubmitting} onClick={() => void retryDeletion()}>{isSubmitting ? "再試行しています…" : "削除を再試行する"}</button>
              {!canRetryVoiceDeletion(visibleState.deletion) ? <button type="button" className="secondary-button" onClick={reload}>状態を再確認する</button> : null}
            </div>
          ) : null}
          {hasExhaustedAdvanceBudget && needsVoiceDeletionContinuation(visibleState.deletion, 0) ? (
            <div className="settings-stack auth-notice">
              <p>処理は続いています。状態を再確認して続けられます。</p>
              <button type="button" className="secondary-button" onClick={reload}>状態を再確認して続ける</button>
            </div>
          ) : null}
          {visibleState.deletion.state === "manual_required" ? <button type="button" className="secondary-button" onClick={() => void openSupport()}>Support を開く</button> : null}
          {visibleState.deletion.state === "completed" ? (
            <div className="settings-stack">
              <p className="scope-note">お手本を再び使うには Voice Setup で新しく同意し、声を準備してください。</p>
              <button type="button" onClick={() => navigateToVoiceSetupAfterDeletion(onNavigate)}>{terminalActions?.primary}</button>
            </div>
          ) : null}
          {visibleState.deletion.state === "already_no_voice" ? (
            <div className="settings-stack">
              <p className="scope-note">新しくパーソナライズされた voice を使いたい場合は、Voice Setup から準備できます。</p>
              <button type="button" onClick={() => navigateToVoiceSetupAfterDeletion(onNavigate)}>{terminalActions?.primary}</button>
              <button type="button" className="secondary-button" onClick={() => onNavigate({ name: "settings" })}>{terminalActions?.secondary}</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isConfirming ? (
        <div className="auth-notice" role="dialog" aria-label="クローンボイス削除の確認">
          <p>クローンボイスと、それを作るために保存した音声データを削除します。アカウントと英語学習の記録は残ります。</p>
          <p>削除: クローンボイス、音声サンプル、同意録音、個人用のお手本音声とキャッシュ、既定ボイス設定。</p>
          <p>残るもの: {retainedVoiceDeletionDataCopy}</p>
          <div className="settings-link-actions">
            <button type="button" disabled={isSubmitting} onClick={() => void requestDeletion()}>{isSubmitting ? "開始しています…" : "クローンボイスを削除する"}</button>
            <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => setIsConfirming(nextVoiceDeletionConfirmationState("cancel"))}>キャンセル</button>
          </div>
        </div>
      ) : null}

      {!(visibleState.kind === "ready" && visibleState.deletion.state === "already_no_voice") ? <button type="button" className="text-button" onClick={() => onNavigate({ name: "settings" })}>Settings に戻る</button> : null}
      {supportError ? <div className="auth-error" role="alert">{supportError}</div> : null}
    </section>
  );
}
