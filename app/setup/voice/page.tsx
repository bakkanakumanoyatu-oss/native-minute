import Link from "next/link";
import { redirect } from "next/navigation";
import { pickRecentScriptCandidate } from "@/lib/launchpad";
import { buildLoginHref, getOptionalInternalPath } from "@/lib/navigation";
import { getScriptListenPath } from "@/lib/script-routes";
import { getAuthState } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateVoiceForm } from "@/components/voice/create-voice-form";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";
import { VoiceConsentForm } from "@/components/voice/voice-consent-form";
import { getVoiceSetupState } from "@/services/voice";
import { listScripts } from "@/services/scripts/scripts.service";
import type { VoiceProviderRequirements } from "@/providers/voice";

function getProviderFallbackSteps(requirements: VoiceProviderRequirements) {
  const fallbackProvider = requirements.recommendedDevelopmentFallbackProvider;

  if (!fallbackProvider) {
    return [];
  }

  return [
    `\`.env.local\` の \`VOICE_PROVIDER\` を \`${fallbackProvider}\` に戻す。`,
    "開発サーバーを再起動する。",
    `\`/setup/voice\` に戻り、${fallbackProvider} の同意記録と voice 作成を済ませて main loop を再開する。`
  ];
}

function getProviderRequirementSummary(requirements: VoiceProviderRequirements) {
  if (requirements.requiresConsentRecording && requirements.requiresSampleAudio) {
    return `${requirements.voiceLabel} では、同意録音とお手本ボイス用の録音が必要です。どちらもこの画面で app-owned storage に保存してから provider に渡します。`;
  }

  if (requirements.requiresConsentRecording) {
    return `${requirements.voiceLabel} では、同意録音が必要です。この画面で app-owned storage に保存してから provider に渡します。`;
  }

  if (requirements.requiresSampleAudio) {
    return `${requirements.voiceLabel} では、お手本ボイス用の録音が必要です。voice 作成前に app-owned storage へ保存した参照を使います。`;
  }

  return null;
}

function getVoiceSetupRecoverySummary(input: {
  providerSupported: boolean;
  providerStatusMessage: string | null;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
  hasSuggestedScript: boolean;
}) {
  if (!input.providerSupported) {
    return input.providerStatusMessage ?? "voice provider の前提が不足しているので、listen に進む前に設定を見直す必要があります。";
  }

  if (!input.hasConsent) {
    return "voice はまだ作れません。先に同意を記録し、そのあと voice を 1 つ作れば listen に進めます。";
  }

  if (!input.hasDefaultVoice) {
    return "同意は済んでいます。次は voice を 1 つ作れば、listen に進む前提が整います。";
  }

  if (!input.hasSuggestedScript) {
    return "voice の前提は整っています。次は最初の script を 1 本作り、そのまま listen に進めます。";
  }

  return "voice の前提は整っています。次に開く候補 script を確認してから listen に進めます。";
}

function getProviderReadinessSummary(input: {
  provider: string;
  providerReadiness: string;
  providerSupported: boolean;
  providerMessage: string | null;
}) {
  if (!input.providerSupported) {
    return input.providerMessage ?? "provider 前提が不足しています。";
  }

  if (input.provider === "openai") {
    return "この voice provider の repo-side 前提はそろっています。v1 mainline は ElevenLabs を主軸にするため、OpenAI voice は追加確認が必要な provider として扱います。";
  }

  if (input.provider === "elevenlabs") {
    return "ElevenLabs のお手本ボイス作成と voice clone の前提はそろっています。次に失敗した場合だけ、sample upload / voice clone / protected replay のどこで止まったかを見ます。";
  }

  if (input.providerReadiness === "ready") {
    return "provider 前提はそろっています。";
  }

  return input.providerMessage ?? "provider 前提を確認してください。";
}

function getProviderManualSmokeChecklist(input: {
  provider: string;
  providerSupported: boolean;
  hasDefaultVoice: boolean;
}) {
  if (!input.providerSupported || input.hasDefaultVoice) {
    return [];
  }

  if (input.provider === "elevenlabs") {
    return [
      "この画面の Provider readiness がすべて読めることを確認してから sample upload -> voice clone を 1 回だけ試す。",
      "失敗した場合は request id と failure point を見て、sample upload / voice clone reject / verification required のどこで止まったかを切り分ける。",
      "voice clone が通ったら、そのまま listen に進み、provider 直 URL ではなく protected replay 経由で TTS を 1 回だけ試す。"
    ];
  }

  if (input.provider === "openai") {
    return [
      "v1 mainline では ElevenLabs を voice provider の主軸にします。",
      "OpenAI voice を試す場合は、別 smoke として entitlement / provider contract / listen の failure point を切り分けます。",
      "失敗時は main loop を止めず、必要なら VOICE_PROVIDER=mock に戻して練習 flow を継続します。"
    ];
  }

  return [];
}

function getVoiceReadyActionState(input: {
  requestedNextPath: string | null;
  candidateScript: { id: string; title: string } | null;
}) {
  const alternateAction =
    input.requestedNextPath && input.candidateScript
      ? {
          label: "候補の script で listen",
          href: getScriptListenPath(input.candidateScript.id)
        }
      : null;

  return {
    primaryHref: input.requestedNextPath ?? (input.candidateScript ? getScriptListenPath(input.candidateScript.id) : "/scripts/new"),
    primaryLabel: input.requestedNextPath
      ? "前の画面に戻る"
      : input.candidateScript
        ? "候補の script で listen"
        : "最初の script を作る",
    summary: input.requestedNextPath
      ? "voice の準備は完了です。いまは元の画面に戻って main loop を再開できます。"
      : input.candidateScript
        ? "voice の準備は完了です。次は script を 1 つ選び、listen から main loop に入ります。"
        : "voice の準備は完了です。次は最初の script を作って listen に進みます。",
    alternateAction
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
        <StateStepSection
          title="voice 設定に進む前に前提確認が必要な状態"
          summary="いまは見本確認の準備に進む段階ではなく、Supabase の前提を整える段階です。"
          tone="alert"
        />
        <StateStepSection
          eyebrow="Recovery plan"
          title="Supabase の設定を確認する"
          summary={authState.message}
          tone="alert"
        />
        <StateActionSection
          eyebrow="Next action"
          title="次に押す操作を決める"
          summary="まず login か設定確認に進み、voice 設定へ戻るのは復旧後で十分です。"
          actions={[
            { label: "login", href: buildLoginHref(requestedNextPath, "supabase_not_configured", "/setup/voice"), tone: "primary" }
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="設定・管理"
          actions={[
            { label: "home", href: "/" }
          ]}
        />
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
  const providerReadinessSummary = getProviderReadinessSummary({
    provider: state.provider,
    providerReadiness: state.providerReadiness,
    providerSupported: state.providerSupported,
    providerMessage: state.providerMessage
  });
  const readyAction = getVoiceReadyActionState({
    requestedNextPath,
    candidateScript
  });
  const fallbackSteps = getProviderFallbackSteps(state.providerRequirements);
  const fallbackProvider = state.providerRequirements.recommendedDevelopmentFallbackProvider ?? "mock";
  const providerRequirementSummary = getProviderRequirementSummary(state.providerRequirements);
  const providerManualSmokeChecklist = getProviderManualSmokeChecklist({
    provider: state.provider,
    providerSupported: state.providerSupported,
    hasDefaultVoice: Boolean(state.defaultVoice)
  });
  const readyNextSummary = !state.consent
    ? "まず同意を記録し、必要なら同意録音もここで保存します。"
    : !state.defaultVoice
      ? "同意は完了しています。次は voice を作成します。"
      : readyAction.summary;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.94))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">声の準備</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">自分の声でお手本ボイスを作る</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-ink-700">
          ここでは、お手本ボイスに使う自分の声を準備します。普段の練習では必要な時だけここに戻ります。
        </p>
        <details className="mt-4 max-w-3xl rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700">
          <summary className="cursor-pointer font-semibold text-ink-800">詳しい設定を見る</summary>
          <div className="mt-3 space-y-2">
            {providerRequirementSummary ? <p>{providerRequirementSummary}</p> : null}
            {state.providerRequirements.entitlementSensitive ? (
              <p>
                {`${state.providerRequirements.providerLabel} 側の voice 作成権限で止まる場合があります。その場合は auth や upload ではなく provider entitlement を確認し、練習を先に進めるなら \`VOICE_PROVIDER=${fallbackProvider}\` に戻します。`}
              </p>
            ) : null}
            <p>v1 mainline の voice provider は ElevenLabs です。OpenAI は transcription / script generation / coaching 側で使います。</p>
          </div>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section data-testid="voice-setup-state" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">今やること</h2>
          <dl className="mt-4 space-y-3 text-sm leading-6 text-ink-700">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">同意</dt>
              <dd>{state.consent ? "完了" : "未完了"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">お手本ボイスの声</dt>
              <dd>{state.defaultVoice ? state.defaultVoice.label : "未作成"}</dd>
            </div>
          </dl>
          {!state.providerSupported ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {state.providerMessage}
            </p>
          ) : null}
          <p className="mt-4 text-sm leading-6 text-ink-600">{readyStateSummary}</p>
          <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <summary className="cursor-pointer font-semibold text-ink-800">詳しい状態を見る</summary>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-ink-500">voice provider</dt>
                <dd>{state.provider}</dd>
              </div>
            </dl>
            <p className="mt-3">{providerReadinessSummary}</p>
            <ul className="mt-3 space-y-2">
              {state.providerDiagnostics.map((diagnostic) => (
                <li key={diagnostic.key} className="flex gap-3">
                  <span className={`mt-[2px] inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    diagnostic.ok
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {diagnostic.ok ? "OK" : "!"}
                  </span>
                  <span>
                    <span className="font-medium text-ink-900">{diagnostic.label}:</span> {diagnostic.message}
                  </span>
                </li>
              ))}
            </ul>
            {providerManualSmokeChecklist.length > 0 ? (
              <div data-testid="voice-provider-preflight" className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Manual smoke checklist</p>
                <ol className="mt-3 space-y-2">
                  {providerManualSmokeChecklist.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="mt-[2px] inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-ink-50 text-[10px] font-semibold text-ink-700">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </details>
        </section>

        <section data-testid="voice-setup-next-step" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">次にやること</h2>
          <p className="mt-3 text-sm leading-6 text-ink-600">{readyNextSummary}</p>
        </section>
      </div>

      {!state.providerSupported ? (
        <div className="space-y-4">
          <StateStepSection
            title="voice 設定を続けられない状態"
            summary="現在の provider 設定では voice 設定を続けられません。いまは voice を作る前に provider 側を確認する段階です。"
            tone="alert"
          />
          <StateActionSection
            eyebrow="Next action"
            title="次に押す操作を決める"
            summary="いまは listen に進む前提が足りません。まず設定方針を見直し、voice provider を整えてから戻ります。"
            actions={[
              { label: "home", href: "/", tone: "primary" },
              { label: "scripts", href: "/scripts" }
            ]}
          />
          <StateActionSection
            eyebrow="Other actions"
            title="設定・管理"
            summary="ログイン状態や main loop 側を確認したいときだけ使います。"
            actions={[
              { label: "login", href: buildLoginHref("/setup/voice", "login_required", "/setup/voice") },
              { label: "progress", href: "/progress" }
            ]}
          />
        </div>
      ) : !state.consent ? (
        <section data-testid="voice-consent-section" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">1. 自分の声を使う準備</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">お手本ボイスを作るための同意を保存します。必要な場合は、自分の声の録音ファイルもここで選びます。</p>
          <div className="mt-6">
            <VoiceConsentForm requirements={state.providerRequirements} />
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次にやること</p>
            <p className="mt-2">同意を保存すると、この画面でそのままお手本ボイス用の声を作れます。</p>
            {state.providerRequirements.entitlementSensitive ? (
              <details className="mt-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-ink-600">
                <summary className="cursor-pointer font-semibold text-ink-800">provider 権限で止まる場合</summary>
                <p className="mt-2">
                  {state.providerRequirements.voiceLabel} の voice 作成権限が無い環境では、provider-side の同意登録またはその次の voice 作成で止まります。その場合は auth や upload ではなく entitlement 側の不足を先に確認します。
                </p>
              </details>
            ) : null}
          </div>
          <StateActionSection
            eyebrow="Other actions"
            title="設定・管理"
            summary="voice を作る前でも script 一覧や home は確認できますが、listen に進むには先に同意が必要です。"
            actions={[
              { label: "scripts", href: "/scripts" },
              { label: "home", href: "/" }
            ]}
          />
        </section>
      ) : null}

      {state.providerSupported && state.consent && !state.defaultVoice ? (
        <section data-testid="voice-create-section" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">2. お手本ボイス用の声を作る</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">録音した自分の声を使って、聞く画面で使う声を作ります。</p>
          <div className="mt-6">
            <CreateVoiceForm consentId={state.consent.id} requirements={state.providerRequirements} />
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次にやること</p>
            <p className="mt-2">声を作成すると、次はお手本を聞いてまねる画面へ進めます。</p>
            {state.providerRequirements.entitlementSensitive ? (
              <details className="mt-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-ink-600">
                <summary className="cursor-pointer font-semibold text-ink-800">provider 権限で止まる場合</summary>
                <p className="mt-2">
                  {`Your organization does not have access to this endpoint. のような失敗は、実装や auth ではなく ${state.providerRequirements.voiceLabel} の entitlement 不足として扱います。継続して main loop を進めたい場合は \`VOICE_PROVIDER=${fallbackProvider}\` に戻し、voice 作成は権限付与後に再開してください。`}
                </p>
              </details>
            ) : null}
            {state.provider === "elevenlabs" ? (
              <details className="mt-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-ink-600">
                <summary className="cursor-pointer font-semibold text-ink-800">ElevenLabs で止まる場合</summary>
                <p className="mt-2">
                  ElevenLabs では sample download / voice clone reject / verification required に分けて見ます。失敗時は auth や同意録音ではなく、sample と provider response のどちらで止まったかを優先して確認します。
                </p>
              </details>
            ) : null}
          </div>
          <StateActionSection
            eyebrow="Other actions"
            title="設定・管理"
            summary="script を先に確認したいときだけ使います。listen に進むには voice 作成まで終えておく必要があります。"
            actions={[
              { label: "scripts", href: "/scripts" },
              { label: "progress", href: "/progress" }
            ]}
          />
        </section>
      ) : null}

      {state.providerRequirements.entitlementSensitive && !state.defaultVoice ? (
        <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <details>
            <summary className="cursor-pointer text-lg font-semibold text-ink-900">Recovery plan / provider 権限で止まる場合</summary>
            <p className="mt-3 text-sm leading-6 text-ink-600">
              {`${state.providerRequirements.voiceLabel} endpoint の entitlement が無い環境では、この画面の実装は通っても provider-side の同意登録または voice 作成が止まります。開発を止めない最短手順は ${fallbackProvider} へ一旦戻すことです。`}
            </p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-ink-700">
              {fallbackSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-[2px] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-ink-50 text-xs font-semibold text-ink-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
              {`voice 作成は entitlement 付与後にこの画面から再開できます。いまは auth や upload を疑うより、${fallbackProvider} provider で main loop を進める判断を優先します。`}
            </div>
          </details>
        </section>
      ) : null}

      {state.provider === "elevenlabs" && state.providerSupported && !state.defaultVoice ? (
        <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <details>
            <summary className="cursor-pointer text-lg font-semibold text-ink-900">Recovery plan / ElevenLabs で止まる場合</summary>
            <p className="mt-3 text-sm leading-6 text-ink-600">
              ElevenLabs voice clone が止まった場合は、まず failure point を切り分けます。current repo では verification pending voice を保存しないため、provider 側で追加操作が必要な失敗はその場で fail-fast します。
            </p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-ink-700">
              <li className="flex gap-3">
                <span className="mt-[2px] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-ink-50 text-xs font-semibold text-ink-700">1</span>
                <span>sample download / sample reject と出たら、お手本ボイス用の録音を再アップロードして形式・長さ・内容を見直す。</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[2px] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-ink-50 text-xs font-semibold text-ink-700">2</span>
                <span>verification required と出たら、ElevenLabs 側で verification を完了してからこの画面で作り直す。</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[2px] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-ink-50 text-xs font-semibold text-ink-700">3</span>
                <span>{`いま main loop を優先するなら \`.env.local\` の \`VOICE_PROVIDER\` を \`${fallbackProvider}\` に戻して再起動し、mock voice で続ける。`}</span>
              </li>
            </ol>
          </details>
        </section>
      ) : null}

      {state.providerSupported && state.defaultVoice ? (
        <section data-testid="voice-ready-block" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">お手本を聞けます</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            現在の voice は <span className="font-semibold text-ink-900">{state.defaultVoice.label}</span> です。
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {candidateScript
              ? requestedNextPath
                ? "元の画面に戻る導線を優先しています。別の script に切り替えたいときは scripts に戻って選び直せます。"
                : `次に開く候補は「${candidateScript.title}」です。これは直近で触った script を入口候補として 1 本だけ出しているだけなので、別の script にしたいときは scripts に戻って選び直せます。`
              : requestedNextPath
                ? "元の画面に戻る導線を優先しています。"
                : "まだ script がないので、次は最初の script を作ってから listen に進みます。"}
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Launchpad</p>
            <p className="mt-2">
              {requestedNextPath
                ? "再開導線は保ったままです。前の画面に戻るか、候補 script から通常利用に戻るかのどちらかをここで選べます。"
                : candidateScript
                  ? "初回利用でも再利用でも、まずは 1 本だけ選べば十分です。迷ったら候補 script の listen から入り、違う台本にしたいときだけ scripts に戻ります。"
                  : "まだ最初の script がないので、ここでは作成から始めるのが最短です。"}
            </p>
          </div>
          <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-xs leading-5 text-ink-600">
            <summary className="cursor-pointer font-semibold text-ink-800">voice の詳細を見る</summary>
            <p className="mt-2">provider: {state.defaultVoice.provider}</p>
            <p className="mt-1">設定済みなら、普段の practice flow では provider を意識せず listen に進めます。</p>
          </details>
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
              scripts
            </Link>
            <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
              progress
            </Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
