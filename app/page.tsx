import Link from "next/link";
import { pickLatestReviewedScriptCandidate, pickScriptsLaunchCandidate } from "@/lib/launchpad";
import { buildScriptListenVoiceSetupHref } from "@/lib/navigation";
import { getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProgressOverview, type ProgressTakeSummary, type ScriptProgressItem } from "@/services/progress";
import { getTranscriptionProviderStatus } from "@/services/transcription";
import { getVoiceSetupState } from "@/services/voice";

function getVoiceReady(input: {
  providerSupported: boolean;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
}) {
  return input.providerSupported && input.hasConsent && input.hasDefaultVoice;
}

function getBestReviewedItem(scripts: ScriptProgressItem[]) {
  return (
    scripts
      .filter((item) => item.bestTake)
      .sort((left, right) => {
        const leftScore = left.bestTake?.score ?? 0;
        const rightScore = right.bestTake?.score ?? 0;

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return (right.bestTake?.reviewedAt ?? right.bestTake?.createdAt ?? "").localeCompare(
          left.bestTake?.reviewedAt ?? left.bestTake?.createdAt ?? ""
        );
      })[0] ?? null
  );
}

function getPracticeHref(candidateScript: ScriptProgressItem | null, voiceReady: boolean) {
  if (!candidateScript) {
    return "/scripts/new";
  }

  if (!voiceReady) {
    return buildScriptListenVoiceSetupHref(candidateScript.script.id, "/");
  }

  return getScriptListenPath(candidateScript.script.id);
}

function getWeakWordSummary(take: ProgressTakeSummary) {
  const words = take.weakWords.slice(0, 3).map((word) => word.word).filter(Boolean);

  if (words.length === 0) {
    return "弱点語は大きく目立っていません。";
  }

  return `次は ${words.join(" / ")} を軽く意識。`;
}

function getLatestResultSummary(latestReviewedItem: ScriptProgressItem | null) {
  if (!latestReviewedItem?.latestTake) {
    return "まだ保存済み結果はありません。最初の1本を録ると、ここに短い振り返りが出ます。";
  }

  const take = latestReviewedItem.latestTake;
  const coachLine = take.coach.nextStepJa || take.coach.summaryJa;

  return `前回は「${latestReviewedItem.script.title}」で ${take.score} 点。${coachLine || getWeakWordSummary(take)}`;
}

function getFirstLine(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  const sentenceEnd = compact.search(/[.!?。！？]/);
  const firstLine = sentenceEnd >= 0 ? compact.slice(0, sentenceEnd + 1) : compact;

  return firstLine.length > 86 ? `${firstLine.slice(0, 86)}...` : firstLine;
}

function getStockAction(item: ScriptProgressItem, voiceReady: boolean) {
  if (!voiceReady && item.takeCount === 0) {
    return {
      label: "声を準備",
      href: buildScriptListenVoiceSetupHref(item.script.id, "/")
    };
  }

  if (item.takeCount > 0 && item.improvementTrend === "up") {
    return {
      label: "録る",
      href: getScriptRecordPath(item.script.id)
    };
  }

  return {
    label: "練習する",
    href: getScriptListenPath(item.script.id)
  };
}

function LoggedOutHome() {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
      <div className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.16),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,248,246,0.92))] p-6 shadow-soft sm:p-8 lg:p-10">
          <p className="text-sm font-semibold text-[var(--accent-strong)]">今日の1分</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          今日の1分を録って、次の一言だけ直す。
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink-600">
          Native Minute は、固定1分の台本を「作る・聞いてまねる・録音して直す」ためのアプリです。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-strong)] sm:w-auto"
          >
            ログインして練習を始める
          </Link>
        </div>
      </div>

      <aside className="rounded-[2rem] border border-[var(--line)] bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold text-ink-500">練習の流れ</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ink-700">
            <li>1. 作る</li>
            <li>2. 聞いてまねる</li>
            <li>3. 録音して評価</li>
            <li>4. 直す / ベストを残す</li>
          </ul>
      </aside>
    </section>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <LoggedOutHome />;
  }

  const supabase = createSupabaseServerClient();
  const [overview, voiceSetup] = await Promise.all([
    getProgressOverview(supabase, user.id),
    getVoiceSetupState(supabase, user.id)
  ]);
  const transcriptionStatus = getTranscriptionProviderStatus();
  const candidateScript = pickScriptsLaunchCandidate(overview.scripts, transcriptionStatus.supported);
  const latestReviewedItem = pickLatestReviewedScriptCandidate(overview.scripts);
  const bestReviewedItem = getBestReviewedItem(overview.scripts);
  const voiceReady = getVoiceReady({
    providerSupported: voiceSetup.providerSupported,
    hasConsent: Boolean(voiceSetup.consent),
    hasDefaultVoice: Boolean(voiceSetup.defaultVoice)
  });
  const primaryHref = getPracticeHref(candidateScript, voiceReady);
  const stockLimit = 5;
  const stockScripts = overview.scripts.slice(0, stockLimit);
  const stockFull = overview.totalScripts >= stockLimit;

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,251,248,0.9))] p-6 shadow-soft sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--accent-strong)]">練習ストック</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">どの練習をする？</h1>
            </div>
            <div className="rounded-[1.5rem] border border-white/80 bg-white/90 px-5 py-4 shadow-sm">
              <p className="text-sm font-semibold text-ink-500">練習課題</p>
              <p className="mt-1 text-4xl font-semibold text-[var(--accent-strong)]">{Math.min(overview.totalScripts, stockLimit)} / {stockLimit}</p>
            </div>
          </div>

          {stockScripts.length > 0 ? (
            <div className="mt-7 grid gap-4">
              {stockScripts.map((item) => {
                const action = getStockAction(item, voiceReady);
                const reviewHref = item.latestTake ? getScriptReviewPath(item.script.id, item.latestTake.id) : null;

                return (
                  <article key={item.script.id} className="rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-ink-900">{item.script.title}</h2>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-700">{getFirstLine(item.script.content)}</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--accent-strong)]">
                          {item.latestTake ? `最新 ${item.latestTake.score}点` : "未着手"}
                        </p>
                      </div>
                      <div className="grid shrink-0 gap-2 text-sm font-semibold sm:w-36">
                        <Link href={action.href} className="inline-flex justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-white">
                          {action.label}
                        </Link>
                        {reviewHref ? (
                          <Link href={reviewHref} className="inline-flex justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
                            結果
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-7 rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-ink-900">最初の練習を作ります。</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">1本作ると、ここからすぐ聞いてまねる練習に入れます。</p>
            </div>
          )}

          <div className="mt-6 grid gap-3 text-sm font-semibold sm:max-w-xs">
            <Link href={primaryHref} className="inline-flex justify-center rounded-2xl bg-[var(--accent)] px-5 py-4 text-white shadow-sm transition hover:bg-[var(--accent-strong)]">
              練習を選ぶ
            </Link>
            {stockFull ? (
              <span className="inline-flex justify-center rounded-2xl border border-[var(--line)] bg-white/70 px-5 py-4 text-ink-500">
                5本あります。整理してから追加
              </span>
            ) : (
              <Link href="/scripts/new" className="inline-flex justify-center rounded-2xl border border-[var(--line)] bg-white px-5 py-4 text-ink-800 transition hover:bg-ink-50">
                新しい練習を追加
              </Link>
            )}
          </div>
        </div>

        <aside className="rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,255,0.94))] p-6 shadow-soft">
          <p className="text-sm font-semibold text-ink-500">最新結果</p>
          <p className="mt-4 text-sm leading-6 text-ink-700">{getLatestResultSummary(latestReviewedItem)}</p>
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
            <p className="text-xs font-semibold text-ink-500">ベスト</p>
            <p className="mt-2 text-sm leading-6 text-ink-700">
              {bestReviewedItem?.bestTake
                ? `「${bestReviewedItem.script.title}」 ${bestReviewedItem.bestTake.score} 点`
                : "ベスト結果は、最初の録音が保存されるとここから追えるようになります。"}
            </p>
            <Link href="/progress" className="mt-4 inline-flex rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
              ベストを確認
            </Link>
          </div>
        </aside>
      </div>

      {!voiceReady ? (
        <div className="rounded-[2rem] border border-[var(--line)] bg-amber-50 px-5 py-4 text-sm leading-6 text-ink-700">
          <p className="font-semibold text-ink-900">お手本ボイスの準備がまだです</p>
          <p className="mt-1">
            練習台本は先に作れます。お手本を聞く前に、声を1つ設定します。
          </p>
          <Link href={candidateScript ? buildScriptListenVoiceSetupHref(candidateScript.script.id, "/") : "/setup/voice"} className="mt-3 inline-flex font-semibold text-[var(--accent-strong)]">
            声の設定へ
          </Link>
        </div>
      ) : null}

    </section>
  );
}
