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

  return (
    <section className="space-y-6">
      <div data-testid="record-practice-first-view" className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.15),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.92))] p-6 shadow-soft sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Record</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">録音して評価へ</h1>
        <p className="mt-3 text-base font-semibold text-ink-800">{script.title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">
          まず 30〜60秒を目安に録音します。細かい設定より、録音して評価に進むことを優先します。
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#record-evaluate-panel" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-white shadow-sm sm:w-auto">
            録音を始める
          </a>
          <Link href={listenHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800 sm:w-auto">
            先に listen
          </Link>
          {latestReviewHref ? (
            <Link href={latestReviewHref} className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800 sm:w-auto">
              最新結果を見る
            </Link>
          ) : null}
        </div>
        <details className="mt-5 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">台本を見る</summary>
          <p className="mt-3 text-sm leading-6 text-ink-700">{script.content}</p>
        </details>
      </div>

      <details className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">Details / 録音前の区切りと状態を見る</summary>
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
              ? "いまは record の保存前提が不足しています。設定を整えるまでは、この script の listen を保つか、既存の最新結果を見返しながら戻り先を決める段階です。"
              : !pronunciationStatus.supported
                ? "いまは evaluation の前提が不足しています。録音までは準備できますが、保存済み結果を増やす前に evaluator 側の設定を確認する段階です。"
              : null}
          />
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="order-2 space-y-4 rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm lg:order-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800">Details / Recovery plan と provider 前提を見る</summary>
          <div className="mt-5 space-y-4">
          <StateStepSection
            title="録音して評価保存へ進む段階"
            summary={progressItem?.takeCount
              ? "record は、録音を準備して評価保存まで進める画面です。いまは保存済み結果の続きから戻ってくる段階なので、迷ったら listen か最新結果を一度だけ見返してから次の 1 本を作れます。"
              : "record は、録音を準備して評価保存まで進める画面です。細かい重点は右側の `Next step / Recovery plan / Next action` を見ながら進め、迷ったら一つ前の listen を補助で挟めます。"}
          />
          <div className="rounded-2xl border border-[var(--line)] bg-ink-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">次の一手の前提</p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-ink-700">
              <li>・録音ファイルを保存してから評価します。</li>
              <li>・主導線は実音声です。mock transcript は開発用補助です。</li>
              <li>・Azure pronunciation assessment を使うときは、非 wav 録音も upload 前に client 側で wav/PCM へ正規化します。</li>
              <li>・pronunciation evaluator が未接続のときは、Azure を深追いせず mock に戻して継続します。</li>
              <li>・短すぎる録音は score が落ちやすいので、1 分に近い録音を目指します。</li>
              <li>・保存後に評価だけ失敗した場合は、同じ録音のまま再試行できます。</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-4 text-sm text-ink-600">
            録音 → 保存 → 文字起こし → 評価 → 保存
          </div>
          {!transcriptionStatus.supported ? (
            <div className="space-y-4">
              <StateStepSection
                eyebrow="Recovery plan"
                title="文字起こしの前提を整える"
                summary={transcriptionStatus.message ?? "record を続けるには、文字起こし provider の前提を整える必要があります。"}
                tone="alert"
              />
              <StateActionSection
                eyebrow="Next action"
                title="いま戻る先を決める"
                summary="設定を直すまで評価保存は進めません。まずは listen で見本確認を保つか、scripts に戻って別の script や route を選び直します。"
                actions={[
                  { label: "listen", href: getScriptListenPath(script.id), tone: "primary" },
                  ...(latestReviewHref ? [{ label: "最新結果を見る", href: latestReviewHref }] : []),
                  { label: "scripts", href: "/scripts" }
                ]}
              />
              <StateActionSection
                eyebrow="Other actions"
                title="補助導線"
                summary="listen や progress を見直したいときだけ使います。"
                actions={[
                  { label: "progress", href: "/progress" }
                ]}
              />
            </div>
          ) : null}
          {transcriptionStatus.supported && !pronunciationStatus.supported ? (
            <div className="space-y-4">
              <StateStepSection
                eyebrow="Recovery plan"
                title="evaluation の前提を整える"
                summary={pronunciationStatus.message ?? "record を続けるには、pronunciation evaluator の前提を整える必要があります。"}
                tone="alert"
              />
              <StateActionSection
                eyebrow="Next action"
                title="いま戻る先を決める"
                summary="録音準備まではできますが、新しい保存済み結果はまだ増やしません。まずは listen を保つか scripts に戻り、evaluation provider を mock に戻してから再開します。"
                actions={[
                  { label: "listen", href: getScriptListenPath(script.id), tone: "primary" },
                  ...(latestReviewHref ? [{ label: "最新結果を見る", href: latestReviewHref }] : []),
                  { label: "scripts", href: "/scripts" }
                ]}
              />
            </div>
          ) : null}
          </div>
        </details>

        <div id="record-evaluate-panel" className="order-1 rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm lg:order-1">
          <h2 className="text-lg font-semibold text-ink-900">評価して保存する</h2>
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
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Other actions</p>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {transcriptionStatus.supported
                ? pronunciationStatus.supported
                  ? latestReviewHref
                  ? "record 中の判断は上で完結できます。ここでは最新結果の見直しや script 管理など、補助導線だけをまとめています。"
                  : "record 中の判断は上で完結できます。ここでは script 管理や別画面への補助導線だけをまとめています。"
                  : "いまは evaluator 側の前提が不足しています。ここでは listen / scripts / progress など、継続判断用の補助導線だけをまとめています。"
                : "いまは設定前提の確認が必要です。ここでは listen / scripts / progress など、復旧用の補助導線だけをまとめています。"}
            </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href={getScriptListenPath(script.id)} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              listen
            </Link>
            {latestReviewHref ? (
              <Link href={latestReviewHref} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
                最新結果を見る
              </Link>
            ) : null}
            <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              scripts
            </Link>
            <Link href={getDuplicateScriptPath(script.id)} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              script を複製
            </Link>
            <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-ink-700">
              progress
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
