import Link from "next/link";
import { redirect } from "next/navigation";
import { formatWordListWithOverflow } from "@/lib/focus-words";
import { getGuidanceActionBadgeLabel, getGuidancePrimaryButtonLabel, getGuidanceToneClasses } from "@/lib/guidance-ui";
import { pickLatestReviewedScriptCandidate, pickScriptsLaunchCandidate } from "@/lib/launchpad";
import { buildLoginHref, buildScriptListenVoiceSetupHref, buildVoiceSetupHref } from "@/lib/navigation";
import { getDuplicateScriptPath, getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getAuthState } from "@/lib/supabase/auth";
import { getProgressPracticeGuidance, type PracticeGuidance } from "@/lib/practice-guidance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import { listSavedBestTakes, listSavedModelAudios, type SavedBestTakeRow, type SavedModelAudioRow } from "@/services/audio-library";
import { getProgressOverview } from "@/services/progress";
import { getPronunciationProviderStatus } from "@/services/pronunciation";
import type { ProgressTakeSummary, ScriptProgressItem } from "@/services/progress";
import { getVoiceSetupState } from "@/services/voice";
import { getTranscriptionProviderStatus } from "@/services/transcription";
import { TakeSummarySnapshot } from "@/components/guidance/take-summary-snapshot";
import { StateActionSection, StateStepSection, type StateActionLink } from "@/components/guidance/state-sections";

type ProgressAudioLibraryState = {
  savedModelAudios: SavedModelAudioRow[];
  savedBestTakes: SavedBestTakeRow[];
  loadFailed: boolean;
};

function getProgressVoiceReadinessState(input: {
  providerSupported: boolean;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
}) {
  if (!input.providerSupported) {
    return {
      tone: "alert" as const,
      title: "listen の前提が不足しています",
      summary: "voice provider が未対応なので、listen に戻る前に voice 側の前提を確認する必要があります。"
    };
  }

  if (!input.hasConsent) {
    return {
      tone: "focus" as const,
      title: "voice の同意がまだありません",
      summary: "保存済み結果は読めますが、listen に戻るには先に `/setup/voice` で同意を記録する必要があります。"
    };
  }

  if (!input.hasDefaultVoice) {
    return {
      tone: "focus" as const,
      title: "listen 用の voice がまだありません",
      summary: "結果は読めますが、listen に戻るには先に voice を 1 つ作る必要があります。"
    };
  }

  return null;
}

export default async function ProgressPage() {
  const authState = await getAuthState();
  const voiceSetupFromProgressHref = buildVoiceSetupHref("/progress", "/scripts");

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="progress を開く前に設定確認が必要な状態"
          summary="いまは結果を振り返る段階ではなく、Supabase の前提を整える段階です。"
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
          summary="まず login か設定確認に進み、progress へ戻るのは復旧後で十分です。"
          actions={[
            { label: "login", href: buildLoginHref("/progress", "supabase_not_configured", "/progress"), tone: "primary" }
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="補助導線"
          actions={[{ label: "home", href: "/" }]}
        />
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref("/progress", "login_required", "/progress"));
  }

  const supabase = createSupabaseServerClient();
  const [overview, voiceSetup] = await Promise.all([
    getProgressOverview(supabase, authState.user.id),
    getVoiceSetupState(supabase, authState.user.id)
  ]);
  const audioLibraryByScriptId = await getProgressAudioLibraryByScriptId(
    supabase,
    authState.user.id,
    overview.scripts.map((item) => item.script.id)
  );
  const transcriptionStatus = getTranscriptionProviderStatus();
  const pronunciationStatus = getPronunciationProviderStatus();
  const canRecord = transcriptionStatus.supported && pronunciationStatus.supported;
  const candidateScript = pickScriptsLaunchCandidate(overview.scripts, canRecord)?.script ?? null;
  const latestReviewedItem = pickLatestReviewedScriptCandidate(overview.scripts);
  const recommendedItem = pickRecommendedScript(overview.scripts);
  const recommendedGuidance = recommendedItem ? getProgressPracticeGuidance(recommendedItem) : null;
  const latestReviewedHref = latestReviewedItem?.latestTake
    ? getScriptReviewPath(latestReviewedItem.script.id, latestReviewedItem.latestTake.id)
    : null;
  const candidateListenVoiceSetupHref = candidateScript
    ? buildScriptListenVoiceSetupHref(candidateScript.id, "/progress")
    : voiceSetupFromProgressHref;
  const recommendedListenVoiceSetupHref = recommendedItem
    ? buildScriptListenVoiceSetupHref(recommendedItem.script.id, "/progress")
    : voiceSetupFromProgressHref;
  const voiceReadiness = getProgressVoiceReadinessState({
    providerSupported: voiceSetup.providerSupported,
    hasConsent: Boolean(voiceSetup.consent),
    hasDefaultVoice: Boolean(voiceSetup.defaultVoice)
  });
  const shouldShowEvaluationRecovery = !voiceReadiness && (!transcriptionStatus.supported || !pronunciationStatus.supported);

  if (overview.totalScripts === 0) {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="振り返る script がまだない状態"
          summary="progress は script と結果がそろってから意味を持ちます。いまは最初の script を用意する段階です。"
          tone="info"
        />
        <StateActionSection
          eyebrow="Next action"
          title="最初の 1 本を作る"
          summary="まずは 1 分台本を 1 本作ります。"
          actions={[
            { label: "台本を作成する", href: "/scripts/new", tone: "primary" }
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="補助導線"
          summary="voice 側の準備を先に整えたいときだけ使います。"
          actions={[
            { label: "voice 設定", href: voiceSetupFromProgressHref },
            { label: "scripts", href: "/scripts" }
          ]}
        />
      </section>
    );
  }

  if (overview.totalReviewedTakes === 0) {
    return (
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[var(--line)] bg-white p-8 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">progress</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900">まだ保存済み結果がありません</h1>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            listen から見本確認し、record で評価を保存すると、ベスト結果や weak words の変化をここで振り返れるようになります。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="script数" value={overview.totalScripts} />
          <StatCard label="保存済み結果" value={0} />
          <StatCard label="ベスト数" value={0} />
        </div>

        <StateStepSection
          title="保存済み結果がまだない状態"
          summary="script はありますが、progress で比較する保存済み結果はまだありません。いまは listen から入るか、そのまま record するかを決めて最初の結果を作る段階です。"
          tone="info"
        />

        {voiceReadiness ? (
          <StateStepSection
            title={voiceReadiness.title}
            summary={voiceReadiness.summary}
            tone={voiceReadiness.tone}
          />
        ) : null}

        {shouldShowEvaluationRecovery ? (
          <StateStepSection
            eyebrow="Recovery plan"
            title="record の前提も不足しています"
            summary={`${transcriptionStatus.supported ? pronunciationStatus.message ?? "pronunciation evaluator の設定が不足しています。" : transcriptionStatus.message ?? "transcription provider の設定が不足しています。"} listen までは進めますが、最初の結果を保存する前に設定を整える必要があります。`}
            tone="alert"
          />
        ) : null}

        <StateActionSection
          eyebrow="Next action"
          title="最初の結果を作る"
          summary={
            voiceReadiness
              ? "listen を主導線に戻す前提が不足しています。まず voice 設定を整え、準備が済んだら最初の script から再開します。"
              : !canRecord
                ? "listen で見本確認までは進められます。record で最初の結果を保存する前に、evaluation provider の前提を整えます。"
              : candidateScript
              ? `まず候補の「${candidateScript.title}」から始めます。この候補は未着手や戻りやすさを優先して 1 本だけ出しているので、listen を挟みたいならそこから入り、すぐ録りたいなら record に進みます。`
              : "まず対象 script を 1 つ選びます。listen を挟みたいならそこから入り、すぐ録りたいなら record に進みます。"
          }
          actions={getProgressNoResultsActions({
            voiceReadiness: Boolean(voiceReadiness),
            canRecord,
            evaluationSupported: canRecord,
            candidateScript,
            candidateListenVoiceSetupHref,
            voiceSetupFromProgressHref
          })}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="補助導線"
          summary={voiceReadiness ? "voice 設定を済ませたあと、一覧や main loop に戻るときだけ使います。" : "voice 側の前提を見直したいときだけ使います。"}
          actions={[
            { label: "scripts", href: "/scripts" },
            { label: "voice 設定", href: voiceSetupFromProgressHref }
          ]}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.94))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">progress</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">練習結果の振り返り</h1>
        <p className="mt-3 text-sm leading-6 text-ink-600">
          script ごとの最新結果とベスト結果を並べて、保存済み結果の流れと次に何を直すべきかをすぐ判断できるようにしています。
        </p>
      </div>

      <section className={`rounded-[2rem] border p-6 shadow-sm ${getGuidanceToneClasses("steady")}`}>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Current step</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-900">振り返って、次に戻る先を決める段階</h2>
        <p className="mt-3 text-sm leading-6 text-ink-700">
          progress は保存済み結果を読む場です。各 script ごとに `Current step` で状況を確認し、`Next step` で重点を見たあと、`Next action` から listen / record / 結果確認 の戻り先を決められます。
        </p>
      </section>

      {voiceReadiness ? (
        <div className="space-y-4">
          <StateStepSection
            eyebrow="Recovery plan"
            title={voiceReadiness.title}
            summary={`${voiceReadiness.summary} progress 自体はこのまま読めますが、listen を主導線に戻す前に前提を補うと止まりにくくなります。`}
            tone={voiceReadiness.tone}
          />
          <StateActionSection
            eyebrow="Next action"
            title="先に不足前提を補う"
            summary="まず voice 設定を整え、そのあと progress に戻って次の script を選び直します。"
            actions={getProgressVoiceRecoveryActions(recommendedListenVoiceSetupHref)}
          />
        </div>
      ) : !canRecord ? (
        <div className="space-y-4">
          <StateStepSection
            eyebrow="Recovery plan"
            title="record の前提が不足しています"
            summary={`${transcriptionStatus.supported ? pronunciationStatus.message ?? "pronunciation evaluator の設定が不足しています。" : transcriptionStatus.message ?? "transcription provider の設定が不足しています。"} progress と listen は読めますが、record で保存まで進める前に設定を整える必要があります。`}
            tone="alert"
          />
          <StateActionSection
            eyebrow="Next action"
            title="いま戻る先を決める"
            summary="まず listen か scripts に戻り、record 保存は設定が整ったあとに再開します。"
            actions={getProgressEvaluationRecoveryActions(recommendedItem)}
          />
        </div>
      ) : null}

      {recommendedItem && recommendedGuidance ? (
        <section className={`rounded-[2rem] border p-6 shadow-sm ${getGuidanceToneClasses(recommendedGuidance.tone)}`}>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Next action</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">次は「{recommendedItem.script.title}」に戻る</h2>
          <p className="mt-3 text-sm leading-6 text-ink-700">
            {voiceReadiness && recommendedGuidance.actionKind === "listen"
              ? `${recommendedGuidance.summaryJa} ただし listen の前提が足りないので、まず voice 設定を整えてから戻ります。`
              : !canRecord && recommendedGuidance.actionKind === "record"
                ? `${recommendedGuidance.summaryJa} ただし record の前提が足りないので、まず設定を整えるか listen 側から進め直します。`
              : recommendedGuidance.summaryJa}
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-600">迷ったら、まずこの script を 1 本だけ進めれば progress 全体の流れを止めずに再開できます。</p>
          {(() => {
            const recommendedAction = getRecommendedProgressActionState({
              recommendedItem,
              recommendedGuidance,
              voiceReadiness: Boolean(voiceReadiness),
              transcriptionSupported: transcriptionStatus.supported,
              pronunciationSupported: pronunciationStatus.supported,
              recommendedListenVoiceSetupHref
            });

            return (
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link
              href={recommendedAction.primaryHref}
              className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white"
            >
              {recommendedAction.primaryLabel}
            </Link>
            <Link
              href={recommendedAction.secondaryHref}
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800"
            >
              {recommendedAction.secondaryLabel}
            </Link>
          </div>
            );
          })()}
        </section>
      ) : null}

      {latestReviewedItem && latestReviewedHref ? (
        <StateActionSection
          eyebrow="Other actions"
          title="直近で見ていた結果から再開する"
          summary={`最新結果が残っているのは「${latestReviewedItem.script.title}」です。推奨の 1 本ではなく、直近の流れをそのまま拾いたいときだけ使います。`}
          actions={[
            { label: "最新結果を見る", href: latestReviewedHref, tone: "primary" },
            { label: canRecord ? "record に戻る" : "listen に戻る", href: canRecord ? getScriptRecordPath(latestReviewedItem.script.id) : getScriptListenPath(latestReviewedItem.script.id) }
          ]}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="script数" value={overview.totalScripts} />
        <StatCard label="保存済み結果" value={overview.totalReviewedTakes} />
        <StatCard label="ベスト数" value={overview.bestTakeCount} />
      </div>

      <div data-testid="progress-script-list" className="grid gap-4">
        {overview.scripts.map((item) => (
          <article key={item.script.id} data-testid={`progress-script-card-${item.script.id}`} className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
            {(() => {
              const guidance = getProgressPracticeGuidance(item);
              const currentStep = getProgressCurrentStep(item, guidance);

              return (
                <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">{item.script.locale} / target {item.script.targetSeconds}s</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink-900">{item.script.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600">{item.script.content}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <TrendBadge trend={item.improvementTrend} />
                <span className="rounded-full border border-[var(--line)] px-3 py-1 text-ink-700">{item.takeCount}件の結果</span>
              </div>
            </div>

            <section className={`mt-6 rounded-[1.75rem] border p-5 ${getGuidanceToneClasses(currentStep.tone)}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Current step</p>
              <h3 className="mt-2 text-lg font-semibold text-ink-900">{currentStep.titleJa}</h3>
              <p className="mt-3 text-sm leading-6 text-ink-700">{currentStep.summaryJa}</p>
            </section>

            <PracticeGuidanceCard
              guidance={guidance}
            />

            <ProgressNextActionCard
              guidance={guidance}
              hasLatestTake={Boolean(item.latestTake)}
              canRecord={canRecord}
              listenHref={getScriptListenPath(item.script.id)}
              recordHref={getScriptRecordPath(item.script.id)}
            />

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <TakeSummaryCard
                title="最新結果"
                take={item.latestTake}
                href={item.latestTake ? getScriptReviewPath(item.script.id, item.latestTake.id) : null}
                emptyHref={getScriptRecordPath(item.script.id)}
                emptyListenHref={getScriptListenPath(item.script.id)}
                canRecord={canRecord}
              />
              <TakeSummaryCard
                title="ベスト結果"
                take={item.bestTake}
                href={item.bestTake ? getScriptReviewPath(item.script.id, item.bestTake.id) : null}
                emptyHref={getScriptRecordPath(item.script.id)}
                emptyListenHref={getScriptListenPath(item.script.id)}
                highlight
                canRecord={canRecord}
              />
            </div>

            <ProgressAudioLibraryCard
              scriptId={item.script.id}
              library={audioLibraryByScriptId.get(item.script.id) ?? createEmptyAudioLibraryState()}
            />

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <section className="rounded-[1.75rem] border border-[var(--line)] bg-ink-50 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-600">改善の流れ</h3>
                {item.latestVsPrevious ? (
                  <div className="mt-4 space-y-3 text-sm text-ink-700">
                    <DiffMetric label="総合差分" value={item.latestVsPrevious.scoreDelta} />
                    <DiffMetric label="精度差分" value={item.latestVsPrevious.accuracyDelta} />
                    <DiffMetric label="流暢さ差分" value={item.latestVsPrevious.fluencyDelta} />
                    {guidance.changeSummaryJa ? <p className="text-sm leading-6 text-ink-700">{guidance.changeSummaryJa}</p> : null}
                    <p className="text-sm leading-6 text-ink-600">
                      {item.improvementTrend === "up"
                        ? "直前の結果より改善しています。"
                        : item.improvementTrend === "down"
                          ? "直前の結果より少し落ちています。weak words を中心に見直すと戻しやすいです。"
                          : "直前の結果と大きな差はありません。安定しています。"}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
                    <p className="mt-2 text-sm leading-6 text-ink-700">比較対象がまだ 1 件しかないため、改善傾向は次の結果から見えます。いまは保存済み結果をもう 1 本増やす段階です。</p>
                  </div>
                )}
              </section>

              <section className="rounded-[1.75rem] border border-[var(--line)] bg-ink-50 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-600">強み・弱点語・coach</h3>
                {item.latestTake ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">この結果の強み</p>
                      {item.latestTake.evaluation.strengthsJa.length > 0 ? (
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-ink-700">
                          {item.latestTake.evaluation.strengthsJa.slice(0, 2).map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-ink-600">大きく崩れていない点が多いので、次は weak words と coach の一言だけを見れば十分です。</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">現在の重点語</p>
                      {guidance.focusReasonJa ? <p className="mt-2 text-sm leading-6 text-ink-600">今これを優先する理由: {guidance.focusReasonJa}</p> : null}
                      {guidance.focusSummaryJa ? <p className="mt-2 text-sm leading-6 text-ink-700">{guidance.focusSummaryJa}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {guidance.focusWords.length > 0 ? (
                          guidance.focusWords.map((word) => (
                            <span key={word} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                              {word}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-ink-600">今は大きな重点語はありません。</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">coach の一言</p>
                      <p className="mt-2 text-sm leading-6 text-ink-700">{item.latestTake.coach.nextStepJa}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
                      <p className="mt-2 text-sm leading-6 text-ink-700">まだ保存済み結果がありません。いまは weak words を読む前に、listen か record から最初の結果を作る段階です。</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Link href={getScriptListenPath(item.script.id)} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
                          先に listen する
                        </Link>
                        <Link href={getScriptRecordPath(item.script.id)} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
                          record を始める
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section className="mt-6 rounded-[1.75rem] border border-[var(--line)] bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-600">最新とベストの差</h3>
              {item.latestVsBest ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">点数差</p>
                      <div className="mt-2 space-y-2">
                        <DiffMetric label="総合" value={item.latestVsBest.scoreDelta} />
                        <DiffMetric label="リズム" value={item.latestVsBest.rhythmDelta} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">弱点語の差</p>
                      <p className="mt-2 text-sm leading-6 text-ink-700">
                        改善した単語: {formatWordListWithOverflow(item.latestVsBest.improvedWeakWords)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-ink-700">
                        新しく弱くなった単語: {formatWordListWithOverflow(item.latestVsBest.regressedWeakWords)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">この結果の coach</p>
                      <p className="mt-2 text-sm leading-6 text-ink-700">{item.latestVsBest.coachShift.currentSummary}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">ベスト結果の coach</p>
                      <p className="mt-2 text-sm leading-6 text-ink-700">{item.latestVsBest.coachShift.bestSummary}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-ink-700">{getGapPriorityText(item.latestVsBest)}</p>
                </>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
                    <p className="mt-2 text-sm leading-6 text-ink-700">ベスト結果との比較はまだ出ていません。いまは最新の結果を 1 本ずつ増やして比較材料を作る段階です。</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link href={getScriptListenPath(item.script.id)} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
                        listen を挟む
                      </Link>
                      <Link href={getScriptRecordPath(item.script.id)} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
                        record に戻る
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-6 rounded-[1.75rem] border border-[var(--line)] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Other actions</p>
              <p className="mt-2 text-sm leading-6 text-ink-600">上の `Next action` で戻り先は決められます。ここでは script 管理や結果確認だけを補助でまとめています。</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={getDuplicateScriptPath(item.script.id)}
                  className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-medium text-ink-700"
                >
                  script を複製
                </Link>
              {item.latestTake ? (
                <Link
                  href={getScriptReviewPath(item.script.id, item.latestTake.id)}
                  className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-medium text-ink-700"
                >
                  最新結果を見る
                </Link>
              ) : null}
              </div>
            </section>
                </>
              );
            })()}
          </article>
        ))}
      </div>
    </section>
  );
}

function createEmptyAudioLibraryState(): ProgressAudioLibraryState {
  return {
    savedModelAudios: [],
    savedBestTakes: [],
    loadFailed: false
  };
}

async function getProgressAudioLibraryByScriptId(client: AppSupabaseClient, userId: string, scriptIds: string[]) {
  const entries: Array<readonly [string, ProgressAudioLibraryState]> = await Promise.all(
    scriptIds.map(async (scriptId) => {
      try {
        const [savedModelAudios, savedBestTakes] = await Promise.all([
          listSavedModelAudios(client, userId, scriptId),
          listSavedBestTakes(client, userId, scriptId)
        ]);

        return [
          scriptId,
          {
            savedModelAudios,
            savedBestTakes,
            loadFailed: false
          }
        ] as const;
      } catch (error) {
        console.warn("[audio-library] progress summary load failed", {
          scriptId,
          error: error instanceof Error ? error.message : String(error)
        });

        return [
          scriptId,
          {
            ...createEmptyAudioLibraryState(),
            loadFailed: true
          }
        ] as const;
      }
    })
  );

  return new Map<string, ProgressAudioLibraryState>(entries);
}

function PracticeGuidanceCard({ guidance }: { guidance: PracticeGuidance }) {
  return (
    <section className={`mt-6 rounded-[1.75rem] border p-5 ${getGuidanceToneClasses(guidance.tone)}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Next step</p>
      <h3 className="mt-2 text-lg font-semibold text-ink-900">{guidance.actionLabelJa}</h3>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(guidance.actionKind)}</p>
      <p className="mt-3 text-sm leading-6 text-ink-800">{guidance.summaryJa}</p>
      <p className="mt-3 text-sm leading-6 text-ink-600">{guidance.reasonJa}</p>
      <p className="mt-3 text-sm leading-6 text-ink-700">今の実行指示: {guidance.executionCueJa}</p>
      {guidance.followupCueJa ? <p className="mt-2 text-sm leading-6 text-ink-600">次に record へ戻ったら: {guidance.followupCueJa}</p> : null}
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
      <ol className="mt-4 space-y-2 text-sm leading-6 text-ink-700">
        {guidance.checklistJa.map((item, index) => (
          <li key={item}>
            {index + 1}. {item}
          </li>
        ))}
      </ol>
      {guidance.actionKind === "record" ? (
        <p className="mt-4 text-sm leading-6 text-ink-600">
          record 画面では、失敗しても段階ごとの Recovery plan と、保存済み録音の再試行導線をそのまま使えます。
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-ink-600">迷ったら `Current step` と `最新とベストの差` を見返し、いま耳を合わせる段階か、そのまま戻る段階かだけを確認します。</p>
    </section>
  );
}

function ProgressAudioLibraryCard({
  scriptId,
  library
}: {
  scriptId: string;
  library: ProgressAudioLibraryState;
}) {
  const modelCount = library.savedModelAudios.length;
  const bestTakeCount = library.savedBestTakes.length;
  const hasSavedItems = modelCount > 0 || bestTakeCount > 0;

  return (
    <section data-testid={`progress-audio-library-${scriptId}`} className="mt-6 rounded-[1.75rem] border border-[var(--line)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Audio Library</p>
          <h3 className="mt-2 text-lg font-semibold text-ink-900">残しておきたい音声</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Audio Library は自分で pin した見本音声と録音です。cache や score 上の best とは別に、あとで聞き返す入口として使います。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink-700">
          <span className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1">見本 {modelCount}/5</span>
          <span className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1">録音 {bestTakeCount}/5</span>
        </div>
      </div>

      {library.loadFailed ? (
        <p className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 p-4 text-sm leading-6 text-ink-700">
          Audio Library の保存状態を読み込めませんでした。progress の結果確認はこのまま使えます。
        </p>
      ) : hasSavedItems ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SavedModelAudioSummaryList items={library.savedModelAudios} />
          <SavedBestTakeSummaryList scriptId={scriptId} items={library.savedBestTakes} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
          <p className="text-sm leading-6 text-ink-700">
            まだ保存済み音声はありません。見本音声は listen、残したい録音は review で保存できます。
          </p>
        </div>
      )}
    </section>
  );
}

function SavedModelAudioSummaryList({ items }: { items: SavedModelAudioRow[] }) {
  return (
    <div data-testid="progress-saved-model-audios" className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink-900">保存済み見本音声</h4>
        <span className="text-xs font-semibold text-ink-500">{items.length}/5</span>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-500">
                <span>slot {item.slot}</span>
                <span>{formatSavedAt(item.saved_at)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink-900">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-ink-600">
                {formatModelAudioMetadata(item.metadata)}
              </p>
              <audio
                className="mt-3 w-full"
                controls
                preload="none"
                src={`/api/script-audio/${item.script_audio_id}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-600">listen で保存した見本音声がここに出ます。</p>
      )}
    </div>
  );
}

function SavedBestTakeSummaryList({ scriptId, items }: { scriptId: string; items: SavedBestTakeRow[] }) {
  return (
    <div data-testid="progress-saved-best-takes" className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink-900">保存済みベスト録音</h4>
        <span className="text-xs font-semibold text-ink-500">{items.length}/5</span>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-500">
                <span>slot {item.slot}</span>
                <span>{formatSavedAt(item.saved_at)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink-900">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-ink-600">
                {formatBestTakeMetadata(item.metadata)}
              </p>
              <Link
                href={getScriptReviewPath(scriptId, item.take_id)}
                className="mt-3 inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800"
              >
                review で聞く
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-600">review で自分で pin した録音がここに出ます。score 上の best とは別です。</p>
      )}
    </div>
  );
}

function formatSavedAt(value: string | null) {
  if (!value) {
    return "保存時刻なし";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "保存時刻なし";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getMetadataRecord(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata;
}

function getMetadataString(metadata: Json, key: string) {
  const record = getMetadataRecord(metadata);
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMetadataNumber(metadata: Json, key: string) {
  const record = getMetadataRecord(metadata);
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatModelAudioMetadata(metadata: Json) {
  const styleLabel = getMetadataString(metadata, "voice_style_label");
  const provider = getMetadataString(metadata, "provider") ?? "provider 不明";
  const voiceLabel = getMetadataString(metadata, "voice_label");
  const targetSpeed = getMetadataString(metadata, "target_speed");
  const contentType = getMetadataString(metadata, "content_type");
  const byteLength = getMetadataNumber(metadata, "byte_length");
  const parts = [
    styleLabel ? `style: ${styleLabel}` : "style: 旧データ / 詳細なし",
    targetSpeed ? `speed intent: ${targetSpeed}` : null,
    `provider: ${provider}`,
    voiceLabel ? `voice: ${voiceLabel}` : null,
    contentType ? `type: ${contentType}` : null,
    byteLength ? `${Math.round(byteLength / 1024)}KB` : null
  ].filter(Boolean);

  return parts.join(" / ");
}

function formatBestTakeMetadata(metadata: Json) {
  const score = getMetadataNumber(metadata, "score");
  const durationSeconds = getMetadataNumber(metadata, "duration_seconds");
  const weakWordCount = getMetadataNumber(metadata, "weak_word_count");
  const parts = [
    score !== null ? `score: ${score}` : "score 不明",
    durationSeconds !== null ? `${durationSeconds.toFixed(1)}秒` : null,
    weakWordCount !== null ? `weak words: ${weakWordCount}` : null
  ].filter(Boolean);

  return parts.join(" / ");
}

function getProgressCurrentStep(item: Awaited<ReturnType<typeof getProgressOverview>>["scripts"][number], guidance: PracticeGuidance) {
  if (!item.latestTake) {
    return {
      tone: "info" as const,
      titleJa: "最初の結果を作る段階",
      summaryJa: "まだ保存済み結果がありません。まず 1 本目の結果を作ってから、この script の weak words と coach を育てていく段階です。"
    };
  }

  if (guidance.actionKind === "listen") {
    return {
      tone: "focus" as const,
      titleJa: "耳を合わせ直してから戻る段階",
      summaryJa: "直近の結果とベスト結果の差が見えているので、いまはすぐ録り直すより listen を先に挟むほうが自然です。"
    };
  }

  if (item.improvementTrend === "down") {
    return {
      tone: "alert" as const,
      titleJa: "崩れた箇所を小さく戻す段階",
      summaryJa: "弱点は絞れているので、広く直すより focus words だけを意識して record に戻る段階です。"
    };
  }

  if (item.improvementTrend === "up") {
    return {
      tone: "steady" as const,
      titleJa: "良い流れを保って 1 本足す段階",
      summaryJa: "改善傾向があるので、大きく変えずに次の 1 本を足せる段階です。"
    };
  }

  return {
    tone: "steady" as const,
    titleJa: "今の感覚を保ったまま戻る段階",
    summaryJa: "大きな崩れは見えていないので、listen を増やしすぎずに必要な画面へ戻れば十分です。"
  };
}

function pickRecommendedScript(items: Awaited<ReturnType<typeof getProgressOverview>>["scripts"]) {
  if (items.length === 0) {
    return null;
  }

  const ranked = [...items].sort((left, right) => {
    const leftGuidance = getProgressPracticeGuidance(left);
    const rightGuidance = getProgressPracticeGuidance(right);
    const leftPriority = getRecommendedPriority(left, leftGuidance);
    const rightPriority = getRecommendedPriority(right, rightGuidance);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.script.updatedAt > right.script.updatedAt ? -1 : 1;
  });

  return ranked[0] ?? null;
}

function getProgressNoResultsActions(input: {
  voiceReadiness: boolean;
  canRecord: boolean;
  evaluationSupported: boolean;
  candidateScript: ScriptProgressItem["script"] | null;
  candidateListenVoiceSetupHref: string;
  voiceSetupFromProgressHref: string;
}): StateActionLink[] {
  if (input.voiceReadiness) {
    return [
      { label: "voice 設定", href: input.candidateListenVoiceSetupHref, tone: "primary" },
      ...(input.candidateScript && input.canRecord
        ? [{ label: "候補の script で record", href: getScriptRecordPath(input.candidateScript.id) }]
        : input.candidateScript
          ? [{ label: "候補の script で listen", href: getScriptListenPath(input.candidateScript.id) }]
          : [])
    ];
  }

  if (!input.evaluationSupported) {
    return [
      ...(input.candidateScript
        ? [{ label: "候補の script で listen", href: getScriptListenPath(input.candidateScript.id), tone: "primary" as const }]
        : []),
      { label: "scripts", href: "/scripts" },
      { label: "voice 設定", href: input.voiceSetupFromProgressHref }
    ];
  }

  if (input.candidateScript) {
    return [
      { label: "候補の script で listen", href: getScriptListenPath(input.candidateScript.id), tone: "primary" },
      { label: "候補の script で record", href: getScriptRecordPath(input.candidateScript.id) }
    ];
  }

  return [{ label: "scripts に戻る", href: "/scripts", tone: "primary" }];
}

function getProgressVoiceRecoveryActions(voiceSetupHref: string): StateActionLink[] {
  return [
    { label: "voice 設定", href: voiceSetupHref, tone: "primary" },
    { label: "scripts", href: "/scripts" }
  ];
}

function getProgressEvaluationRecoveryActions(recommendedItem: ScriptProgressItem | null): StateActionLink[] {
  return [
    ...(recommendedItem ? [{ label: "先に listen に戻る", href: getScriptListenPath(recommendedItem.script.id), tone: "primary" as const }] : []),
    { label: "scripts", href: "/scripts" }
  ];
}

function getRecommendedProgressActionState(input: {
  recommendedItem: ScriptProgressItem;
  recommendedGuidance: PracticeGuidance;
  voiceReadiness: boolean;
  transcriptionSupported: boolean;
  pronunciationSupported: boolean;
  recommendedListenVoiceSetupHref: string;
}) {
  if (input.voiceReadiness && input.recommendedGuidance.actionKind === "listen") {
    return {
      primaryHref: input.recommendedListenVoiceSetupHref,
      primaryLabel: "voice 設定",
      secondaryHref: input.recommendedItem.latestTake
        ? getScriptReviewPath(input.recommendedItem.script.id, input.recommendedItem.latestTake.id)
        : "/scripts",
      secondaryLabel: input.recommendedItem.latestTake ? "最新結果を見る" : "scripts を開く"
    };
  }

  if ((!input.transcriptionSupported || !input.pronunciationSupported) && input.recommendedGuidance.actionKind === "record") {
    return {
      primaryHref: "/scripts",
      primaryLabel: "scripts に戻る",
      secondaryHref: input.recommendedItem.latestTake
        ? getScriptReviewPath(input.recommendedItem.script.id, input.recommendedItem.latestTake.id)
        : "/scripts",
      secondaryLabel: input.recommendedItem.latestTake ? "最新結果を見る" : "scripts を開く"
    };
  }

  return {
    primaryHref:
      input.recommendedGuidance.actionKind === "listen"
        ? getScriptListenPath(input.recommendedItem.script.id)
        : getScriptRecordPath(input.recommendedItem.script.id),
    primaryLabel: getGuidancePrimaryButtonLabel(input.recommendedGuidance.actionKind),
    secondaryHref: input.recommendedItem.latestTake
      ? getScriptReviewPath(input.recommendedItem.script.id, input.recommendedItem.latestTake.id)
      : "/scripts",
    secondaryLabel: input.recommendedItem.latestTake ? "最新結果を見る" : "scripts を開く"
  };
}

function getRecommendedPriority(item: Awaited<ReturnType<typeof getProgressOverview>>["scripts"][number], guidance: PracticeGuidance) {
  if (item.takeCount === 0) {
    return 0;
  }

  if (guidance.actionKind === "listen") {
    return 1;
  }

  if (item.improvementTrend === "down") {
    return 2;
  }

  if (item.improvementTrend === "up") {
    return 3;
  }

  return 4;
}

function ProgressNextActionCard({
  guidance,
  hasLatestTake,
  canRecord,
  listenHref,
  recordHref
}: {
  guidance: PracticeGuidance;
  hasLatestTake: boolean;
  canRecord: boolean;
  listenHref: string;
  recordHref: string;
}) {
  const prioritizeListen = !hasLatestTake || guidance.actionKind === "listen";
  const primaryHref = !canRecord ? listenHref : prioritizeListen ? listenHref : recordHref;
  const secondaryHref = !canRecord ? "/scripts" : prioritizeListen ? recordHref : listenHref;
  const primaryLabel = !canRecord ? "先に listen を保つ" : !hasLatestTake ? "まず listen する" : getGuidancePrimaryButtonLabel(guidance.actionKind);
  const secondaryLabel = !canRecord ? "scripts に戻る" : prioritizeListen ? "そのまま record に戻る" : "必要なら listen を挟む";
  const actionText =
    !canRecord
      ? "いまは record の前提が不足しています。まず listen か scripts に戻り、record 保存は設定を直したあとに再開します。"
      : !hasLatestTake
      ? "この script はまだ未着手です。まず listen で見本を合わせ、十分ならそのまま record に進みます。"
      : guidance.actionKind === "listen"
      ? "いまは保存済み結果の振り返りを見終えた段階です。まず listen に戻り、耳が合ったら record に進みます。"
      : "いまは保存済み結果の振り返りを見終えた段階です。まず record に戻るのが主導線で、迷うときだけ listen を挟みます。";

  return (
    <section className={`mt-6 rounded-[1.75rem] border p-5 ${getGuidanceToneClasses("steady")}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Next action</p>
      <h3 className="mt-2 text-lg font-semibold text-ink-900">次に戻る先を決める</h3>
      <p className="mt-3 text-sm leading-6 text-ink-700">{actionText}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href={primaryHref} className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-white">
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
          {secondaryLabel}
        </Link>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-600">迷ったら `Next action` では戻り先だけを決め、理由は上の `Next step` と `Current step` で確認します。</p>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.75rem] border border-[var(--line)] bg-white px-5 py-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "flat" | "insufficient_data" }) {
  const label =
    trend === "up"
      ? "改善中"
      : trend === "down"
        ? "要リトライ"
        : trend === "flat"
          ? "安定"
          : "比較待ち";

  return <span className="rounded-full bg-ink-50 px-3 py-1 text-ink-700">{label}</span>;
}

function TakeSummaryCard({
  title,
  take,
  href,
  emptyHref = null,
  emptyListenHref = null,
  highlight = false,
  canRecord = true
}: {
  title: string;
  take: ProgressTakeSummary | null;
  href: string | null;
  emptyHref?: string | null;
  emptyListenHref?: string | null;
  highlight?: boolean;
  canRecord?: boolean;
}) {
  return (
    <section className={`rounded-[1.75rem] border p-5 ${highlight ? "border-[var(--accent)] bg-[rgba(217,119,6,0.06)]" : "border-[var(--line)] bg-white"}`}>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        {highlight ? <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">ベスト</span> : null}
      </div>
      {take ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="総合" value={take.score} />
            <Metric label="精度" value={take.accuracyScore} />
            <Metric label="流暢さ" value={take.fluencyScore} />
          </div>
          <div className="mt-4">
            <TakeSummarySnapshot
              eyebrow={highlight ? "ベスト結果の要点" : "最新結果の要点"}
              take={take}
              lead={take.coach.summaryJa}
              showScoreChip={false}
              showStrengths
            />
          </div>
          {href ? (
            <Link href={href} className="mt-4 inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
              結果確認
            </Link>
          ) : null}
        </>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Current step</p>
            <p className="mt-2 text-sm leading-6 text-ink-700">
              {canRecord
                ? "まだ保存済み結果がありません。いまはこの script の最初の結果を作る段階です。迷うなら listen、すぐ録るなら record で十分です。"
                : "まだ保存済み結果がありません。listen までは進めますが、record で結果を作る前に前提設定を整える必要があります。"}
            </p>
          </div>
          {emptyHref ? (
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {emptyListenHref ? (
                  <Link href={emptyListenHref} className="inline-flex rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
                    先に listen する
                  </Link>
                ) : null}
                {canRecord ? (
                  <Link href={emptyHref} className="inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
                    record で最初の結果を作る
                  </Link>
                ) : (
                  <Link href="/scripts" className="inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
                    scripts に戻る
                  </Link>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink-900">{value}</div>
    </div>
  );
}

function DiffMetric({ label, value }: { label: string; value: number }) {
  const sign = value > 0 ? "+" : "";

  return (
    <p className="text-sm font-medium text-ink-700">
      {label}: {sign}
      {value}
    </p>
  );
}

function getGapPriorityText(diff: {
  regressedWeakWords: string[];
  commonWeakWords: string[];
  improvedWeakWords: string[];
  scoreDelta: number;
}) {
  if (diff.regressedWeakWords.length > 0) {
    return `${formatWordListWithOverflow(diff.regressedWeakWords).replaceAll(" / ", "、")} がベスト結果との差として目立つので、次はここを優先すると戻しやすいです。`;
  }

  if (diff.commonWeakWords.length > 0) {
    return `${formatWordListWithOverflow(diff.commonWeakWords).replaceAll(" / ", "、")} はまだ残っているので、次も同じ単語を意識して十分です。`;
  }

  if (diff.improvedWeakWords.length > 0) {
    return `${formatWordListWithOverflow(diff.improvedWeakWords).replaceAll(" / ", "、")} は改善しています。残りはテンポを保ったまま縮める段階です。`;
  }

  return `ベスト結果との差は主にスコア ${diff.scoreDelta > 0 ? "+" : ""}${diff.scoreDelta} です。大きく変えすぎず、今の感覚を少し整えるのが向いています。`;
}
