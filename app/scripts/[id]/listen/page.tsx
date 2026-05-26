import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref, buildScriptListenVoiceSetupHref } from "@/lib/navigation";
import { createPracticeChunks } from "@/lib/script-practice-chunks";
import { getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getGuidanceToneClasses } from "@/lib/guidance-ui";
import { getListenRecoveryGuidance } from "@/lib/listen-recovery-guidance";
import { getProgressOverview } from "@/services/progress";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScript } from "@/services/scripts/scripts.service";
import { getCachedListenAudio, getVoiceSetupState } from "@/services/voice";
import { ListenPanel } from "@/components/voice/listen-panel";
import { ScriptLoopStatusCard } from "@/components/guidance/script-loop-status-card";
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
          eyebrow="設定・管理"
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
    <section className="space-y-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <div data-testid="listen-practice-first-view" className="overflow-hidden rounded-[2rem] border border-[var(--line-inset)] bg-[radial-gradient(circle_at_top_left,rgba(200,121,63,0.2),transparent_34%),linear-gradient(135deg,var(--studio-surface-secondary),var(--booth-wall-soft)_58%,var(--studio-surface-inset))] p-6 shadow-[var(--shadow-studio-soft)] sm:p-8">
        <p className="text-sm font-semibold text-[var(--studio-accent-strong)]">耳を合わせる</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">お手本のリズムを耳に入れる</h1>
        <p className="mt-3 text-base font-semibold text-ink-800">{script.title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">台本を見ながら、下の操作バーで何度も戻してまねます。</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#listen-panel-shell" className="inline-flex w-full justify-center rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-[var(--cta-primary-text)] shadow-[0_12px_28px_rgba(24,23,34,0.18)] transition hover:opacity-90 sm:w-auto">
            {showCreatedHandoff ? "お手本へ進む" : "リズムを聞く"}
          </a>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-[2rem] border border-[var(--line-inset)] bg-[linear-gradient(180deg,var(--surface-secondary),var(--surface-inset))] p-5 shadow-[var(--shadow-studio-soft)] sm:p-6">
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
                        ? "まだ声の準備が終わっていません。先に声の設定を開きます。"
                        : "お手本ボイスに使う声がまだありません。先に声を登録してください。",
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
                    practiceChunks={practiceChunks}
                    focusWords={practiceFocusWords}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div id="listen-panel-shell" data-testid="listen-panel-shell">
              <ListenPanel
                scriptId={script.id}
                initialAudioUrl={cachedAudio?.audioUrl ?? null}
                initialHasSavedAudio={Boolean(cachedAudio)}
                initialVoiceLabel={voiceSetup.defaultVoice.label}
                initialVoiceId={voiceSetup.defaultVoice.id}
                practiceContext={practiceContext}
                nextRecordHref={recordHref}
                practiceChunks={practiceChunks}
                focusWords={practiceFocusWords}
              />
            </div>
          )}
          <section id="listen-practice-area" className="mt-6 rounded-[2rem] border border-[var(--line-inset)] bg-[rgba(223,197,170,0.58)] p-5">
            <div className="rounded-[1.5rem] border border-[var(--line-inset)] bg-[var(--script-paper)] p-5 shadow-[0_10px_24px_rgba(45,38,31,0.08)]">
              <p className="text-xs font-semibold text-ink-500">英文スクリプト</p>
              <p className="mt-3 whitespace-pre-wrap text-lg leading-9 text-ink-900">{script.content}</p>
            </div>
            <Link href={recordHref} className="mt-5 inline-flex w-full justify-center rounded-2xl bg-[var(--record-accent)] px-5 py-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(220,91,75,0.2)] transition hover:bg-[var(--record-accent-strong)] sm:w-auto">
              Take を録る
            </Link>
          </section>
        </div>
      </div>

      <details className="rounded-[2rem] border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-6">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">設定・管理を見る</summary>
        <div className="mt-5 space-y-5">
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
  return (
    <>
      <div data-testid="listen-recovery-block" data-kind={kind}>
        <section className={`rounded-[2rem] border px-6 py-6 shadow-[var(--shadow-studio-soft)] ${getGuidanceToneClasses(guidance.tone)}`}>
          <p className="text-sm font-semibold text-[var(--accent-strong)]">うまくいかない時</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">{guidance.titleJa}</h2>
          <p className="mt-3 text-sm leading-6 text-ink-800">{guidance.summaryJa}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href={ctaHref} className="rounded-2xl bg-[var(--studio-ink)] px-4 py-3 text-white">
              {guidance.primaryActionLabelJa}
            </Link>
            {hasSavedAudio ? (
              <a href="#listen-panel-shell" className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-ink-800">
                保存済みのお手本を聞く
              </a>
            ) : null}
            {latestReviewHref ? (
              <Link href={latestReviewHref} className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-ink-800">
                最新結果
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
