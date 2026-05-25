import Link from "next/link";
import { redirect } from "next/navigation";
import { pickScriptsLaunchCandidate } from "@/lib/launchpad";
import { buildLoginHref, buildScriptListenVoiceSetupHref, buildVoiceSetupHref } from "@/lib/navigation";
import { getDuplicateScriptPath, getScriptListenPath, getScriptRecordPath } from "@/lib/script-routes";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteScriptButton } from "@/components/scripts/delete-script-button";
import { getProgressOverview, type ScriptProgressItem } from "@/services/progress";
import { getTranscriptionProviderStatus } from "@/services/transcription";
import { getVoiceSetupState } from "@/services/voice";

const MAX_VISIBLE_PRACTICES = 5;

function getVoiceReady(input: {
  providerSupported: boolean;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
}) {
  return input.providerSupported && input.hasConsent && input.hasDefaultVoice;
}

function getNextAction(item: ScriptProgressItem, input: { voiceReady: boolean; canRecord: boolean }) {
  if (!input.voiceReady && item.takeCount === 0) {
    return "声を準備して、お手本へ";
  }

  if (item.takeCount === 0) {
    return "聞いてまねる";
  }

  if (!input.canRecord) {
    return "お手本で練習";
  }

  if (item.improvementTrend === "down") {
    return "聞いてまね直す";
  }

  if (item.improvementTrend === "up") {
    return "もう一回録る";
  }

  return "聞いてまねる";
}

function getCardPrimaryHref(item: ScriptProgressItem, input: { voiceReady: boolean; canRecord: boolean }) {
  if (!input.voiceReady && item.takeCount === 0) {
    return buildScriptListenVoiceSetupHref(item.script.id, "/scripts");
  }

  if (input.canRecord && item.takeCount > 0 && item.improvementTrend === "up") {
    return getScriptRecordPath(item.script.id);
  }

  return getScriptListenPath(item.script.id);
}

function getCardPrimaryLabel(item: ScriptProgressItem, input: { voiceReady: boolean; canRecord: boolean }) {
  if (!input.voiceReady && item.takeCount === 0) {
    return "声の準備";
  }

  if (input.canRecord && item.takeCount > 0 && item.improvementTrend === "up") {
    return "Take を録る";
  }

  return "1分を始める";
}

function getFirstLine(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  const sentenceEnd = compact.search(/[.!?。！？]/);
  const firstLine = sentenceEnd >= 0 ? compact.slice(0, sentenceEnd + 1) : compact;

  if (firstLine.length <= 92) {
    return firstLine;
  }

  return `${firstLine.slice(0, 92)}...`;
}

export default async function ScriptsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(buildLoginHref("/scripts", "login_required", "/scripts"));
  }

  const supabase = createSupabaseServerClient();
  const [overview, voiceSetup] = await Promise.all([
    getProgressOverview(supabase, user.id),
    getVoiceSetupState(supabase, user.id)
  ]);
  const transcriptionStatus = getTranscriptionProviderStatus();
  const canRecord = transcriptionStatus.supported;
  const scripts = overview.scripts;
  const visibleScripts = scripts.slice(0, MAX_VISIBLE_PRACTICES);
  const hiddenScriptCount = Math.max(0, scripts.length - visibleScripts.length);
  const candidateScript = pickScriptsLaunchCandidate(scripts, canRecord);
  const voiceReady = getVoiceReady({
    providerSupported: voiceSetup.providerSupported,
    hasConsent: Boolean(voiceSetup.consent),
    hasDefaultVoice: Boolean(voiceSetup.defaultVoice)
  });

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[2rem] border border-[var(--studio-line)] bg-[linear-gradient(135deg,var(--studio-panel),var(--studio-surface)_58%,var(--studio-surface-strong))] p-6 shadow-soft sm:p-8 lg:p-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <div aria-hidden="true" className="mb-5 flex max-w-xs gap-2">
              {[0, 1, 2, 3, 4].map((slot) => (
                <span key={slot} className={`h-2 flex-1 rounded-full ${slot < Math.min(scripts.length, MAX_VISIBLE_PRACTICES) ? "bg-[var(--studio-ink)]" : "bg-[rgba(45,38,31,0.12)]"}`} />
              ))}
            </div>
            <p className="text-sm font-semibold text-[var(--studio-accent-strong)]">1分ストック</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">今日録る1本を選ぶ</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink-700">5本まで置いて、今日の Take を残す1本を選びます。</p>
          </div>
          <div className="rounded-[1.75rem] border border-[var(--studio-ink)] bg-[var(--studio-ink)] p-6 text-white shadow-sm">
            <p className="text-sm font-semibold text-white/80">今日の1分</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-white">1分ストック {Math.min(scripts.length, MAX_VISIBLE_PRACTICES)} / {MAX_VISIBLE_PRACTICES}</p>
            <p className="mt-1 text-sm leading-6 text-white/70">
              {scripts.length === 0 ? "まず1テイク用の1本を作ります。" : hiddenScriptCount > 0 ? `表示は5個まで。ほか ${hiddenScriptCount} 件は絞っています。` : "5本まで置けます。"}
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:items-center">
          <p className="text-sm leading-6 text-ink-700">
            {scripts.length > 0 ? "今ある1分から選びます。" : "まずは新しい1分を作ります。"}
          </p>
          {scripts.length < MAX_VISIBLE_PRACTICES ? (
            <Link href="/scripts/new" className="inline-flex w-full justify-center rounded-2xl bg-[var(--studio-ink)] px-5 py-4 text-white shadow-sm transition hover:opacity-90 sm:w-auto">
              新しい1分を作る
            </Link>
          ) : (
            <span className="inline-flex w-full justify-center rounded-2xl border border-[var(--studio-line)] bg-[rgba(255,250,243,0.7)] px-5 py-4 text-ink-500 sm:w-auto">
              5本あります。整理してから追加
            </span>
          )}
        </div>
      </div>

      {!voiceReady ? (
        <div className="rounded-[2rem] border border-[#ead1b7] bg-[#fff5e8] px-5 py-4 text-sm leading-6 text-ink-700">
          <p className="font-semibold text-ink-900">お手本ボイスを聞く前に、声の準備が必要です。</p>
          <p className="mt-1">台本は先に作れます。練習開始時に必要な分だけ案内します。</p>
          <Link href={candidateScript ? buildScriptListenVoiceSetupHref(candidateScript.script.id, "/scripts") : buildVoiceSetupHref("/scripts", "/scripts")} className="mt-3 inline-flex font-semibold text-[var(--studio-accent-strong)]">
            声の設定へ
          </Link>
        </div>
      ) : null}

      {!canRecord ? (
        <div className="rounded-[2rem] border border-[#ead1b7] bg-[#fff5e8] px-5 py-4 text-sm leading-6 text-ink-700">
          <p className="font-semibold text-ink-900">録音評価の準備がまだです。</p>
          <p className="mt-1">お手本を聞くところまでは進められます。評価保存に入る前に設定を確認します。</p>
        </div>
      ) : null}

      {scripts.length === 0 ? (
        <div className="rounded-[2rem] border border-[var(--studio-line)] bg-[var(--studio-panel)] p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-ink-900">最初の1分を作りましょう。</h2>
          <p className="mt-3 text-sm leading-6 text-ink-600">映画やドラマのセリフっぽい言い回し、仕事、旅行、自己紹介など、話してみたいテーマから始められます。</p>
          <Link href="/scripts/new" className="mt-5 inline-flex rounded-2xl bg-[var(--studio-ink)] px-5 py-3 text-sm font-semibold text-white">
            1分を作る
          </Link>
        </div>
      ) : (
        <div className="grid gap-5">
          {visibleScripts.map((item) => {
            const primaryHref = getCardPrimaryHref(item, { voiceReady, canRecord });
            const primaryLabel = getCardPrimaryLabel(item, { voiceReady, canRecord });

            return (
              <article key={item.script.id} className="rounded-[2rem] border border-[var(--studio-line)] bg-[linear-gradient(180deg,var(--studio-panel),var(--studio-surface))] p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(126,67,46,0.32)] hover:shadow-soft sm:p-7">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-ink-900">{item.script.title}</h2>
                      <span className="rounded-full border border-[var(--studio-line)] bg-[rgba(255,250,243,0.78)] px-3 py-1 text-xs font-semibold text-ink-600">
                        {item.takeCount > 0 ? `Take ${item.takeCount}回` : "まだ録っていない"}
                      </span>
                    </div>
                    <p className="mt-4 text-base leading-7 text-ink-700">{getFirstLine(item.script.content)}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-[#e5d4c2] bg-[#f2e6d8] p-5">
                    <p className="text-xs font-semibold text-ink-500">最新テイク</p>
                    <p className="mt-1 text-4xl font-semibold text-ink-900">{item.latestTake?.score ?? "-"}</p>
                    <p className="mt-3 text-xs font-semibold text-ink-500">次はここだけ</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--studio-accent-strong)]">{getNextAction(item, { voiceReady, canRecord })}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
                  <Link href={primaryHref} className="inline-flex w-full justify-center rounded-2xl bg-[var(--studio-ink)] px-5 py-4 text-white shadow-sm transition hover:opacity-90 sm:w-auto">
                    {primaryLabel}
                  </Link>
                </div>
                <details className="mt-4 rounded-2xl border border-[var(--studio-line)] bg-[rgba(255,250,243,0.68)] px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink-700">その他の操作</summary>
                  <div className="mt-4 grid gap-2 text-sm font-semibold sm:max-w-xs">
                    <Link href={getScriptListenPath(item.script.id)} className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-surface)] px-4 py-3 text-ink-700">
                      お手本へ
                    </Link>
                    <Link href={getScriptRecordPath(item.script.id)} className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-surface)] px-4 py-3 text-ink-700">
                      録る
                    </Link>
                    <Link href={getDuplicateScriptPath(item.script.id)} className="rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-surface)] px-4 py-3 text-ink-700">
                      この台本を磨く
                    </Link>
                    <DeleteScriptButton scriptId={item.script.id} scriptTitle={item.script.title} />
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
