import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref, buildScriptListenVoiceSetupHref } from "@/lib/navigation";
import { createPracticeChunks } from "@/lib/script-practice-chunks";
import { getDuplicateScriptPath, getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getGuidanceActionBadgeLabel, getGuidanceToneClasses } from "@/lib/guidance-ui";
import { getListenRecoveryGuidance } from "@/lib/listen-recovery-guidance";
import { getProgressOverview } from "@/services/progress";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScript } from "@/services/scripts/scripts.service";
import { getCachedListenAudio, getVoiceSetupState } from "@/services/voice";
import { ListenPanel } from "@/components/voice/listen-panel";
import { ScriptLoopStatusCard } from "@/components/guidance/script-loop-status-card";
import { ScriptPracticeChunks } from "@/components/guidance/script-practice-chunks";
import { SavedScriptFreezeCandidateCheck } from "@/components/scripts/saved-script-freeze-candidate-check";
import { VoiceGenerationPreflightNotice } from "@/components/scripts/voice-generation-preflight-notice";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";

type PageParams = {
  params:
    | {
        id: string;
      }
    | Promise<{
        id: string;
      }>;
  searchParams?:
    | {
        created?: string;
      }
    | Promise<{
        created?: string;
      }>;
};

export default async function ListenPage({ params, searchParams }: PageParams) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const user = await getCurrentUser();
  const listenHref = getScriptListenPath(id);
  const recordHref = getScriptRecordPath(id);
  const voiceSetupHref = buildScriptListenVoiceSetupHref(id, "/scripts");
  const showCreatedHandoff = resolvedSearchParams?.created === "1";

  if (!user) {
    redirect(buildLoginHref(listenHref, "login_required", "/scripts"));
  }

  const supabase = createSupabaseServerClient();
  const script = await getScript(supabase, user.id, id);

  if (!script) {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="見本確認に進む script が見つからない状態"
          summary="この listen は開けましたが、対象 script は取得できませんでした。いまは script を選び直して main loop に戻る段階です。"
          tone="alert"
        />
        <StateActionSection
          eyebrow="Next action"
          title="戻る先を決める"
          summary="まず scripts に戻って対象を選び直します。"
          actions={[
            { label: "scripts", href: "/scripts", tone: "primary" }
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="補助導線"
          summary="新しい script を作るか、直近の流れを見たいときだけ使います。"
          actions={[
            { label: "新しい script を作る", href: "/scripts/new" },
            { label: "progress", href: "/progress" }
          ]}
        />
      </section>
    );
  }

  const [voiceSetup, cachedAudio, overview] = await Promise.all([
    getVoiceSetupState(supabase, user.id),
    getCachedListenAudio(supabase, user.id, script.id),
    getProgressOverview(supabase, user.id)
  ]);
  const progressItem = overview.scripts.find((item) => item.script.id === id) ?? null;
  const latestReviewHref = progressItem?.latestTake ? getScriptReviewPath(script.id, progressItem.latestTake.id) : null;
  const practiceChunks = createPracticeChunks(script.content);
  const practiceFocusWords = getPracticeFocusWords(progressItem);
  const listenBlockedKind = !voiceSetup.providerSupported
    ? "provider_unavailable"
    : !voiceSetup.consent
      ? "consent_required"
      : !voiceSetup.defaultVoice
        ? "voice_required"
        : null;
  const practiceContext =
    progressItem
      ? {
          takeCount: progressItem.takeCount,
          improvementTrend: progressItem.improvementTrend,
          latestTake: progressItem.latestTake
            ? {
                weakWords: progressItem.latestTake.weakWords.map((item) => item.word),
                coachNextStepJa: progressItem.latestTake.coach.nextStepJa,
                coachFocusWords: progressItem.latestTake.coach.focusWords
              }
            : null,
          latestVsBest: progressItem.latestVsBest
            ? {
                regressedWeakWords: progressItem.latestVsBest.regressedWeakWords,
                commonWeakWords: progressItem.latestVsBest.commonWeakWords
              }
            : null
        }
      : null;

  return (
    <section className="space-y-6">
      <div data-testid="listen-practice-first-view" className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.15),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.92))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Listen</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">見本を短く聞いて、record へ</h1>
        <p className="mt-3 text-base font-semibold text-ink-800">{script.title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
          {showCreatedHandoff ? "保存できました。次は" : "まずは"}見本音声を 1〜2 chunk だけまねます。違和感がなければ、聞き込みすぎず record に進めば十分です。
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#listen-panel-shell" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-white shadow-sm sm:w-auto">
            見本音声を聞く
          </a>
          <Link href={recordHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800 sm:w-auto">
            record へ進む
          </Link>
        </div>
        <details className="mt-5 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">台本を見る / 直したいとき</summary>
          <p className="mt-3 text-sm leading-6 text-ink-700">{script.content}</p>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            台本を直したい場合は、履歴の意味を崩さないように in-place edit ではなく複製から調整します。
          </p>
          <Link href={getDuplicateScriptPath(script.id)} className="mt-3 inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
            複製して直す
          </Link>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">見本音声の確認</h2>
          {listenBlockedKind ? (
            <>
              <ListenRecoverySection
                kind={listenBlockedKind}
                hasSavedAudio={Boolean(cachedAudio)}
                guidance={getListenRecoveryGuidance({
                  kind: listenBlockedKind,
                  message:
                    listenBlockedKind === "provider_unavailable"
                      ? voiceSetup.providerMessage
                      : listenBlockedKind === "consent_required"
                        ? "まだ consent が完了していません。まず `/setup/voice` で同意を記録してください。"
                        : "consent は完了していますが、voice がまだありません。見本音声を作る前に voice を作成してください。",
                  hasAudio: Boolean(cachedAudio),
                  practiceContext
                })}
                ctaHref={voiceSetupHref}
                latestReviewHref={latestReviewHref}
              />
              {cachedAudio ? (
                <div id="listen-panel-shell" data-testid="listen-panel-shell" className="mt-6">
                  <ListenPanel
                    scriptId={script.id}
                    initialAudioUrl={cachedAudio.audioUrl}
                    initialHasSavedAudio
                    initialVoiceLabel={voiceSetup.defaultVoice?.label ?? cachedAudio.voice.label}
                    initialVoiceId={voiceSetup.defaultVoice?.id ?? null}
                    practiceContext={practiceContext}
                    nextRecordHref={recordHref}
                    canGenerateAudio={false}
                    generateBlockedSummary="保存済みの見本音声はこのまま確認できます。新しい見本音声を作るには、先に voice 設定の前提を整えてください。"
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div id="listen-panel-shell" data-testid="listen-panel-shell" className="mt-6">
              <ListenPanel
                scriptId={script.id}
                initialAudioUrl={cachedAudio?.audioUrl ?? null}
                initialHasSavedAudio={Boolean(cachedAudio)}
                initialVoiceLabel={voiceSetup.defaultVoice.label}
                initialVoiceId={voiceSetup.defaultVoice.id}
                practiceContext={practiceContext}
                nextRecordHref={recordHref}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Current step</h2>
            <p className="mt-3 text-sm leading-6 text-ink-700">
              {getListenSideSummary({
                takeCount: progressItem?.takeCount ?? 0,
                improvementTrend: progressItem?.improvementTrend ?? "insufficient_data",
                isBlocked: Boolean(listenBlockedKind),
                hasSavedAudio: Boolean(cachedAudio),
                hasLatestReview: Boolean(latestReviewHref)
              })}
            </p>
          </div>

          <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">Other actions</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">listen の判断は左側で完結できます。ここでは結果確認や script 管理など、画面外の補助導線だけをまとめています。</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              {latestReviewHref ? (
                <Link href={latestReviewHref} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                  最新結果を見る
                </Link>
              ) : null}
              <Link href={getDuplicateScriptPath(script.id)} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                script を複製
              </Link>
              <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                scripts
              </Link>
              <Link href={voiceSetupHref} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                voice 設定
              </Link>
              <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                progress
              </Link>
            </div>
          </div>
        </div>
      </div>

      <details className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">Details / 区切り・台本チェック・cache の前提を見る</summary>
        <div className="mt-5 space-y-5">
          <ScriptPracticeChunks
            testId="listen-practice-chunks"
            chunks={practiceChunks}
            focusWords={practiceFocusWords}
            summary="聞く前に、どこで区切るかだけ決めます。"
            actionCue="まずは 1〜2 chunk だけまねてから record へ"
          />

          <SavedScriptFreezeCandidateCheck script={script} />

          <VoiceGenerationPreflightNotice
            provider={voiceSetup.provider}
            providerReadiness={voiceSetup.providerReadiness}
            providerSupported={voiceSetup.providerSupported}
            providerMessage={voiceSetup.providerMessage}
            hasConsent={Boolean(voiceSetup.consent)}
            defaultVoiceLabel={voiceSetup.defaultVoice?.label ?? null}
            cachedVoiceLabel={cachedAudio?.voice.label ?? null}
            hasCachedAudio={Boolean(cachedAudio)}
            canGenerateAudio={!listenBlockedKind}
          />

          <ScriptLoopStatusCard
            currentStep="listen"
            takeCount={progressItem?.takeCount ?? 0}
            improvementTrend={progressItem?.improvementTrend ?? "insufficient_data"}
            listenHref={listenHref}
            recordHref={recordHref}
            latestTake={progressItem?.latestTake ?? null}
            latestReviewHref={latestReviewHref}
            blockedSummary={getListenLoopBlockedSummary({
              isBlocked: Boolean(listenBlockedKind),
              hasSavedAudio: Boolean(cachedAudio)
            })}
          />
        </div>
      </details>
    </section>
  );
}

function getPracticeFocusWords(progressItem: Awaited<ReturnType<typeof getProgressOverview>>["scripts"][number] | null) {
  if (!progressItem?.latestTake) {
    return [];
  }

  return Array.from(new Set([
    ...progressItem.latestTake.coach.focusWords,
    ...progressItem.latestTake.weakWords.map((item) => item.word)
  ].map((word) => word.trim()).filter(Boolean))).slice(0, 3);
}

function getListenLoopBlockedSummary(input: {
  isBlocked: boolean;
  hasSavedAudio: boolean;
}) {
  if (input.isBlocked && input.hasSavedAudio) {
    return "いまは listen の前提が一部不足していますが、保存済み見本音声があるためこの script の listen は続けられます。必要なら見本確認のあと record に進み、不足前提はあとで整えられます。";
  }

  if (input.isBlocked) {
    return "いまは listen の前提を整えてから main loop を再開する段階です。復旧後はこの script の listen にそのまま戻れます。";
  }

  return null;
}

function getListenSideSummary(input: {
  takeCount: number;
  improvementTrend: "up" | "down" | "flat" | "insufficient_data";
  isBlocked: boolean;
  hasSavedAudio: boolean;
  hasLatestReview: boolean;
}) {
  if (input.isBlocked && input.hasSavedAudio) {
    return "voice 側の前提は不足していますが、保存済み見本音声があるため listen 自体は続けられる状態です。必要なら見本を確認してから record に進み、不足前提の修正はあとで戻れます。";
  }

  if (input.isBlocked) {
    return "いまは listen を通常どおり続ける前に、voice 側の不足前提を補う段階です。復旧後はこの script の listen から main loop に戻せます。";
  }

  if (input.takeCount === 0) {
    return "この script はまだ未着手です。listen は最初の見本確認だけに使い、十分ならそのまま record に渡すのが最短です。";
  }

  if (input.improvementTrend === "down") {
    return input.hasLatestReview
      ? "直前の結果で少し崩れているので、listen で耳を合わせ直してから record に戻すと自然です。迷ったら最新結果を見返して重点だけ確認できます。"
      : "直前の結果で少し崩れているので、listen で耳を合わせ直してから record に戻すと自然です。";
  }

  if (input.improvementTrend === "up") {
    return input.hasLatestReview
      ? "改善傾向があるので、listen は短く済ませて record に戻る流れが自然です。必要なときだけ最新結果を見返せます。"
      : "改善傾向があるので、listen は短く済ませて record に戻る流れが自然です。";
  }

  return input.hasLatestReview
    ? "大きな崩れは見えていません。listen を短く挟むか、最新結果を見返してから record に戻るかをこの画面で選べます。"
    : "大きな崩れは見えていません。listen を短く挟んだら、そのまま record に戻れば十分です。";
}

function ListenRecoverySection({
  kind,
  hasSavedAudio,
  guidance,
  ctaHref,
  latestReviewHref
}: {
  kind: "provider_unavailable" | "consent_required" | "voice_required";
  hasSavedAudio: boolean;
  guidance: ReturnType<typeof getListenRecoveryGuidance>;
  ctaHref: string;
  latestReviewHref: string | null;
}) {
  const nextActionSummary =
    kind === "provider_unavailable"
      ? hasSavedAudio
        ? "保存済みの見本音声はこのまま確認できます。新しい見本音声を作る前提だけをあとで整えれば十分です。"
        : "まず voice provider の前提を見直し、listen に戻るのは復旧後で十分です。"
      : kind === "consent_required"
        ? hasSavedAudio
          ? "保存済みの見本音声はこのまま確認できます。listen を通常どおり続ける前に、同意だけあとで記録すれば十分です。"
          : "まず同意を記録します。script 一覧には戻れますが、listen を続けるのは同意のあとで十分です。"
        : hasSavedAudio
          ? "保存済みの見本音声はこのまま確認できます。listen を通常どおり続ける前に、voice を 1 つ作れば十分です。"
          : "まず voice を 1 つ作ります。script 一覧には戻れますが、listen を続けるのは voice 作成のあとで十分です。";
  const otherActions =
    kind === "provider_unavailable"
      ? [
          { label: "scripts", href: "/scripts" },
          { label: "home", href: "/" }
        ]
      : [
          { label: "scripts", href: "/scripts" },
          { label: "progress", href: "/progress" }
        ];

  return (
    <>
      <div data-testid="listen-recovery-block" data-kind={kind}>
        <StateStepSection
          title="見本確認の前に立て直しが必要な状態"
          summary="いまは見本音声を再生する段階ではなく、listen を始める前提を整える段階です。"
          tone={guidance.tone}
        />
        <section className={`rounded-[2rem] border px-6 py-6 shadow-sm ${getGuidanceToneClasses(guidance.tone)}`}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Recovery plan</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">{guidance.titleJa}</h2>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(guidance.actionKind)}</p>
          <p className="mt-3 text-sm leading-6 text-ink-800">{guidance.summaryJa}</p>
          <p className="mt-3 text-sm leading-6 text-ink-600">{guidance.reasonJa}</p>
          <p className="mt-3 text-sm leading-6 text-ink-700">この画面での実行指示: {guidance.executionCueJa}</p>
          {guidance.followupCueJa ? <p className="mt-2 text-sm leading-6 text-ink-600">復旧後の listen / record: {guidance.followupCueJa}</p> : null}
          {guidance.focusReasonJa ? <p className="mt-3 text-sm leading-6 text-ink-600">今これを優先する理由: {guidance.focusReasonJa}</p> : null}
          {guidance.focusSummaryJa ? <p className="mt-3 text-sm leading-6 text-ink-700">{guidance.focusSummaryJa}</p> : null}
          {guidance.focusWords.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {guidance.focusWords.map((word) => (
                <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                  {word}
                </span>
              ))}
            </div>
          ) : null}
        </section>
        <StateActionSection
          eyebrow="Next action"
          title="次に押す操作を決める"
          summary={nextActionSummary}
          actions={[
            { label: guidance.primaryActionLabelJa, href: ctaHref, tone: "primary" },
            ...(hasSavedAudio ? [{ label: "保存済み見本を確認する", href: "#listen-panel-shell" }] : []),
            ...(latestReviewHref ? [{ label: "最新結果を見る", href: latestReviewHref }] : [])
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="補助導線"
          summary="前提を整えたあとに main loop へ戻るための補助導線です。"
          actions={otherActions}
        />
      </div>
    </>
  );
}
