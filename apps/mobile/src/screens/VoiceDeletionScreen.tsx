import { useCallback, useEffect, useRef, useState } from "react";
import type { MobileVoiceDeletionStatus } from "../lib/api";
import { openTrustedLegalPage } from "../lib/trusted-legal-navigation";
import type { PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

type DeletionScreenState =
  | { kind: "loading" }
  | { kind: "ready"; deletion: MobileVoiceDeletionStatus }
  | { kind: "error"; error: PracticeRequestFailure };

const MAX_AUTOMATIC_ADVANCES = 3;

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
  const [supportError, setSupportError] = useState<string | null>(null);
  const advanceBudget = useRef(MAX_AUTOMATIC_ADVANCES);

  const reload = useCallback(() => {
    advanceBudget.current = MAX_AUTOMATIC_ADVANCES;
    setState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (!isOnline) {
      return () => { active = false; };
    }

    void api.getVoiceDeletionStatus().then((result) => {
      if (!active) {
        return;
      }
      setState(result.kind === "success" ? { kind: "ready", deletion: result } : { kind: "error", error: result });
    });

    return () => { active = false; };
  }, [api, isOnline, reloadKey]);

  useEffect(() => {
    if (!isOnline || state.kind !== "ready" || state.deletion.state !== "processing" || !state.deletion.canAdvance || advanceBudget.current < 1) {
      return;
    }

    let active = true;
    void (async () => {
      while (active && advanceBudget.current > 0) {
        advanceBudget.current -= 1;
        const advanced = await api.advanceVoiceDeletion();
        if (!active || advanced.kind !== "success") {
          if (active && advanced.kind !== "success") {
            setState({ kind: "error", error: advanced });
          }
          return;
        }

        const refreshed = await api.getVoiceDeletionStatus();
        if (!active || refreshed.kind !== "success") {
          if (active && refreshed.kind !== "success") {
            setState({ kind: "error", error: refreshed });
          }
          return;
        }
        setState({ kind: "ready", deletion: refreshed });
        if (refreshed.state !== "processing" || !refreshed.canAdvance) {
          return;
        }
      }
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
    advanceBudget.current = MAX_AUTOMATIC_ADVANCES;
    const refreshed = await api.getVoiceDeletionStatus();
    setState(refreshed.kind === "success" ? { kind: "ready", deletion: refreshed } : { kind: "error", error: refreshed });
    setIsSubmitting(false);
  }

  async function retryDeletion() {
    if (!isOnline || state.kind !== "ready" || !state.deletion.canRetry || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    advanceBudget.current = MAX_AUTOMATIC_ADVANCES;
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
  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading eyebrow="Voice data" title="クローンボイスの削除" detail="クローンボイスと関連するボイスデータだけを削除できます。アカウントと英語学習の記録は残ります。" />

      {visibleState.kind === "loading" ? <LoadingState label="削除状況を確認しています…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? (
        <div className="settings-stack">
          <div className="auth-notice" role="status">{mobileVoiceDeletionStatusCopy(visibleState.deletion)}</div>
          {visibleState.deletion.state === "not_requested" ? <button type="button" onClick={() => setIsConfirming(true)}>クローンボイスを削除する</button> : null}
          {visibleState.deletion.state === "retry_available" ? (
            <div className="settings-stack">
              {visibleState.deletion.retryAfterSeconds ? <p className="scope-note">再試行まで約 {visibleState.deletion.retryAfterSeconds} 秒です。</p> : null}
              <button type="button" disabled={!visibleState.deletion.canRetry || isSubmitting} onClick={() => void retryDeletion()}>{isSubmitting ? "再試行しています…" : "削除を再試行する"}</button>
            </div>
          ) : null}
          {visibleState.deletion.state === "manual_required" ? <button type="button" className="secondary-button" onClick={() => void openSupport()}>Support を開く</button> : null}
          {visibleState.deletion.state === "completed" ? (
            <div className="settings-stack">
              <p className="scope-note">お手本を再び使うには Voice Setup で新しく同意し、声を準備してください。</p>
              <button type="button" onClick={() => navigateToVoiceSetupAfterDeletion(onNavigate)}>Voice Setup を開く</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isConfirming ? (
        <div className="auth-notice" role="dialog" aria-label="クローンボイス削除の確認">
          <p>クローンボイスと、それを作るために保存した音声データを削除します。アカウントと英語学習の記録は残ります。</p>
          <p>削除: クローンボイス、音声サンプル、同意録音、個人用のお手本音声とキャッシュ、既定ボイス設定。</p>
          <p>残るもの: アカウント、ログイン、台本、練習録音、Take、文字起こし、発音評価、進捗。</p>
          <div className="settings-link-actions">
            <button type="button" disabled={isSubmitting} onClick={() => void requestDeletion()}>{isSubmitting ? "開始しています…" : "クローンボイスを削除する"}</button>
            <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => setIsConfirming(false)}>キャンセル</button>
          </div>
        </div>
      ) : null}

      <button type="button" className="text-button" onClick={() => onNavigate({ name: "settings" })}>Settings に戻る</button>
      {supportError ? <div className="auth-error" role="alert">{supportError}</div> : null}
    </section>
  );
}
