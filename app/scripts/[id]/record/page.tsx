import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref } from "@/lib/navigation";
import { createPracticeChunks } from "@/lib/script-practice-chunks";
import { getDuplicateScriptPath, getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProgressOverview } from "@/services/progress";
import { getPronunciationProviderStatus } from "@/services/pronunciation";
import { getScript } from "@/services/scripts/scripts.service";
import { getTranscriptionProviderStatus } from "@/services/transcription";
import { RecordAndEvaluatePanel } from "@/components/record/record-and-evaluate-panel";
import { ScriptLoopStatusCard } from "@/components/guidance/script-loop-status-card";
import { ScriptPracticeChunks } from "@/components/guidance/script-practice-chunks";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";

type PageParams = {
  params:
    | {
        id: string;
      }
    | Promise<{
        id: string;
      }>;
};

export default async function RecordPage({ params }: PageParams) {
  const { id } = await params;
  const user = await getCurrentUser();
  const listenHref = getScriptListenPath(id);
  const recordHref = getScriptRecordPath(id);

  if (!user) {
    redirect(buildLoginHref(recordHref, "login_required", "/scripts"));
  }

  const supabase = createSupabaseServerClient();
  const script = await getScript(supabase, user.id, id);
  const transcriptionStatus = getTranscriptionProviderStatus();
  const pronunciationStatus = getPronunciationProviderStatus();
  const overview = await getProgressOverview(supabase, user.id);
  const progressItem = overview.scripts.find((item) => item.script.id === id) ?? null;
  const latestReviewHref = progressItem?.latestTake ? getScriptReviewPath(id, progressItem.latestTake.id) : null;
  const practiceChunks = createPracticeChunks(script?.content ?? "");
  const practiceFocusWords = getPracticeFocusWords(progressItem);

  if (!script) {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="録音に進む script が見つからない状態"
          summary="この record は開けましたが、対象 script は取得できませんでした。いまは script を選び直して main loop に戻る段階です。"
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

  return (
    <section className="space-y-6">
      <div data-testid="record-practice-first-view" className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.15),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.92))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">録る</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">自分の声で録る</h1>
        <p className="mt-3 text-base font-semibold text-ink-800">{script.title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
          見本をまねて、30〜60秒を目安に録音します。細かい設定より、まず1回録って評価へ進みます。
        </p>
        <div className="mt-5 rounded-[1.5rem] border border-white/80 bg-white/85 p-5">
          <p className="text-xs font-semibold text-ink-500">英文</p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-8 text-ink-900">{script.content}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#record-evaluate-panel" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-white shadow-sm sm:w-auto">
            マイクで録音する
          </a>
          <Link href={listenHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800 sm:w-auto">
            お手本を聞く
          </Link>
          {latestReviewHref ? (
            <Link href={latestReviewHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800 sm:w-auto">
              直すところを見る
            </Link>
          ) : null}
        </div>
      </div>

      <details className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">録音前の区切りを見る</summary>
        <div className="mt-5 space-y-5">
          <ScriptPracticeChunks
            testId="record-practice-chunks"
            chunks={practiceChunks}
            focusWords={practiceFocusWords}
            summary="録音では全文を一気に急がず、意味の塊ごとに息継ぎします。速さより区切りを優先し、最後の語尾まで落とさず言い切ります。"
            actionCue="録音前に chunk 1 から順番に口だけで確認"
          />

          <ScriptLoopStatusCard
            currentStep="record"
            takeCount={progressItem?.takeCount ?? 0}
            improvementTrend={progressItem?.improvementTrend ?? "insufficient_data"}
            listenHref={listenHref}
            recordHref={recordHref}
            latestTake={progressItem?.latestTake ?? null}
            latestReviewHref={latestReviewHref}
            blockedSummary={!transcriptionStatus.supported
              ? "いまは録音保存の前提が不足しています。設定を整えるまでは、見本を聞くか、既存の最新結果を見返しながら戻り先を決める段階です。"
              : !pronunciationStatus.supported
                ? "いまは評価の前提が不足しています。録音までは準備できますが、保存済み結果を増やす前に設定を確認する段階です。"
              : null}
          />
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="order-2 space-y-4 rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm lg:order-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">うまくいかない時</summary>
          <div className="mt-5 space-y-4">
          <StateStepSection
            title="録音して評価保存へ進む段階"
            summary={progressItem?.takeCount
              ? "ここは、録音して評価保存まで進める画面です。迷ったら見本か最新結果を一度だけ見返してから次の1本を録れます。"
              : "ここは、録音して評価保存まで進める画面です。迷ったら一つ前の聞く画面を一度だけ挟めます。"}
          />
          <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手の前提</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-ink-700">
              <li>・録音ファイルを保存してから評価します。</li>
              <li>・短すぎる録音は score が落ちやすいので、1 分に近い録音を目指します。</li>
              <li>・保存後に評価だけ失敗した場合は、同じ録音のまま再試行できます。</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-4 text-sm text-ink-600">
            録音 → 確認 → 評価
          </div>
          {!transcriptionStatus.supported ? (
            <div className="space-y-4">
              <StateStepSection
                eyebrow="うまくいかない時"
                title="文字起こしの前提を整える"
                summary={transcriptionStatus.message ?? "録音を続けるには、文字起こしの前提を整える必要があります。"}
                tone="alert"
              />
              <StateActionSection
                eyebrow="次にやること"
                title="いま戻る先を決める"
                summary="設定を直すまで評価保存は進めません。まずは見本を聞くか、練習一覧に戻ります。"
                actions={[
                  { label: "聞く", href: getScriptListenPath(script.id), tone: "primary" },
                  ...(latestReviewHref ? [{ label: "最新結果を見る", href: latestReviewHref }] : []),
                  { label: "練習一覧", href: "/scripts" }
                ]}
              />
              <StateActionSection
                eyebrow="その他の操作"
                title="設定・管理"
                summary="進み具合を見直したいときだけ使います。"
                actions={[
                  { label: "ベスト確認", href: "/progress" }
                ]}
              />
            </div>
          ) : null}
          {transcriptionStatus.supported && !pronunciationStatus.supported ? (
            <div className="space-y-4">
              <StateStepSection
                eyebrow="うまくいかない時"
                title="evaluation の前提を整える"
                summary={pronunciationStatus.message ?? "録音を続けるには、評価の前提を整える必要があります。"}
                tone="alert"
              />
              <StateActionSection
                eyebrow="次にやること"
                title="いま戻る先を決める"
                summary="録音準備まではできますが、新しい保存済み結果はまだ増やしません。まずは聞く画面か練習一覧に戻ります。"
                actions={[
                  { label: "聞く", href: getScriptListenPath(script.id), tone: "primary" },
                  ...(latestReviewHref ? [{ label: "最新結果を見る", href: latestReviewHref }] : []),
                  { label: "練習一覧", href: "/scripts" }
                ]}
              />
            </div>
          ) : null}
          </div>
        </details>

        <div id="record-evaluate-panel" className="order-1 rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm lg:order-1">
          <h2 className="text-lg font-semibold text-ink-900">録音して評価へ</h2>
          <div className="mt-4 text-sm font-semibold">
            <RecordAndEvaluatePanel
              scriptId={script.id}
              targetSeconds={script.targetSeconds}
              listenHref={listenHref}
              transcriptionProvider={transcriptionStatus.provider}
              transcriptionSupported={transcriptionStatus.supported}
              transcriptionMessage={transcriptionStatus.message}
              pronunciationProvider={pronunciationStatus.provider}
              pronunciationSupported={pronunciationStatus.supported}
              pronunciationMessage={pronunciationStatus.message}
              pronunciationDiagnostics={pronunciationStatus.diagnostics}
              practiceContext={
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
                  : null
              }
            />
          </div>
          <div className="mt-6 rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs font-semibold text-ink-500">その他の操作</p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {transcriptionStatus.supported
                ? pronunciationStatus.supported
                  ? latestReviewHref
                  ? "録音中の判断は上で完結できます。ここでは最新結果の見直しや台本管理だけをまとめています。"
                  : "録音中の判断は上で完結できます。ここでは台本管理や別画面への操作だけをまとめています。"
                  : "いまは評価の前提が不足しています。ここでは聞く、練習一覧、ベスト確認だけをまとめています。"
                : "いまは設定前提の確認が必要です。ここでは聞く、練習一覧、ベスト確認だけをまとめています。"}
            </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <Link href={getScriptListenPath(script.id)} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              聞く
            </Link>
            {latestReviewHref ? (
              <Link href={latestReviewHref} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                直すところを見る
              </Link>
            ) : null}
            <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              練習一覧
            </Link>
            <Link href={getDuplicateScriptPath(script.id)} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              この台本を磨く
            </Link>
            <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              ベスト確認
            </Link>
          </div>
          </div>
        </div>
      </div>
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
