import Link from "next/link";
import { redirect } from "next/navigation";
import { formatWordListWithOverflow } from "@/lib/focus-words";
import { getGuidanceActionBadgeLabel, getGuidancePrimaryButtonLabel } from "@/lib/guidance-ui";
import { buildLoginHref } from "@/lib/navigation";
import { createPracticeChunks, findWeakWordPracticeChunks } from "@/lib/script-practice-chunks";
import { getDuplicateScriptPath, getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getReviewPracticeGuidance, type PracticeGuidance } from "@/lib/practice-guidance";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProtectedAudioPlayer } from "@/components/audio/protected-audio-player";
import { SavedBestTakeControl } from "@/components/audio-library/saved-best-take-control";
import { getScript } from "@/services/scripts/scripts.service";
import { getStoredReview, hydrateStoredReview } from "@/services/review/review.service";
import { getProgressOverview, getScriptTakeComparison, type ProgressTakeSummary } from "@/services/progress";
import { parseRecordingAudioReference } from "@/services/storage";
import { PHASE1_PLACEHOLDER_TAKE_ID } from "@/lib/phase1";
import { ScriptLoopStatusCard } from "@/components/guidance/script-loop-status-card";
import { ReviewPracticeFocus } from "@/components/guidance/review-practice-focus";
import { TakeSummarySnapshot } from "@/components/guidance/take-summary-snapshot";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";
import { BestResultExportActions } from "@/components/export/best-result-export-actions";

type PageParams = {
  params:
    | {
        id: string;
        takeId: string;
      }
    | Promise<{
        id: string;
        takeId: string;
      }>;
};

export default async function ReviewPage({ params }: PageParams) {
  const { id, takeId } = await params;
  const user = await getCurrentUser();
  const listenHref = getScriptListenPath(id);
  const recordHref = getScriptRecordPath(id);
  const currentReviewHref = getScriptReviewPath(id, takeId);

  if (!user) {
    redirect(buildLoginHref(currentReviewHref, "login_required", "/scripts"));
  }

  const supabase = createSupabaseServerClient();
  const script = await getScript(supabase, user.id, id);

  if (!script) {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="結果を開く script が見つからない状態"
          summary="この結果ページは開けましたが、対象 script は取得できませんでした。いまは script を選び直して main loop に戻る段階です。"
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
          title="設定・管理"
          summary="新しい script を作るか、直近の流れを見たいときだけ使います。"
          actions={[
            { label: "新しい script を作る", href: "/scripts/new" },
            { label: "progress", href: "/progress" }
          ]}
        />
      </section>
    );
  }

  if (takeId === PHASE1_PLACEHOLDER_TAKE_ID) {
    return (
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-8 shadow-[var(--shadow-studio-soft)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">今回の Take</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">{script.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-ink-700">{script.content}</p>
          <p className="mt-4 text-sm leading-6 text-ink-600">
            結果確認は保存済みの結果を表示するページです。まだ保存済みの結果はありません。record から評価を保存してから戻ってきてください。
          </p>
        </div>

        <StateStepSection
          title="保存済みの結果がまだない状態"
          summary="この URL は placeholder です。結果確認は保存済みの結果を読む場なので、いまは結果を見る前に record で最初の結果を作る段階です。"
          tone="info"
        />

        <StateActionSection
          eyebrow="Next action"
          title="次に進む先を決める"
          summary="まずは record で保存済みの結果を作り、必要なら listen を 1 回だけ挟みます。"
          actions={[
            { label: "record に戻る", href: recordHref, tone: "primary" },
            { label: "listen", href: listenHref },
            { label: "progress", href: "/progress" }
          ]}
        />

        <StateActionSection
          eyebrow="Other actions"
          title="設定・管理"
          summary="一覧に戻って別の script に切り替えるときだけ使います。"
          actions={[
            { label: "scripts", href: "/scripts" }
          ]}
        />
      </section>
    );
  }

  const review = await getStoredReview(supabase, user.id, script.id, takeId);

  if (!review) {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="開こうとした結果が見つからない状態"
          summary="script はありますが、対象の保存済み結果は取得できませんでした。いまは別の結果を選ぶか、新しい結果を作り直す段階です。"
          tone="alert"
        />
        <StateActionSection
          eyebrow="Next action"
          title="次に進む先を決める"
          summary="まずは record に戻って結果を作り直し、必要なら listen を挟みます。"
          actions={[
            { label: "record", href: recordHref, tone: "primary" },
            { label: "listen", href: listenHref },
            { label: "progress", href: "/progress" }
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="設定・管理"
          summary="一覧に戻って別の script や別の結果に切り替えるときだけ使います。"
          actions={[
            { label: "scripts", href: "/scripts" }
          ]}
        />
      </section>
    );
  }

  const hydratedReview = hydrateStoredReview(review);
  const evaluation = hydratedReview.evaluation;
  const coach = hydratedReview.coach;
  const weakWords = hydratedReview.weakWords;
  const comparison = await getScriptTakeComparison(supabase, user.id, script.id, takeId);
  const progressOverview = await getProgressOverview(supabase, user.id);
  const progressItem = progressOverview.scripts.find((item) => item.script.id === script.id) ?? null;
  const latestReviewHref = progressItem?.latestTake ? getScriptReviewPath(script.id, progressItem.latestTake.id) : null;
  const bestReviewHref = progressItem?.bestTake ? getScriptReviewPath(script.id, progressItem.bestTake.id) : null;
  const isCurrentLatest = progressItem?.latestTake?.id === review.take.id;
  const isCurrentBest = progressItem?.bestTake?.id === review.take.id;
  const canPlaybackRecording = Boolean(parseRecordingAudioReference({ audioPath: review.take.audio_path }));
  const practiceChunks = createPracticeChunks(script.content);
  const weakWordLabels = weakWords.map((word) => word.word);
  const coachFocusWords = coach.focusWords.slice(0, 3);
  const weakWordChunkFocus = findWeakWordPracticeChunks({
    chunks: practiceChunks,
    weakWords: weakWordLabels,
    focusWords: coachFocusWords
  });
  const practiceGuidance = getReviewPracticeGuidance({
    targetSeconds: script.targetSeconds,
    durationSeconds: hydratedReview.take.duration_seconds,
    weakWords,
    coach,
    comparison
  });
  const currentStep = getReviewCurrentStep({
    comparison,
    canPlaybackRecording
  });
  const currentTakeSummary = comparison?.current ?? toProgressTakeSummaryFromReview(hydratedReview);
  const bestTakeSummary = comparison?.best ?? null;
  const comparisonSectionTitle = getReviewComparisonSectionTitle({
    isCurrentLatest,
    isCurrentBest
  });
  const currentTakeLabel = isCurrentLatest ? "最新結果の要点" : "この結果の要点";
  const reviewFocusPoints = getReviewFocusPoints({
    weakWords,
    coach,
    practiceGuidance
  });
  const reviewOneLineAdvice = getReviewOneLineAdvice({
    coach,
    practiceGuidance
  });

  return (
    <section data-testid="review-root" className="space-y-6">
      <ReviewSummaryFirst
        scriptTitle={script.title}
        score={evaluation.score}
        focusPoints={reviewFocusPoints}
        advice={reviewOneLineAdvice}
        recordHref={recordHref}
        brushUpHref={getDuplicateScriptPath(script.id)}
        bestReviewHref={!isCurrentBest ? bestReviewHref : null}
        isCurrentLatest={isCurrentLatest}
        isCurrentBest={isCurrentBest}
        takeCount={progressItem?.takeCount ?? 0}
        canPlaybackRecording={canPlaybackRecording}
        takeId={review.take.id}
        reviewedAt={review.take.reviewed_at ?? review.take.created_at}
        exportComment={reviewOneLineAdvice}
      />

      <details data-testid="review-detail-panel" className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-5 shadow-[var(--shadow-studio-soft)]">
        <summary className="cursor-pointer list-none rounded-[1.5rem] border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-5 py-4 text-sm font-semibold text-ink-900">
          細かいメモを見る
          <span className="ml-3 font-normal text-ink-600">
            文字起こし、スコア、ベストとの差を開く
          </span>
        </summary>
        <div className="mt-6 space-y-6">
          <div className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">今回の Take メモ</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">{script.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-ink-700">{script.content}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-ink-500">
              <span>録音ID: {review.take.id}</span>
              <span>状態: {review.take.status}</span>
              <span>保存時刻: {review.take.reviewed_at ?? "未保存"}</span>
              {isCurrentLatest ? <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-[var(--accent-strong)]">最新</span> : null}
              {!isCurrentLatest && latestReviewHref ? <span>最新結果あり</span> : null}
              {isCurrentBest ? <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-[var(--accent-strong)]">ベスト</span> : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-ink-600">
              {isCurrentLatest
                ? "この結果を確認したら、そのまま聞く / 録る / 声のログのどこへ戻るかを決めれば十分です。"
                : latestReviewHref
                  ? "これは履歴内の 1 件です。通常利用へ戻るときは、必要なら最新テイクを見直してから聞く / 録るへ切り替えられます。"
                  : "この結果を起点に、聞く / 録る / 声のログのどこへ戻るかを決められます。"}
            </p>
          </div>

      <ScriptLoopStatusCard
        currentStep="review"
        takeCount={progressItem?.takeCount ?? 0}
        improvementTrend={progressItem?.improvementTrend ?? "insufficient_data"}
        listenHref={listenHref}
        recordHref={recordHref}
        latestTake={progressItem?.latestTake ?? null}
        latestReviewHref={latestReviewHref}
        isCurrentLatestReview={isCurrentLatest}
      />

      <div data-testid="review-score-grid" className="grid gap-4 lg:grid-cols-3">
        <Metric label="総合" value={evaluation.score} />
        <Metric label="精度" value={evaluation.accuracyScore} />
        <Metric label="流暢さ" value={evaluation.fluencyScore} />
      </div>

      <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">次はここだけ</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-900">{currentStep.titleJa}</h2>
        <p className="mt-3 text-sm leading-6 text-ink-700">{currentStep.summaryJa}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-take-paper)] p-6">
          <h2 className="text-lg font-semibold text-ink-900">今回の Take</h2>
          <div className="mt-4">
            <TakeSummarySnapshot
              eyebrow={currentTakeLabel}
              take={currentTakeSummary}
              lead={evaluation.summaryJa}
              showStrengths
            />
          </div>
        </section>

        <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-log-shelf)] p-6">
          <h2 className="text-lg font-semibold text-ink-900">ベストテイクとの差</h2>
          {bestTakeSummary ? (
            <div className="mt-4">
              <TakeSummarySnapshot
                eyebrow="ベスト結果の要点"
                take={bestTakeSummary}
                lead={
                  isCurrentBest
                    ? "いま見ている Take が現在のベストです。"
                    : "比較対象として見返すベスト結果です。"
                }
                showStrengths
              />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">まだ比較なし</p>
                <p className="mt-2 text-sm leading-6 text-ink-700">ベスト結果の比較はまだありません。いまはこの結果の要点を確認して、次の 1 本を足す段階です。</p>
              </div>
              <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={recordHref} className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                    もう一度録る
                  </Link>
                  <Link href={listenHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800">
                    リズムを聞く
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--control-panel)] p-6 text-[var(--cta-primary-text)] shadow-[var(--shadow-studio-soft)]">
          <h2 className="text-lg font-semibold text-[var(--cta-primary-text)]">今回の録音</h2>
          {canPlaybackRecording ? (
            <div data-testid="review-recording-block" className="mt-4 space-y-3">
              <ProtectedAudioPlayer sourceUrl={`/api/takes/${review.take.id}/audio`} variant="studio" />
              <p className="text-sm leading-6 text-[rgba(255,241,221,0.72)]">録った声を短く聞き返して、Focus words と次の1点を照らし合わせます。</p>
              <SavedBestTakeControl scriptId={script.id} takeId={review.take.id} isScoreBest={isCurrentBest} />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[var(--line-dark)] bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[rgba(255,241,221,0.6)]">録音なし</p>
              <p className="mt-2 text-sm leading-6 text-[rgba(255,241,221,0.78)]">この結果では再生可能な録音ファイルを表示できません。いまは文字起こしと Focus words を中心に確認します。</p>
              </div>
              <div className="rounded-2xl border border-[var(--line-dark)] bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[rgba(255,241,221,0.6)]">次の一手</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={listenHref} className="rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                    リズムを聞く
                  </Link>
                  <Link href={recordHref} className="rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-sm font-semibold text-white">
                    もう一度録る
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        <section data-testid="review-transcript-block" className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-paper)] p-6">
          <h2 className="text-lg font-semibold text-ink-900">文字起こし</h2>
          <p className="mt-3 text-sm leading-7 text-ink-700">{hydratedReview.take.transcript_text ?? "まだ文字起こしは保存されていません。"}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-ink-500">
            長さ: {hydratedReview.take.duration_seconds ?? "未計測"}秒 / 語数: {evaluation.transcriptWordCount}
          </p>
        </section>

        <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6">
          <h2 className="text-lg font-semibold text-ink-900">よかったところ</h2>
          <p className="mt-3 text-sm leading-7 text-ink-700">{evaluation.summaryJa}</p>
          {evaluation.strengthsJa.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm leading-6 text-ink-700">
              {evaluation.strengthsJa.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-6 text-ink-600">今回は大きく崩れていない点が多いため、次は Focus words と次の1点だけ見れば十分です。</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6">
          <h2 className="text-lg font-semibold text-ink-900">Focus words</h2>
          {weakWords.length === 0 ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Focus words</p>
                <p className="mt-2 text-sm leading-6 text-ink-700">今回は大きい Focus words は見えていません。いまは次の1点と「{comparisonSectionTitle}」を見ながら次の 1 本を決めます。</p>
              </div>
              <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={recordHref} className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                    もう一度録る
                  </Link>
                  <Link href={listenHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800">
                    リズムを聞く
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {weakWords.map((word) => (
                <li key={word.id} className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-4 py-3">
                  <p className="text-sm font-semibold text-ink-900">{word.word}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink-500">score {word.score ?? "未算出"}</p>
                  <p className="mt-2 text-sm leading-6 text-ink-700">{word.note ?? "補足なし"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6">
          <h2 className="text-lg font-semibold text-ink-900">次はここだけ</h2>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{coach.titleJa}</p>
          <p className="mt-3 text-sm leading-7 text-ink-700">{coach.summaryJa}</p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-ink-700">
            {coach.bulletPointsJa.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-4 text-sm leading-6 text-ink-700">{coach.nextStepJa}</p>
        </section>
      </div>

      <ReviewPracticeFocus
        focusItems={weakWordChunkFocus}
        fallbackChunk={practiceChunks[0] ?? null}
        weakWords={weakWordLabels}
        coachFocusWords={coachFocusWords}
        listenHref={listenHref}
        recordHref={recordHref}
      />

      <PracticeGuidanceSection
        guidance={practiceGuidance}
        comparisonSectionTitle={comparisonSectionTitle}
      />

      <ReviewNextActionSection
        guidance={practiceGuidance}
        listenHref={listenHref}
        recordHref={recordHref}
        progressHref="/progress"
        latestReviewHref={!isCurrentLatest ? latestReviewHref : null}
      />

      <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-log-shelf)] p-6">
        <h2 className="text-lg font-semibold text-ink-900">{comparisonSectionTitle}</h2>
        {!comparison ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">声のログ</p>
              <p className="mt-2 text-sm leading-6 text-ink-700">比較データを読み込めませんでした。いまは保存済み結果単体の内容を確認する段階です。</p>
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href={recordHref} className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                  もう一度録る
                </Link>
                <Link href="/progress" className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800">
                  声のログ
                </Link>
              </div>
            </div>
          </div>
        ) : comparison.takeCount < 2 ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">声のログ</p>
              <p className="mt-2 text-sm leading-6 text-ink-700">この script の結果はまだ 1 件だけです。いまは比較より、次の 1 本を足す段階です。</p>
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href={recordHref} className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                  もう一度録る
                </Link>
              </div>
            </div>
          </div>
        ) : comparison.isBest ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">ベストテイク</p>
              <p className="mt-2 text-sm leading-6 text-ink-700">この結果が現在のベストです。いまは結果を崩さずに次の 1 本を足すかを決める段階です。</p>
              {practiceGuidance.changeSummaryJa ? <p className="mt-2 text-sm leading-6 text-ink-700">{practiceGuidance.changeSummaryJa}</p> : null}
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href={recordHref} className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                  もう一度録る
                </Link>
                <Link href={listenHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800">
                  リズムを聞く
                </Link>
              </div>
            </div>
          </div>
        ) : comparison.diff && comparison.best ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <TakeSummarySnapshot
                eyebrow={currentTakeLabel}
                take={currentTakeSummary}
                lead={comparison.diff.coachShift.currentSummary}
                showStrengths
              />
              <TakeSummarySnapshot
                eyebrow="ベスト結果の要点"
                take={comparison.best}
                lead={comparison.diff.coachShift.bestSummary}
                showStrengths
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">点数差</p>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>総合: {formatDelta(comparison.diff.scoreDelta)}</li>
                <li>精度: {formatDelta(comparison.diff.accuracyDelta)}</li>
                <li>流暢さ: {formatDelta(comparison.diff.fluencyDelta)}</li>
                <li>リズム: {formatDelta(comparison.diff.rhythmDelta)}</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Focus words の差</p>
              <p className="mt-3 text-sm leading-6 text-ink-700">
                改善した単語: {formatWordListWithOverflow(comparison.diff.improvedWeakWords)}
              </p>
              <p className="mt-3 text-sm leading-6 text-ink-700">
                まだ残っている単語: {formatWordListWithOverflow(comparison.diff.commonWeakWords)}
              </p>
              <p className="mt-3 text-sm leading-6 text-ink-700">
                新しく弱くなった単語: {formatWordListWithOverflow(comparison.diff.regressedWeakWords)}
              </p>
              {practiceGuidance.changeSummaryJa ? <p className="mt-3 text-sm leading-6 text-ink-700">{practiceGuidance.changeSummaryJa}</p> : null}
              <p className="mt-3 text-sm leading-6 text-ink-700">{getComparisonPriorityText(comparison.diff)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-notice)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">今回のコーチメモ</p>
              <p className="mt-3 text-sm leading-6 text-ink-700">{comparison.diff.coachShift.currentSummary}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-notice)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">ベスト時のコーチメモ</p>
              <p className="mt-3 text-sm leading-6 text-ink-700">{comparison.diff.coachShift.bestSummary}</p>
            </div>
            <div className="lg:col-span-2 rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">必要なときだけ</p>
              <p className="mt-2 text-sm leading-6 text-ink-600">いまは差分を見るのが主で、ベスト結果の詳細確認は必要なときだけで十分です。</p>
              <Link
                href={getScriptReviewPath(script.id, comparison.best.id)}
                className="mt-3 inline-flex rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800"
              >
                ベスト結果も見る
              </Link>
            </div>
          </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">声のログ</p>
              <p className="mt-2 text-sm leading-6 text-ink-700">比較対象のベスト結果はまだありません。いまは今回の結果をもとに次の 1 本を決める段階です。</p>
            </div>
            <div className="rounded-2xl border border-[var(--line-subtle)] bg-[var(--surface-secondary)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href={recordHref} className="rounded-2xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">
                  もう一度録る
                </Link>
                <Link href={listenHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-semibold text-ink-800">
                  リズムを聞く
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">その他の操作</p>
        <p className="mt-2 text-sm leading-6 text-ink-600">結果の確認と次の戻り先は上で完結できます。ここではベスト確認や台本管理だけ使います。</p>
        <div className="mt-4 flex flex-wrap gap-3">
        {!isCurrentBest && bestReviewHref ? (
          <Link href={bestReviewHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-medium text-ink-700">
            ベストを確認
          </Link>
        ) : null}
        <Link href="/scripts" className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-medium text-ink-700">
          1分ストック
        </Link>
        <Link href={getDuplicateScriptPath(script.id)} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-sm font-medium text-ink-700">
          この台本を磨く
        </Link>
        </div>
      </section>
        </div>
      </details>
    </section>
  );
}

function ReviewSummaryFirst({
  scriptTitle,
  score,
  focusPoints,
  advice,
  recordHref,
  brushUpHref,
  bestReviewHref,
  isCurrentLatest,
  isCurrentBest,
  takeCount,
  canPlaybackRecording,
  takeId,
  reviewedAt,
  exportComment
}: {
  scriptTitle: string;
  score: number;
  focusPoints: string[];
  advice: string;
  recordHref: string;
  brushUpHref: string;
  bestReviewHref: string | null;
  isCurrentLatest: boolean;
  isCurrentBest: boolean;
  takeCount: number;
  canPlaybackRecording: boolean;
  takeId: string;
  reviewedAt: string | null;
  exportComment: string;
}) {
  return (
    <section data-testid="review-summary-first" className="rounded-[2rem] border border-[var(--line-inset)] bg-[linear-gradient(135deg,var(--surface-notice),var(--surface-primary))] p-6 shadow-[var(--shadow-studio-soft)] lg:p-8">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
        <div>
          <p className="text-sm font-semibold text-[var(--accent-strong)]">今回の Take</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">{scriptTitle}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-ink-600">
            {isCurrentLatest ? <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-[var(--accent-strong)]">最新テイク</span> : null}
            {isCurrentBest ? <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-[var(--accent-strong)]">ベストテイク</span> : null}
            <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1">Take {takeCount}</span>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[var(--line-subtle)] bg-[var(--surface-take-paper)] p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">score</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">{score}</p>
          <p className="mt-2 text-xs leading-5 text-ink-600">採点表ではなく、次の1点を決める目印です。</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <section className="rounded-[1.5rem] border border-[var(--line-inset)] bg-[var(--surface-paper)] p-5">
          <h2 className="text-base font-semibold text-ink-900">次はここだけ</h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
            {focusPoints.map((point, index) => (
              <li key={point} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-notice)] text-xs font-semibold text-[var(--accent-strong)]">
                  {index + 1}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[1.5rem] border border-[var(--line-inset)] bg-[var(--surface-paper)] p-5">
          <h2 className="text-base font-semibold text-ink-900">コーチメモ</h2>
          <p className="mt-3 text-sm leading-6 text-ink-700">{advice}</p>
        </section>
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-[var(--line-dark)] bg-[var(--control-panel)] p-4 text-sm font-semibold shadow-[var(--shadow-studio-soft)]">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[rgba(255,241,221,0.62)]">次の操作</p>
        <div className="flex flex-wrap gap-3">
        <Link href={recordHref} className="inline-flex w-full justify-center rounded-2xl bg-[var(--record-accent)] px-5 py-3 text-white shadow-sm sm:w-auto">
          もう一度録る
        </Link>
        <Link href={brushUpHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line-dark)] bg-white/10 px-5 py-3 text-[var(--cta-primary-text)] sm:w-auto">
          この台本を磨く
        </Link>
        {bestReviewHref ? (
          <Link href={bestReviewHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line-dark)] bg-white/10 px-5 py-3 text-[var(--cta-primary-text)] sm:w-auto">
            ベストを確認
          </Link>
        ) : null}
        <Link href="/progress" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line-dark)] bg-white/10 px-5 py-3 text-[var(--cta-primary-text)] sm:w-auto">
          声のログ
        </Link>
        <Link href="/scripts" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line-dark)] bg-white/10 px-5 py-3 text-[var(--cta-primary-text)] sm:w-auto">
          1分ストック
        </Link>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-600">
        細かいメモは下にまとめています。まずはこの 1〜3 点だけ見て、次の Take に戻れば十分です。
      </p>
      {isCurrentBest ? (
        <BestResultExportActions
          audioHref={canPlaybackRecording ? `/api/takes/${takeId}/audio` : null}
          title={scriptTitle}
          score={score}
          dateLabel={formatReviewDate(reviewedAt)}
          comment={exportComment}
          variant="studio"
        />
      ) : null}
    </section>
  );
}

function getReviewFocusPoints({
  weakWords,
  coach,
  practiceGuidance
}: {
  weakWords: Array<{ word: string }>;
  coach: {
    bulletPointsJa: string[];
    focusWords: string[];
  };
  practiceGuidance: PracticeGuidance;
}) {
  const points = [
    ...weakWords.slice(0, 2).map((word) => `「${word.word}」を急がず最後まで言い切る`),
    ...practiceGuidance.focusWords.slice(0, 2).map((word) => `次の録音では「${word}」だけを意識する`),
    ...coach.focusWords.slice(0, 2).map((word) => `「${word}」を短い塊で言い直す`),
    ...coach.bulletPointsJa
  ];
  const uniquePoints = Array.from(new Set(points.map((point) => point.trim()).filter(Boolean)));

  if (uniquePoints.length > 0) {
    return uniquePoints.slice(0, 3);
  }

  return [
    "語尾まで落とさず言い切る",
    "一文ごとに軽く息を入れる",
    "完璧に直そうとせず、同じ script をもう一度録る"
  ];
}

function getReviewOneLineAdvice({
  coach,
  practiceGuidance
}: {
  coach: {
    nextStepJa: string;
    summaryJa: string;
  };
  practiceGuidance: PracticeGuidance;
}) {
  return practiceGuidance.executionCueJa || coach.nextStepJa || coach.summaryJa;
}

function getReviewCurrentStep({
  comparison,
  canPlaybackRecording
}: {
  comparison:
    | {
        takeCount: number;
        isBest: boolean;
        diff: unknown | null;
      }
    | null;
  canPlaybackRecording: boolean;
}) {
  if (comparison?.isBest) {
    return {
      tone: "steady" as const,
      titleJa: "結果を確認し終えて、次の 1 本を決める段階",
      summaryJa: canPlaybackRecording
        ? "この結果は現在のベストです。必要なら保存済み録音を短く聞き返し、感覚を崩さずに次の 1 本を足すかを決める段階です。"
        : "この結果は現在のベストです。コーチメモと Focus words を確認し、感覚を崩さずに次の 1 本を足すかを決める段階です。"
    };
  }

  if (comparison?.diff) {
    return {
      tone: "focus" as const,
      titleJa: "結果を見て、聞き直すか録り直すかを決める段階",
      summaryJa: canPlaybackRecording
        ? "保存済み録音と Focus words を照らし合わせながら、まず聞き直すか、そのまま録り直すかをここで決めます。"
        : "Focus words とコーチメモを見ながら、まず聞き直すか、そのまま録り直すかをここで決めます。"
    };
  }

  return {
    tone: "info" as const,
    titleJa: "最初の結果を確認して次へ戻る段階",
    summaryJa: "比較はまだ少ないので、この結果の Focus words とコーチメモを見て、そのまま次の聞く / 録るに戻る段階です。"
  };
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatReviewDate(value: string | null) {
  if (!value) {
    return "日付なし";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "日付なし";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toProgressTakeSummaryFromReview(review: ReturnType<typeof hydrateStoredReview>): ProgressTakeSummary {
  return {
    id: review.take.id,
    scriptId: review.take.script_id,
    score: review.evaluation.score,
    accuracyScore: review.evaluation.accuracyScore,
    fluencyScore: review.evaluation.fluencyScore,
    rhythmScore: review.evaluation.rhythmScore,
    reviewedAt: review.take.reviewed_at,
    createdAt: review.take.created_at,
    transcriptText: review.take.transcript_text,
    weakWords: review.evaluation.weakWords,
    coach: review.coach,
    evaluation: review.evaluation
  };
}

function getReviewComparisonSectionTitle(input: {
  isCurrentLatest: boolean;
  isCurrentBest: boolean;
}) {
  if (input.isCurrentBest) {
    return "ベスト結果として見るポイント";
  }

  return input.isCurrentLatest ? "最新結果とベスト結果の差" : "この結果とベスト結果の差";
}

function getComparisonPriorityText(diff: {
  regressedWeakWords: string[];
  commonWeakWords: string[];
  improvedWeakWords: string[];
  scoreDelta: number;
}) {
  if (diff.regressedWeakWords.length > 0) {
    return `いちばん先に戻したいのは ${formatWordListWithOverflow(diff.regressedWeakWords).replaceAll(" / ", "、")} です。ここを直せるとベスト結果に近づきやすいです。`;
  }

  if (diff.commonWeakWords.length > 0) {
    return `ベスト結果と比べても ${formatWordListWithOverflow(diff.commonWeakWords).replaceAll(" / ", "、")} は残っています。次の 1 本ではここだけに集中して十分です。`;
  }

  if (diff.improvedWeakWords.length > 0) {
    return `${formatWordListWithOverflow(diff.improvedWeakWords).replaceAll(" / ", "、")} は改善しています。大きく変えずに同じ感覚で録る価値があります。`;
  }

  return `差分は主にスコア ${diff.scoreDelta > 0 ? "+" : ""}${diff.scoreDelta} です。今は発音点よりテンポの整え直しを優先するとまとまりやすいです。`;
}

function PracticeGuidanceSection({
  guidance,
  comparisonSectionTitle
}: {
  guidance: PracticeGuidance;
  comparisonSectionTitle: string;
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6">
      <p className="text-sm font-semibold text-[var(--accent-strong)]">次はここだけ</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-900">{guidance.actionLabelJa}</h2>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-500">{getGuidanceActionBadgeLabel(guidance.actionKind)}</p>
      <p className="mt-4 text-sm leading-6 text-ink-800">{guidance.summaryJa}</p>
      <p className="mt-3 text-sm leading-6 text-ink-600">{guidance.reasonJa}</p>
      <p className="mt-3 text-sm leading-6 text-ink-700">今の実行指示: {guidance.executionCueJa}</p>
      {guidance.followupCueJa ? <p className="mt-2 text-sm leading-6 text-ink-600">次に録る時: {guidance.followupCueJa}</p> : null}
      {guidance.focusReasonJa ? <p className="mt-3 text-sm leading-6 text-ink-600">今これを優先する理由: {guidance.focusReasonJa}</p> : null}
      {guidance.focusSummaryJa ? <p className="mt-3 text-sm leading-6 text-ink-700">{guidance.focusSummaryJa}</p> : null}
      {guidance.focusWords.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {guidance.focusWords.map((word) => (
            <span key={word} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-xs font-semibold text-ink-700">
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
          録音画面では、同じ録音で評価だけやり直すこともできます。
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-ink-600">迷ったら「{comparisonSectionTitle}」を見返し、聞き直すか、そのまま録るかだけ決めれば十分です。</p>
    </section>
  );
}

function ReviewNextActionSection({
  guidance,
  listenHref,
  recordHref,
  progressHref,
  latestReviewHref
}: {
  guidance: PracticeGuidance;
  listenHref: string;
  recordHref: string;
  progressHref: string;
  latestReviewHref: string | null;
}) {
  const primaryHref = guidance.actionKind === "listen" ? listenHref : recordHref;
  const secondaryHref = guidance.actionKind === "listen" ? recordHref : listenHref;
  const secondaryLabel = guidance.actionKind === "listen" ? "このまま録る" : "必要なら聞き直す";
  const decisionText =
    guidance.actionKind === "listen"
      ? latestReviewHref
        ? "耳を合わせ直したいならリズムを聞き直します。最新テイクを見直したいときだけ別導線を使います。"
        : "耳を合わせ直したいならリズムを聞き直し、十分ならそのまま録音へ進めます。"
      : latestReviewHref
        ? "そのまま録音へ戻るのが主導線です。最新テイクを見直したいときだけ別導線を使います。"
        : "そのまま録音へ戻るのが主導線です。迷うときだけリズム確認を1回挟みます。";

  return (
    <section className="rounded-[2rem] border border-[var(--line-dark)] bg-[var(--control-panel)] p-6 text-[var(--cta-primary-text)] shadow-[var(--shadow-studio-soft)]">
      <p className="text-sm font-semibold text-[rgba(255,241,221,0.68)]">次の操作</p>
      <h2 className="mt-2 text-2xl font-semibold text-[var(--cta-primary-text)]">次に戻る先を決める</h2>
      <p className="mt-3 text-sm leading-6 text-[rgba(255,241,221,0.78)]">{decisionText}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href={primaryHref} className="rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-white">
          {getGuidancePrimaryButtonLabel(guidance.actionKind)}
        </Link>
        <Link href={secondaryHref} className="rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-[var(--cta-primary-text)]">
          {secondaryLabel}
        </Link>
        {latestReviewHref ? (
          <Link href={latestReviewHref} className="rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-[var(--cta-primary-text)]">
            最新結果を見る
          </Link>
        ) : null}
        <Link href={progressHref} className="rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-[var(--cta-primary-text)]">
          ベストを確認
        </Link>
      </div>
      <p className="mt-3 text-sm leading-6 text-[rgba(255,241,221,0.68)]">迷ったら、戻り先だけ決めます。台本管理や別の結果確認は必要なときだけで十分です。</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-take-paper)] px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-ink-900">{value}</div>
    </div>
  );
}
