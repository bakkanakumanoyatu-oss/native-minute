import { useCallback, useEffect, useState } from "react";
import type {
  MobileProcessingConsent,
  MobileProcessingConsentRequestState,
  MobileVoiceSetupRequestState,
  MobileVoiceSetup
} from "../lib/api";
import { openTrustedLegalPage } from "../lib/trusted-legal-navigation";
import type { PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, ScreenHeading } from "./ScreenParts";

type SettingsState =
  | { kind: "loading" }
  | {
      kind: "ready";
      pronunciationConsent: MobileProcessingConsent;
      voiceCloningConsent: MobileProcessingConsent;
      voiceSetup: MobileVoiceSetup;
    }
  | { kind: "error"; error: PracticeRequestFailure };

function consentCopy(status: MobileProcessingConsent["status"]) {
  switch (status) {
    case "accepted":
      return "同意済み";
    case "withdrawn":
      return "同意を取り消しました";
    case "required":
      return "同意が必要です";
  }
}

function voiceSetupCopy(status: MobileVoiceSetup["status"]) {
  switch (status) {
    case "ready":
      return "お手本ボイスを利用できます";
    case "consent_required":
      return "同意が必要です";
    case "sample_required":
      return "声の準備が必要です";
  }
}

type SettingsLoadResult = {
  pronunciationConsent: MobileProcessingConsentRequestState;
  voiceCloningConsent: MobileProcessingConsentRequestState;
  voiceSetup: MobileVoiceSetupRequestState;
};

export function resolveSettingsState({
  pronunciationConsent,
  voiceCloningConsent,
  voiceSetup
}: SettingsLoadResult): SettingsState {
  if (pronunciationConsent.kind !== "success") {
    return { kind: "error", error: pronunciationConsent };
  }

  if (voiceCloningConsent.kind !== "success") {
    return { kind: "error", error: voiceCloningConsent };
  }

  if (voiceSetup.kind !== "success") {
    return { kind: "error", error: voiceSetup };
  }

  return {
    kind: "ready",
    pronunciationConsent,
    voiceCloningConsent,
    voiceSetup
  };
}

export function navigateToAccountDeletion(onNavigate: (route: PracticeRoute) => void) {
  onNavigate({ name: "account_deletion" });
}

export function SettingsAccountDataSection({
  pronunciationConsent,
  voiceCloningConsent,
  onNavigate
}: {
  pronunciationConsent: MobileProcessingConsent;
  voiceCloningConsent: MobileProcessingConsent;
  onNavigate: (route: PracticeRoute) => void;
}) {
  return (
    <section className="settings-section">
      <p className="eyebrow">Account / Data</p>
      <h2>同意とアカウント</h2>
      <dl className="settings-status-list">
        <div><dt>録音と発音評価</dt><dd>{consentCopy(pronunciationConsent.status)}</dd></div>
        <div><dt>クローンボイス</dt><dd>{consentCopy(voiceCloningConsent.status)}</dd></div>
      </dl>
      <button type="button" onClick={() => navigateToAccountDeletion(onNavigate)}>
        アカウント削除へ
      </button>
    </section>
  );
}

export function SettingsScreen({
  api,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const [state, setState] = useState<SettingsState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
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

    void Promise.all([
      api.getPronunciationConsent(),
      api.getVoiceCloningConsent(),
      api.getVoiceSetup()
    ]).then(([pronunciationConsent, voiceCloningConsent, voiceSetup]) => {
      if (!active) {
        return;
      }

      setState(resolveSettingsState({ pronunciationConsent, voiceCloningConsent, voiceSetup }));
    });

    return () => {
      active = false;
    };
  }, [api, isOnline, reloadKey]);

  async function openLegal(page: "privacy" | "terms" | "support") {
    setLegalError(null);
    try {
      await openTrustedLegalPage(page);
    } catch {
      setLegalError("このページを開けませんでした。通信状態を確認してもう一度お試しください。");
    }
  }

  const visibleState: SettingsState = isOnline
    ? state
    : { kind: "error", error: { kind: "offline" } };

  return (
    <section className="intro-card practice-card" aria-live="polite">
      <ScreenHeading
        eyebrow="Settings"
        title="設定とサポート"
        detail="お手本ボイス、同意、アカウントとデータの手続きを確認できます。"
      />

      {visibleState.kind === "loading" ? <LoadingState label="設定を読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}

      {visibleState.kind === "ready" ? (
        <div className="settings-stack">
          <section className="settings-section">
            <p className="eyebrow">Voice</p>
            <h2>お手本ボイス</h2>
            <p>{voiceSetupCopy(visibleState.voiceSetup.status)}</p>
            <button type="button" className="secondary-button" onClick={() => onNavigate({ name: "voice_setup" })}>
              Voice setup を開く
            </button>
          </section>

          <SettingsAccountDataSection
            pronunciationConsent={visibleState.pronunciationConsent}
            voiceCloningConsent={visibleState.voiceCloningConsent}
            onNavigate={onNavigate}
          />

          <section className="settings-section">
            <p className="eyebrow">Legal / Help</p>
            <h2>法律・サポート</h2>
            <p>各ページはシステムブラウザで開きます。</p>
            <div className="settings-link-actions">
              <button type="button" className="secondary-button" onClick={() => void openLegal("privacy")}>Privacy</button>
              <button type="button" className="secondary-button" onClick={() => void openLegal("terms")}>Terms</button>
              <button type="button" className="secondary-button" onClick={() => void openLegal("support")}>Support</button>
            </div>
            {legalError ? <div className="auth-error" role="alert">{legalError}</div> : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
