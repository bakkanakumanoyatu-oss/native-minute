import Link from "next/link";
import { redirect } from "next/navigation";
import { pickRecentScriptCandidate } from "@/lib/launchpad";
import { buildLoginHref, getOptionalInternalPath } from "@/lib/navigation";
import { getScriptListenPath } from "@/lib/script-routes";
import { getAuthState } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateVoiceForm } from "@/components/voice/create-voice-form";
import { VoiceConsentForm } from "@/components/voice/voice-consent-form";
import { getVoiceSetupState } from "@/services/voice";
import { listScripts } from "@/services/scripts/scripts.service";
import type { Json } from "@/types/database";

function getVoiceSetupRecoverySummary(input: {
  providerSupported: boolean;
  providerStatusMessage: string | null;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
  hasSuggestedScript: boolean;
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

  if (!input.hasSuggestedScript) {
    return "声の準備は完了です。次は最初の練習を作ります。";
  }

  return "声の準備は完了です。練習を選んで、お手本を聞けます。";
}

function getVoiceReadyActionState(input: {
  requestedNextPath: string | null;
  candidateScript: { id: string; title: string } | null;
}) {
  const alternateAction =
    input.requestedNextPath && input.candidateScript
      ? {
          label: "候補の練習で聞く",
          href: getScriptListenPath(input.candidateScript.id)
        }
      : null;

  return {
    primaryHref: input.requestedNextPath ?? (input.candidateScript ? getScriptListenPath(input.candidateScript.id) : "/scripts/new"),
    primaryLabel: input.requestedNextPath
      ? "前の画面に戻る"
      : input.candidateScript
        ? "候補の練習で聞く"
        : "最初の練習を作る",
    summary: input.requestedNextPath
      ? "声の準備は完了です。元の画面に戻れます。"
      : input.candidateScript
        ? "声の準備は完了です。次は練習を1つ選んで、お手本を聞きます。"
        : "声の準備は完了です。次は最初の練習を作ります。",
    alternateAction
  };
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
  const [state, scripts] = await Promise.all([
    getVoiceSetupState(supabase, authState.user.id),
    listScripts(supabase, authState.user.id)
  ]);
  const candidateScript = pickRecentScriptCandidate(scripts);
  const readyStateSummary = getVoiceSetupRecoverySummary({
    providerSupported: state.providerSupported,
    providerStatusMessage: state.providerMessage,
    hasConsent: Boolean(state.consent),
    hasDefaultVoice: Boolean(state.defaultVoice),
    hasSuggestedScript: Boolean(candidateScript)
  });
  const readyAction = getVoiceReadyActionState({
    requestedNextPath,
    candidateScript
  });
  const readyNextSummary = !state.consent
      ? "まず自分の声を使う準備をします。"
    : !state.defaultVoice
      ? "次は、お手本ボイスに使う自分の声を登録します。"
      : readyAction.summary;
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

      <div className="grid gap-4 lg:grid-cols-2">
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
          </dl>
          {!state.providerSupported ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {state.providerMessage}
            </p>
          ) : null}
          <p className="mt-4 text-sm leading-6 text-ink-600">{readyStateSummary}</p>
        </section>

        <section data-testid="voice-setup-next-step" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">次の入口</h2>
          <p className="mt-3 text-sm leading-6 text-ink-600">{readyNextSummary}</p>
        </section>
      </div>

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
          <h2 className="text-lg font-semibold text-ink-900">お手本を聞けます</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            登録済みの声は <span className="font-semibold text-ink-900">{state.defaultVoice.label}</span> です。
          </p>
          <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--line)] bg-ink-50 p-4 text-sm leading-6 text-ink-700 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">自分の声</p>
              <p className="mt-1 font-semibold text-ink-900">{state.defaultVoice.label}</p>
              <p className="mt-1 text-ink-600">登録 {formatVoiceDate(state.defaultVoice.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">クローン元音声</p>
              <p className="mt-1 font-semibold text-ink-900">{state.defaultVoice.sample_audio_path ? "登録あり" : "表示できる録音情報なし"}</p>
              {consentRecordingInfo ? (
                <p className="mt-1 text-ink-600">
                  同意録音 {consentRecordingInfo.contentType ?? "形式不明"}
                  {consentRecordingInfo.byteLength ? ` / ${consentRecordingInfo.byteLength}` : null}
                </p>
              ) : (
                <p className="mt-1 text-ink-600">ファイル名や長さは保存されていません。</p>
              )}
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {candidateScript
              ? requestedNextPath
                ? "元の画面に戻る導線を優先しています。別の練習に切り替えたいときは練習一覧で選び直せます。"
                : `次に開く候補は「${candidateScript.title}」です。別の練習にしたいときは練習一覧で選び直せます。`
              : requestedNextPath
                ? "元の画面に戻る導線を優先しています。"
                : "まだ練習がないので、次は最初の練習を作ってからお手本を聞きます。"}
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の入口</p>
            <p className="mt-2">
              {requestedNextPath
                ? "前の画面に戻るか、候補の練習へ進むかを選べます。"
                : candidateScript
                  ? "まずは1本だけ選べば十分です。迷ったら候補の練習から入ります。"
                  : "まだ最初の練習がないので、ここでは作成から始めます。"}
            </p>
          </div>
          {state.consent ? (
            <details className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-800">自分の声を再アップロードして作り直す</summary>
              <p className="mt-3 text-sm leading-6 text-ink-600">
                新しい録音からお手本ボイス用の声を作り直します。既存の声は上書きせず、新しく作った声が次のお手本に使われます。
              </p>
              <div className="mt-4">
                <CreateVoiceForm consentId={state.consent.id} requirements={state.providerRequirements} />
              </div>
            </details>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href={readyAction.primaryHref} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white">
              {readyAction.primaryLabel}
            </Link>
            {readyAction.alternateAction ? (
              <Link href={readyAction.alternateAction.href} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
                {readyAction.alternateAction.label}
              </Link>
            ) : null}
            <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
              練習一覧
            </Link>
            <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
              成果
            </Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
