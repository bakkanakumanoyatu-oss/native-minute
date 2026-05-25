import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref, getOptionalInternalPath } from "@/lib/navigation";
import { getAuthState } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateVoiceForm } from "@/components/voice/create-voice-form";
import { VoiceConsentForm } from "@/components/voice/voice-consent-form";
import { getVoiceSetupState } from "@/services/voice";
import type { Json } from "@/types/database";

function getVoiceSetupRecoverySummary(input: {
  providerSupported: boolean;
  providerStatusMessage: string | null;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
}) {
  if (!input.providerSupported) {
    return input.providerStatusMessage ?? "お手本ボイスを作る準備が不足しています。";
  }

  if (!input.hasConsent) {
    return "まず自分の声を使う準備をします。そのあと、お手本ボイス用の声を作れます。";
  }

  if (!input.hasDefaultVoice) {
    return "次は、お手本ボイスに使う自分の声を登録します。";
  }

  return "声の準備は完了です。";
}

function formatVoiceDate(value: string | null | undefined) {
  if (!value) {
    return "不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatByteLength(value: Json | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.round(value / 1024)} KB`;
}

function getJsonRecord(value: Json | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Json | undefined>;
}

function getConsentRecordingInfo(metadata: Json) {
  const recording = getJsonRecord(getJsonRecord(metadata)?.recording);

  if (!recording) {
    return null;
  }

  return {
    contentType: typeof recording.contentType === "string" ? recording.contentType : null,
    byteLength: formatByteLength(recording.byteLength)
  };
}

export default async function VoiceSetupPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  const requestedNextPath = getOptionalInternalPath(searchParams?.next);
  const authState = await getAuthState();

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-ink-900">ログイン設定を確認してください</h1>
          <p className="mt-3 text-sm leading-6 text-ink-700">{authState.message}</p>
          <Link href={buildLoginHref(requestedNextPath, "supabase_not_configured", "/setup/voice")} className="mt-5 inline-flex rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
            ログインへ
          </Link>
        </div>
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref(requestedNextPath, "login_required", "/setup/voice"));
  }

  const supabase = createSupabaseServerClient();
  const state = await getVoiceSetupState(supabase, authState.user.id);
  const readyStateSummary = getVoiceSetupRecoverySummary({
    providerSupported: state.providerSupported,
    providerStatusMessage: state.providerMessage,
    hasConsent: Boolean(state.consent),
    hasDefaultVoice: Boolean(state.defaultVoice)
  });
  const consentRecordingInfo = state.consent ? getConsentRecordingInfo(state.consent.metadata) : null;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.94))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">声の準備</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">自分の声でお手本ボイスを作る</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-ink-700">
          ここでは、お手本ボイスに使う自分の声を準備します。普段の練習では必要な時だけここに戻ります。
        </p>
      </div>

      <section data-testid="voice-setup-state" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-900">現在の声の状態</h2>
        <dl className="mt-4 space-y-3 text-sm leading-6 text-ink-700">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">同意</dt>
            <dd>{state.consent ? "完了" : "未完了"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">自分の声</dt>
            <dd>{state.defaultVoice ? state.defaultVoice.label : "未作成"}</dd>
          </div>
          {state.defaultVoice ? (
            <>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">登録</dt>
                <dd>{formatVoiceDate(state.defaultVoice.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">元の録音</dt>
                <dd>{state.defaultVoice.sample_audio_path ? "登録あり" : "表示できる録音情報なし"}</dd>
              </div>
            </>
          ) : null}
          {consentRecordingInfo ? (
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">同意録音</dt>
              <dd>
                {consentRecordingInfo.contentType ?? "形式不明"}
                {consentRecordingInfo.byteLength ? ` / ${consentRecordingInfo.byteLength}` : null}
              </dd>
            </div>
          ) : null}
        </dl>
        {!state.providerSupported ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {state.providerMessage}
          </p>
        ) : null}
        <p className="mt-4 text-sm leading-6 text-ink-600">{readyStateSummary}</p>
      </section>

      {!state.providerSupported ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">声の準備を続けられません</h2>
          <p className="mt-3 text-sm leading-6 text-ink-700">
            {state.providerMessage ?? "声を作るための設定が不足しています。"}
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/scripts" className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-white">練習一覧へ</Link>
            <Link href="/" className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-ink-800">ホームへ</Link>
          </div>
        </div>
      ) : !state.consent ? (
        <section data-testid="voice-consent-section" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">1. 自分の声を使う準備</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">お手本ボイスを作るための同意を保存します。必要な場合は、自分の声の録音ファイルもここで選びます。</p>
          <div className="mt-6">
            <VoiceConsentForm requirements={state.providerRequirements} />
          </div>
        </section>
      ) : null}

      {state.providerSupported && state.consent && !state.defaultVoice ? (
        <section data-testid="voice-create-section" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">2. お手本ボイス用の声を作る</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">録音した自分の声を使って、聞く画面で使う声を作ります。</p>
          <div className="mt-6">
            <CreateVoiceForm consentId={state.consent.id} requirements={state.providerRequirements} />
          </div>
        </section>
      ) : null}

      {state.providerSupported && state.defaultVoice ? (
        <section data-testid="voice-ready-block" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">自分の声を作り直す</h2>
          {state.consent ? (
            <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-800">自分の声を再アップロードして作り直す</summary>
              <p className="mt-3 text-sm leading-6 text-ink-600">
                新しい録音からお手本ボイス用の声を作り直します。既存の声は上書きせず、新しく作った声が次のお手本に使われます。
              </p>
              <div className="mt-4">
                <CreateVoiceForm consentId={state.consent.id} requirements={state.providerRequirements} />
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
