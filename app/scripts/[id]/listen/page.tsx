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
          title="練習する台本が見つからない状態"
          summary="対象の台本を取得できませんでした。練習一覧から選び直します。"
          tone="alert"
        />
        <StateActionSection
          eyebrow="Next action"
          title="戻る先を決める"
          summary="まず練習一覧に戻って対象を選び直します。"
          actions={[
            { label: "練習一覧", href: "/scripts", tone: "primary" }
          ]}
        />
        <StateActionSection
          eyebrow="その他の操作"
          title="設定・管理"
          summary="新しい台本を作るか、直近の流れを見たいときだけ使います。"
          actions={[
            { label: "新しい台本を作る", href: "/scripts/new" },
            { label: "ベスト確認", href: "/progress" }
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
        <p className="text-sm font-semibold text-[var(--accent-strong)]">聞いてまねる</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">お手本を聞いて、声に出す</h1>
        <p className="mt-3 text-base font-semibold text-ink-800">{script.title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
          {showCreatedHandoff ? "保存できました。次は" : "まずは"}お手本を聞き、英文を見ながら声に出してまねます。
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {["お手本を聞く", "英文を読む", "声に出す", "納得する", "録音して評価"].map((step, index) => (
            <div key={step} className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
              <p className="text-xs font-semibold text-[var(--accent-strong)]">{index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-ink-900">{step}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#listen-panel-shell" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-white shadow-sm sm:w-auto">
            お手本を聞く
          </a>
        </div>
        <details className="mt-5 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">台本を磨きたいとき</summary>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            台本を直すと過去の結果と意味がずれるため、別の練習として複製して調整します。
          </p>
          <Link href={getDuplicateScriptPath(script.id)} className="mt-3 inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
            この台本を磨く
          </Link>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">お手本ボイス</h2>
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
                        : "consent は完了していますが、voice がまだありません。お手本ボイスを作る前に voice を作成してください。",
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
                    generateBlockedSummary="保存済みのお手本はこのまま確認できます。新しいお手本ボイスを作るには、先に声の設定を整えてください。"
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
          <section id="listen-practice-area" className="mt-6 rounded-[2rem] border border-[var(--line)] bg-ink-50 p-5">
            <p className="text-xs font-semibold text-[var(--accent-strong)]">練習エリア</p>
            <h2 className="mt-2 text-xl font-semibold text-ink-900">読んで、まねる</h2>
            <div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-white p-5">
              <p className="text-xs font-semibold text-ink-500">英文スクリプト</p>
              <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-ink-900">{script.content}</p>
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-ink-700 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="font-semibold text-ink-900">1. お手本を聞く</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="font-semibold text-ink-900">2. 声に出してまねる</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="font-semibold text-ink-900">3. 納得したら録音</p>
              </div>
            </div>
            <Link href={recordHref} className="mt-5 inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-5 py-4 text-sm font-semibold text-white shadow-sm sm:w-auto">
              録音して評価へ進む
            </Link>
          </section>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">今やること</h2>
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
            <h2 className="text-lg font-semibold text-ink-900">その他の操作</h2>
            <div className="mt-4 grid gap-2 text-sm font-semibold">
              {latestReviewHref ? (
                <Link href={latestReviewHref} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                  直す
                </Link>
              ) : null}
              <Link href={getDuplicateScriptPath(script.id)} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                この台本を磨く
              </Link>
              <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                練習一覧
              </Link>
              <Link href={voiceSetupHref} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                声の設定
              </Link>
              <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                ベスト確認
              </Link>
            </div>
          </div>
        </div>
      </div>

      <details className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">設定・管理を見る</summary>
        <div className="mt-5 space-y-5">
          <ScriptPracticeChunks
            testId="listen-practice-chunks"
            chunks={practiceChunks}
            focusWords={practiceFocusWords}
            summary="まねる前に、どこで区切るかだけ決めます。"
            actionCue="まずは 1〜2 区切りだけまねてから録音へ"
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
    return "いまは聞いてまねる前提が一部不足していますが、保存済みのお手本があるためこの台本の練習は続けられます。必要ならまねたあと録音に進み、不足前提はあとで整えられます。";
  }

  if (input.isBlocked) {
    return "いまは聞いてまねる前提を整えてから練習を再開する段階です。復旧後はこの台本の練習にそのまま戻れます。";
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
    return "voice 側の前提は不足していますが、保存済みのお手本があるため練習は続けられる状態です。必要ならお手本を確認してから録音に進み、不足前提の修正はあとで戻れます。";
  }

  if (input.isBlocked) {
    return "いまは聞いてまねる練習を通常どおり続ける前に、voice 側の不足前提を補う段階です。復旧後はこの台本の練習に戻せます。";
  }

  if (input.takeCount === 0) {
    return "この台本はまだ未着手です。まずお手本を聞いてまねます。納得したら録音に進むのが最短です。";
  }

  if (input.improvementTrend === "down") {
    return input.hasLatestReview
      ? "直前の結果で少し崩れているので、お手本で耳を合わせ直してから録音に戻すと自然です。迷ったら最新結果を見返して重点だけ確認できます。"
      : "直前の結果で少し崩れているので、お手本で耳を合わせ直してから録音に戻すと自然です。";
  }

  if (input.improvementTrend === "up") {
    return input.hasLatestReview
      ? "改善傾向があるので、お手本は短く済ませて録音に戻る流れが自然です。必要なときだけ最新結果を見返せます。"
      : "改善傾向があるので、お手本は短く済ませて録音に戻る流れが自然です。";
  }

  return input.hasLatestReview
    ? "大きな崩れは見えていません。お手本を短く挟むか、最新結果を見返してから録音に戻るかをこの画面で選べます。"
    : "大きな崩れは見えていません。お手本を短く挟んだら、そのまま録音に戻れば十分です。";
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
        ? "保存済みのお手本はこのまま確認できます。新しいお手本ボイスを作る前提だけをあとで整えれば十分です。"
        : "まず声の設定を見直し、練習に戻るのは復旧後で十分です。"
      : kind === "consent_required"
        ? hasSavedAudio
          ? "保存済みのお手本はこのまま確認できます。通常どおり続ける前に、同意だけあとで記録すれば十分です。"
          : "まず同意を記録します。練習一覧には戻れますが、聞いてまねる練習を続けるのは同意のあとで十分です。"
        : hasSavedAudio
          ? "保存済みのお手本はこのまま確認できます。通常どおり続ける前に、voice を 1 つ作れば十分です。"
          : "まず voice を 1 つ作ります。練習一覧には戻れますが、聞いてまねる練習を続けるのは voice 作成のあとで十分です。";
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
          title="お手本の前に立て直しが必要な状態"
          summary="いまはお手本を再生する前提を整える段階です。"
          tone={guidance.tone}
        />
        <section className={`rounded-[2rem] border px-6 py-6 shadow-sm ${getGuidanceToneClasses(guidance.tone)}`}>
          <p className="text-sm font-semibold text-[var(--accent-strong)]">うまくいかない時</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">{guidance.titleJa}</h2>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(guidance.actionKind)}</p>
          <p className="mt-3 text-sm leading-6 text-ink-800">{guidance.summaryJa}</p>
          <p className="mt-3 text-sm leading-6 text-ink-600">{guidance.reasonJa}</p>
          <p className="mt-3 text-sm leading-6 text-ink-700">この画面での実行指示: {guidance.executionCueJa}</p>
          {guidance.followupCueJa ? <p className="mt-2 text-sm leading-6 text-ink-600">復旧後の練習: {guidance.followupCueJa}</p> : null}
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
            ...(hasSavedAudio ? [{ label: "保存済みのお手本を確認する", href: "#listen-panel-shell" }] : []),
            ...(latestReviewHref ? [{ label: "最新結果を見る", href: latestReviewHref }] : [])
          ]}
        />
        <StateActionSection
          eyebrow="その他の操作"
          title="設定・管理"
          actions={otherActions}
        />
      </div>
    </>
  );
}
