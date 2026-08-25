import { useCallback, useEffect, useState } from "react";
import {
  canStartMobileAccountDeletionRequest,
  type MobileAccountDeletionStatus
} from "../lib/api";
import { openTrustedLegalPage } from "../lib/trusted-legal-navigation";
import type { PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

type DeletionState =
  | { kind: "loading" }
  | { kind: "ready"; deletion: MobileAccountDeletionStatus }
  | { kind: "error"; error: PracticeRequestFailure };

export function deletionStatusCopy(deletion: MobileAccountDeletionStatus) {
  switch (deletion.requestState) {
    case "not_requested":
      return "削除リクエストはまだ開始されていません。";
    case "requested":
      return "削除リクエストを受け付けました。内容を確認後、サポート側で安全に進めます。";
    case "confirmed":
      return "削除リクエストの確認が完了しています。実際の削除は別の安全な手順で進めます。";
    case "processing":
      return "削除リクエストは確認中です。";
    case "completed":
      return "削除リクエストは完了として記録されています。";
    case "cancelled":
      return "削除リクエストは取り消されています。必要に応じて、もう一度申し込めます。";
    case "expired":
      return "削除リクエストの有効期限が切れています。あらためて申し込めます。";
    default:
      return "削除リクエストはサポート側で確認中です。";
  }
}

export function deletionRequestActionLabel(
  deletion: MobileAccountDeletionStatus,
  isSubmitting: boolean
) {
  if (isSubmitting) {
    return "削除リクエストを開始しています…";
  }

  switch (deletion.requestState) {
    case "cancelled":
      return "もう一度削除を申し込む";
    case "expired":
      return "削除をあらためて申し込む";
    default:
      return "アカウント削除を開始";
  }
}

export function AccountDeletionRequestControls({
  deletion,
  isSubmitting,
  onStart
}: {
  deletion: MobileAccountDeletionStatus;
  isSubmitting: boolean;
  onStart: () => void;
}) {
  if (!canStartMobileAccountDeletionRequest(deletion.requestState)) {
    return null;
  }

  return (
    <button type="button" disabled={isSubmitting} onClick={onStart}>
      {deletionRequestActionLabel(deletion, isSubmitting)}
    </button>
  );
}

export function AccountDeletionScreen({
  api,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [state, setState] = useState<DeletionState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    if (!isOnline) {
      return () => {
        active = false;
      };
    }

    void api.getAccountDeletionStatus().then((result) => {
      if (!active) {
        return;
      }
      setState(result.kind === "success" ? { kind: "ready", deletion: result } : { kind: "error", error: result });
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, reloadKey]);

  async function startDeletionRequest() {
    if (!isOnline || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const result = await api.createAccountDeletionRequest();
    setState(result.kind === "success" ? { kind: "ready", deletion: result } : { kind: "error", error: result });
    setIsSubmitting(false);
  }

  async function openDeletionInformation() {
    setLegalError(null);
    try {
      await openTrustedLegalPage("accountDeletionInfo");
    } catch {
      setLegalError("削除に関する説明ページを開けませんでした。通信状態を確認してもう一度お試しください。");
    }
  }

  const visibleState: DeletionState = isOnline
    ? state
    : { kind: "error", error: { kind: "offline" } };
  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading
        eyebrow="Account deletion"
        title="アカウント削除"
        detail="アカウントと関連データの削除手続きを開始できます。完了まで時間がかかる場合があります。"
      />
      <p className="scope-note">クローンボイスだけを削除する場合は、Settings の「Voice data を管理」から進めてください。この画面のアカウント削除とは別の手続きです。</p>

      {visibleState.kind === "loading" ? <LoadingState label="削除リクエストの状況を確認しています…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? (
        <div className="settings-stack">
          <div className="auth-notice" role="status">{deletionStatusCopy(visibleState.deletion)}</div>
          <AccountDeletionRequestControls
            deletion={visibleState.deletion}
            isSubmitting={isSubmitting}
            onStart={() => void startDeletionRequest()}
          />
        </div>
      ) : null}

      <button type="button" className="secondary-button" onClick={() => void openDeletionInformation()}>
        削除について詳しく見る
      </button>
      <button type="button" className="text-button" onClick={() => onNavigate({ name: "settings" })}>
        Settings に戻る
      </button>
      {legalError ? <div className="auth-error" role="alert">{legalError}</div> : null}
    </section>
  );
}
