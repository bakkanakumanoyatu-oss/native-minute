import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref } from "@/lib/navigation";
import { createPracticeChunks } from "@/lib/script-practice-chunks";
import { getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProgressOverview } from "@/services/progress";
import { getPronunciationProviderStatus } from "@/services/pronunciation";
import { getScript } from "@/services/scripts/scripts.service";
import { getTranscriptionProviderStatus } from "@/services/transcription";
import { RecordAndEvaluatePanel } from "@/components/record/record-and-evaluate-panel";
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
          title="録音する台本が見つからない状態"
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
          summary="新しい台本を作るか、直近の成果を見たいときだけ使います。"
          actions={[
            { label: "新しい台本を作る", href: "/scripts/new" },
            { label: "ベスト確認", href: "/progress" }
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

        </div>
      </details>

      <div className="grid gap-4">
        <div id="record-evaluate-panel" className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold">
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
