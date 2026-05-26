import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref } from "@/lib/navigation";
import { timeAsync } from "@/lib/performance/timing";
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
  const user = await timeAsync("record.page.auth", () => getCurrentUser());
  const listenHref = getScriptListenPath(id);
  const recordHref = getScriptRecordPath(id);

  if (!user) {
    redirect(buildLoginHref(recordHref, "login_required", "/scripts"));
  }

  const supabase = createSupabaseServerClient();
  const script = await timeAsync("record.page.script", () => getScript(supabase, user.id, id));
  const transcriptionStatus = getTranscriptionProviderStatus();
  const pronunciationStatus = getPronunciationProviderStatus();
  const overview = await timeAsync("record.page.progressOverview", () => getProgressOverview(supabase, user.id));
  const progressItem = overview.scripts.find((item) => item.script.id === id) ?? null;
  const latestReviewHref = progressItem?.latestTake ? getScriptReviewPath(id, progressItem.latestTake.id) : null;
  const practiceChunks = createPracticeChunks(script?.content ?? "");
  const practiceFocusWords = getPracticeFocusWords(progressItem);

  if (!script) {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="今日の1分が見つかりません"
          summary="対象の1分を取得できませんでした。1分ストックから選び直します。"
          tone="alert"
        />
        <StateActionSection
          eyebrow="設定・管理"
          title="戻る先を決める"
          summary="まず1分ストックに戻って対象を選び直します。"
          actions={[
            { label: "1分ストック", href: "/scripts", tone: "primary" }
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
      <div data-testid="record-practice-first-view" className="relative overflow-hidden rounded-[2rem] border border-[var(--line-dark)] bg-[linear-gradient(135deg,var(--control-panel),var(--control-panel-soft))] p-6 text-white shadow-[var(--shadow-studio-lift)] sm:p-8">
        <div aria-hidden="true" className="absolute right-6 top-6 flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--record-accent)]" />
          REC
        </div>
        <p className="text-sm font-semibold text-white/70">録音ブース</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">まず1テイク残す</h1>
        <p className="mt-3 text-base font-semibold text-white/90">{script.title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
          お手本をまねたら、30〜60秒で今日の Take を録ります。完璧より、まず1本残して評価へ進みます。
        </p>
        <div className="mt-5 rounded-[1.5rem] border border-[rgba(255,241,221,0.28)] bg-[var(--script-paper)] p-5 text-ink-900 shadow-[0_16px_40px_rgba(14,13,20,0.18)]">
          <p className="text-xs font-semibold text-[var(--accent-strong)]">今日の台本</p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-8 text-ink-900">{script.content}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#record-evaluate-panel" className="inline-flex w-full justify-center rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-white shadow-[0_16px_38px_rgba(184,78,55,0.22)] transition hover:bg-[var(--record-accent-strong)] sm:w-auto">
            Take を録る
          </a>
          <Link href={listenHref} className="inline-flex w-full justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white transition hover:bg-white/15 sm:w-auto">
            もう一度まねる
          </Link>
          {latestReviewHref ? (
            <Link href={latestReviewHref} className="inline-flex w-full justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white transition hover:bg-white/15 sm:w-auto">
              次はここだけを見る
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4">
        <div id="record-evaluate-panel" className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--studio-surface-secondary)] p-4 shadow-[var(--shadow-studio-soft)] sm:p-6">
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

      <details className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6 shadow-[var(--shadow-studio-soft)]">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">録音前の区切りを見る</summary>
        <div className="mt-5 space-y-5">
          <ScriptPracticeChunks
            testId="record-practice-chunks"
            chunks={practiceChunks}
            focusWords={practiceFocusWords}
            summary="録音では全文を一気に急がず、意味の塊ごとに息継ぎします。速さより区切りを優先し、最後の語尾まで落とさず言い切ります。"
            actionCue="録る前に、区切り1から声に出して確認"
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
