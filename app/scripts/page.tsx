import Link from "next/link";
import { redirect } from "next/navigation";
import { pickLatestReviewedScriptCandidate, pickScriptsLaunchCandidate } from "@/lib/launchpad";
import { buildLoginHref, buildScriptListenVoiceSetupHref, buildVoiceSetupHref } from "@/lib/navigation";
import { getDuplicateScriptPath, getScriptListenPath, getScriptRecordPath, getScriptReviewPath } from "@/lib/script-routes";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteScriptButton } from "@/components/scripts/delete-script-button";
import { TakeSummarySnapshot } from "@/components/guidance/take-summary-snapshot";
import { StateActionSection, StateStepSection, type StateActionLink } from "@/components/guidance/state-sections";
import { getProgressOverview } from "@/services/progress";
import type { ScriptProgressItem } from "@/services/progress";
import { getVoiceSetupState } from "@/services/voice";
import { getTranscriptionProviderStatus } from "@/services/transcription";

function getScriptsVoiceReadinessState(input: {
  providerSupported: boolean;
  hasConsent: boolean;
  hasDefaultVoice: boolean;
}) {
  if (!input.providerSupported) {
    return {
      kind: "provider_unavailable" as const,
      title: "voice 設定の前提が不足しています",
      summary: "listen を main loop の入口として使う前に、voice provider の前提を見直す必要があります。"
    };
  }

  if (!input.hasConsent) {
    return {
      kind: "consent_required" as const,
      title: "voice の同意がまだありません",
      summary: "script は先に作れますが、listen に進むには先に `/setup/voice` で同意を記録する必要があります。"
    };
  }

  if (!input.hasDefaultVoice) {
    return {
      kind: "voice_required" as const,
      title: "listen 用の voice がまだありません",
      summary: "script は選べますが、listen に入る前に voice を 1 つ作っておく必要があります。"
    };
  }

  return null;
}

export default async function ScriptsPage() {
  const user = await getCurrentUser();
  const voiceSetupFromScriptsHref = buildVoiceSetupHref("/scripts", "/scripts");

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
  const candidateScript = pickScriptsLaunchCandidate(scripts, canRecord);
  const latestReviewedItem = pickLatestReviewedScriptCandidate(scripts);
  const candidatePrimaryIsRecord = Boolean(canRecord && candidateScript && candidateScript.takeCount > 0 && candidateScript.improvementTrend === "up");
  const candidateListenVoiceSetupHref = candidateScript
    ? buildScriptListenVoiceSetupHref(candidateScript.script.id, "/scripts")
    : voiceSetupFromScriptsHref;
  const latestReviewedHref = latestReviewedItem?.latestTake
    ? getScriptReviewPath(latestReviewedItem.script.id, latestReviewedItem.latestTake.id)
    : null;
  const voiceReadiness = getScriptsVoiceReadinessState({
    providerSupported: voiceSetup.providerSupported,
    hasConsent: Boolean(voiceSetup.consent),
    hasDefaultVoice: Boolean(voiceSetup.defaultVoice)
  });
  const shouldShowTranscriptionRecovery = !voiceReadiness && !transcriptionStatus.supported;
  const primaryPracticeHref = voiceReadiness
    ? candidateListenVoiceSetupHref
    : candidateScript
      ? candidatePrimaryIsRecord
        ? getScriptRecordPath(candidateScript.script.id)
        : getScriptListenPath(candidateScript.script.id)
      : "/scripts/new";
  const primaryPracticeLabel = voiceReadiness
    ? "voice 設定を整える"
    : candidateScript
      ? candidatePrimaryIsRecord
        ? "今日の練習を record から始める"
        : "今日の練習を listen から始める"
      : "最初の練習を追加する";

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.14),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.94))] p-6 shadow-soft sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Practice library</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">今日の練習を選ぶ</h1>
            <p className="mt-3 text-sm leading-6 text-ink-600">まず 1 本だけ選びます。台本作成や複製は、練習を増やしたいときの補助操作です。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={primaryPracticeHref} className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-sm sm:w-auto">
              {primaryPracticeLabel}
            </Link>
            <Link href="/" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
              Home
            </Link>
            <Link href="/scripts/new" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
              新しい練習を追加
            </Link>
          </div>
        </div>
      </div>

      {voiceReadiness ? (
        <div className="space-y-4">
          <StateStepSection
            title={voiceReadiness.title}
            summary={voiceReadiness.summary}
            tone={voiceReadiness.kind === "provider_unavailable" ? "alert" : "focus"}
          />
          <StateActionSection
            eyebrow="Next action"
            title="不足している前提を先に補う"
            summary="script 一覧はこのまま見られますが、listen を主導線として使うなら先に voice 設定を整えておくと止まりにくくなります。"
            actions={[
              { label: "voice 設定", href: candidateListenVoiceSetupHref, tone: "primary" },
              { label: "新しい script を作る", href: "/scripts/new" }
            ]}
          />
        </div>
      ) : null}

      {shouldShowTranscriptionRecovery ? (
        <div className="space-y-4">
          <StateStepSection
            eyebrow="Recovery plan"
            title="record の前提が不足しています"
            summary={`${transcriptionStatus.message ?? "transcription provider の設定が不足しています。"} scripts や listen は進められますが、record で評価保存する前に設定を整える必要があります。`}
            tone="alert"
          />
          <StateActionSection
            eyebrow="Next action"
            title="いま進める導線を選ぶ"
            summary="まずは script を選ぶか listen まで進め、record で保存まで進めるのは設定を直したあとで十分です。"
            actions={getScriptsTranscriptionRecoveryActions(candidateScript, voiceSetupFromScriptsHref)}
          />
        </div>
      ) : null}

      {scripts.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <StateStepSection
            title="次に開く script を決める段階"
            summary="scripts は main loop の入口です。初回は listen から始め、録音をやり直したいときだけ record に直行します。台本自体を変えたいときは複製を使います。"
          />
          <StateActionSection
            eyebrow="Next action"
            title="ここでの選び方"
            summary={getScriptsPageActionSummary({
              voiceReadiness: Boolean(voiceReadiness),
              candidateScript
            })}
            actions={getScriptsPageActions({
              voiceReadiness: Boolean(voiceReadiness),
              candidateScript,
              candidatePrimaryIsRecord,
              candidateListenVoiceSetupHref
            })}
          />
        </div>
      ) : null}

      {scripts.length > 0 && overview.totalReviewedTakes === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <StateStepSection
            title="まだどの script にも保存済み結果がない状態"
            summary="初回導線だけを見れば十分です。まず 1 本選んで listen から入り、必要ならそのまま record で最初の結果を作ります。"
            tone="info"
          />
          <StateActionSection
            eyebrow="Next action"
            title="最初の 1 本を決める"
            summary={candidateScript
              ? `迷ったら「${candidateScript.script.title}」から始めます。未着手や戻りやすさを優先して 1 本だけ出しているので、ここでは候補か新規作成のどちらかを選べば十分です。`
              : "まず 1 本だけ選びます。候補がなければ新規作成から始めれば十分です。"}
            actions={getScriptsFirstResultActions({
              voiceReadiness: Boolean(voiceReadiness),
              canRecord,
              candidateScript,
              candidateListenVoiceSetupHref
            })}
          />
        </div>
      ) : null}

      {latestReviewedItem && latestReviewedHref ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <StateStepSection
            title="前回の続きに戻りやすい状態"
            summary={`最新結果があるのは「${latestReviewedItem.script.title}」です。主導線は上の chooser に任せ、直近の流れを拾いたいときだけここから再開できます。`}
          />
          <StateActionSection
            eyebrow="Other actions"
            title="直近の流れから再開する"
            summary="最新結果を見直したいときだけ使います。通常は上の chooser か各 card の主ボタンだけを見れば十分です。"
            actions={getScriptsResumeActions({
              latestReviewedItem,
              latestReviewedHref,
              canRecord
            })}
          />
        </div>
      ) : null}

      {scripts.length === 0 ? (
        <div className="space-y-4">
          <StateStepSection
            title="まだ script がない状態"
            summary="scripts は main loop の入口ですが、今は選ぶ対象がありません。まず最初の 1 本を作る段階です。"
            tone="info"
          />
          <StateActionSection
            eyebrow="Next action"
            title="最初の script を作る"
            summary="まず 1 分台本を 1 本作ります。voice 側の前提が気になるときだけ補助導線を使います。"
            actions={[
              { label: "台本を作成する", href: "/scripts/new", tone: "primary" }
            ]}
          />
          <StateActionSection
            eyebrow="Other actions"
            title="補助導線"
            summary="voice を先に見直したいときや home に戻りたいときだけ使います。"
            actions={[
              { label: "voice 設定", href: voiceSetupFromScriptsHref },
              { label: "home", href: "/" }
            ]}
          />
        </div>
      ) : (
        <div className="grid gap-4">
          {scripts.map((item) => {
            const reviewHref = item.latestTake ? getScriptReviewPath(item.script.id, item.latestTake.id) : null;
            const duplicateHref = getDuplicateScriptPath(item.script.id);
            const voiceSetupForItemHref = buildScriptListenVoiceSetupHref(item.script.id, "/scripts");

            return (
            <article key={item.script.id} className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-ink-900">{item.script.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{item.script.content}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink-500">
                    {item.script.locale} / 目標 {item.script.targetSeconds}秒 / 保存済み結果 {item.takeCount}件
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-[var(--line)] px-3 py-1 text-ink-700">
                    {voiceReadiness && item.takeCount === 0
                      ? "voice 準備待ち"
                      : !canRecord && item.takeCount > 0
                        ? "record 前提待ち"
                      : item.takeCount === 0
                      ? "listen から開始"
                      : item.improvementTrend === "down"
                        ? "listen で戻す"
                        : item.improvementTrend === "up"
                          ? "record を継続"
                          : "listen か record"}
                  </span>
                  {item.latestTake ? (
                    <span className="rounded-full border border-[var(--line)] px-3 py-1 text-ink-700">
                      最新 {item.latestTake.score}
                    </span>
                  ) : null}
                </div>
              </div>
              <details className="mt-5 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink-800">Current step / この script の状態</summary>
                <p className="mt-3 text-sm leading-6 text-ink-700">
                  {voiceReadiness && item.takeCount === 0
                    ? "script は用意できていますが、listen の前提がまだ不足しています。先に voice 設定を整えると main loop に入りやすい状態です。"
                    : !canRecord && item.takeCount > 0
                      ? "結果は読めていますが、record で録り直す前提が不足しています。listen か一覧側から流れを保つ段階です。"
                    : item.takeCount === 0
                    ? "まだ保存済み結果がありません。まず listen で見本確認し、そのあと最初の 1 本を record します。"
                    : item.improvementTrend === "down"
                      ? "直前の結果で少し崩れています。listen で耳を合わせ直してから record に戻ると進めやすい状態です。"
                      : item.improvementTrend === "up"
                        ? "改善傾向があります。listen を増やしすぎず、必要ならそのまま record に戻れる状態です。"
                      : "大きな崩れは見えていません。listen で短く確認するか、そのまま record に戻るかを選べる状態です。"}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  {reviewHref
                    ? "最新結果の要点と導線はこの card からそのまま確認できます。途中で迷ったら、まず最新結果を見返してから listen / record に戻れます。"
                    : "まだ最新結果はありません。まず listen で見本確認し、最初の結果を 1 件作るところだけに集中すれば十分です。"}
                </p>
              </details>
              {item.latestTake ? (
                <div className="mt-5">
                  <TakeSummarySnapshot
                    take={item.latestTake}
                    lead="この script の戻り判断に必要な最新結果の要点だけを、一覧のまま確認できます。"
                  />
                </div>
              ) : null}
              <div className="mt-5 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
                {(() => {
                  const cardState = getScriptCardActionState({
                    item,
                    voiceReadiness: Boolean(voiceReadiness),
                    canRecord,
                    transcriptionSupported: transcriptionStatus.supported,
                    voiceSetupHref: voiceSetupForItemHref
                  });

                  return (
                    <>
                      <p className="mt-2 text-sm leading-6 text-ink-700">{cardState.summary}</p>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                        {cardState.actions.map((action) => (
                          <Link
                            key={`${item.script.id}:${action.href}:${action.label}`}
                            href={action.href}
                            className={
                              action.tone === "primary"
                                ? "rounded-2xl bg-[var(--accent)] px-4 py-3 text-white"
                                : "rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800"
                            }
                          >
                            {action.label}
                          </Link>
                        ))}
                  {reviewHref ? (
                          <Link href={reviewHref} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
                            最新結果を見る
                          </Link>
                  ) : null}
                        <Link href={duplicateHref} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
                          script を複製
                        </Link>
                      </div>
                    </>
                  );
                })()}
              </div>
              <details className="mt-5 rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink-800">Details / 複製・削除</summary>
                <p className="mt-3 text-sm leading-6 text-ink-600">script の複製や削除は補助操作です。本文を変えたいときは履歴意味を崩さないように複製を使い、main loop に入る判断は上の `Next action` だけを見れば十分です。</p>
                <div className="mt-4">
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

function getScriptsTranscriptionRecoveryActions(
  candidateScript: ScriptProgressItem | null,
  voiceSetupHref: string
): StateActionLink[] {
  return [
    candidateScript
      ? { label: "候補の script で listen", href: getScriptListenPath(candidateScript.script.id), tone: "primary" }
      : { label: "scripts を見る", href: "/scripts", tone: "primary" },
    { label: "voice 設定", href: voiceSetupHref }
  ];
}

function getScriptsPageActions(input: {
  voiceReadiness: boolean;
  candidateScript: ScriptProgressItem | null;
  candidatePrimaryIsRecord: boolean;
  candidateListenVoiceSetupHref: string;
}): StateActionLink[] {
  if (input.voiceReadiness) {
    return [
      { label: "voice 設定", href: input.candidateListenVoiceSetupHref, tone: "primary" },
      { label: "別の script を作る", href: "/scripts/new" },
      { label: "progress", href: "/progress" }
    ];
  }

  if (input.candidateScript) {
    return [
      {
        label: input.candidatePrimaryIsRecord ? "候補の script で record" : "候補の script で listen",
        href: input.candidatePrimaryIsRecord
          ? getScriptRecordPath(input.candidateScript.script.id)
          : getScriptListenPath(input.candidateScript.script.id),
        tone: "primary"
      },
      { label: "別の script を作る", href: "/scripts/new" },
      { label: "progress", href: "/progress" }
    ];
  }

  return [
    { label: "新しい script を作る", href: "/scripts/new", tone: "primary" },
    { label: "別の script を作る", href: "/scripts/new" },
    { label: "progress", href: "/progress" }
  ];
}

function getScriptsPageActionSummary(input: {
  voiceReadiness: boolean;
  candidateScript: ScriptProgressItem | null;
}) {
  if (input.voiceReadiness) {
    return "listen の前提がまだ不足しています。まず voice 設定を整え、準備が済んだらここに戻って script を選びます。";
  }

  if (input.candidateScript) {
    return `迷ったら、候補として出している「${input.candidateScript.script.title}」から始めます。この候補は未着手や戻りやすさを優先して 1 本だけ出しているので、詳細な判断は各カードの主ボタンだけを見れば十分です。`;
  }

  return "まず対象 script を 1 つ決めます。詳細な判断は各カードの主ボタンだけを見れば十分です。";
}

function getScriptsFirstResultActions(input: {
  voiceReadiness: boolean;
  canRecord: boolean;
  candidateScript: ScriptProgressItem | null;
  candidateListenVoiceSetupHref: string;
}): StateActionLink[] {
  if (input.voiceReadiness) {
    return [
      { label: "voice 設定", href: input.candidateListenVoiceSetupHref, tone: "primary" },
      { label: "新しい script を作る", href: "/scripts/new" }
    ];
  }

  if (input.candidateScript) {
    return [
      { label: "候補の script で listen", href: getScriptListenPath(input.candidateScript.script.id), tone: "primary" },
      ...(input.canRecord ? [{ label: "そのまま record に進む", href: getScriptRecordPath(input.candidateScript.script.id) }] : []),
      { label: "新しい script を作る", href: "/scripts/new" }
    ];
  }

  return [{ label: "新しい script を作る", href: "/scripts/new", tone: "primary" }];
}

function getScriptsResumeActions(input: {
  latestReviewedItem: ScriptProgressItem;
  latestReviewedHref: string;
  canRecord: boolean;
}): StateActionLink[] {
  return [
    { label: "最新結果を見る", href: input.latestReviewedHref, tone: "primary" },
    { label: input.canRecord ? "record に戻る" : "listen に戻る", href: input.canRecord ? getScriptRecordPath(input.latestReviewedItem.script.id) : getScriptListenPath(input.latestReviewedItem.script.id) }
  ];
}

function getScriptCardActionState(input: {
  item: ScriptProgressItem;
  voiceReadiness: boolean;
  canRecord: boolean;
  transcriptionSupported: boolean;
  voiceSetupHref: string;
}) {
  if (input.voiceReadiness && input.item.takeCount === 0) {
    return {
      summary: input.canRecord
        ? "この script は先に見られますが、listen を主導線として使うには voice 設定を整えるのが近道です。録音だけ先に進めたいときは record を使えます。"
        : "この script は先に見られますが、listen を主導線として使うには voice 設定を整えるのが近道です。record の保存まで進む前に、文字起こし provider の前提もあとで整えます。",
      actions: [
        { label: "先に voice 設定を整える", href: input.voiceSetupHref, tone: "primary" as const },
        input.canRecord
          ? { label: "record に進む", href: getScriptRecordPath(input.item.script.id) }
          : { label: "先に listen を保つ", href: getScriptListenPath(input.item.script.id) }
      ]
    };
  }

  if (!input.transcriptionSupported && input.item.takeCount === 0) {
    return {
      summary: "listen まではこのまま進めます。record で最初の結果を作る前に、文字起こし provider の設定を整える必要があります。",
      actions: [
        { label: "listen から始める", href: getScriptListenPath(input.item.script.id), tone: "primary" as const },
        { label: "voice 設定", href: input.voiceSetupHref }
      ]
    };
  }

  if (!input.canRecord && input.item.takeCount > 0) {
    return {
      summary: "いまは record に戻る前提が不足しています。まず listen で耳を合わせるか、scripts で戻り先を選び直します。",
      actions: [
        { label: "先に listen を保つ", href: getScriptListenPath(input.item.script.id), tone: "primary" as const },
        { label: "scripts で戻り先を見直す", href: "/scripts" }
      ]
    };
  }

  if (input.item.takeCount === 0) {
    return {
      summary: "初回は listen から始めるのが主導線です。録音のやり直しが主でなければ、いきなり record に進む必要はありません。",
      actions: [
        { label: "listen から始める", href: getScriptListenPath(input.item.script.id), tone: "primary" as const },
        { label: "record に進む", href: getScriptRecordPath(input.item.script.id) }
      ]
    };
  }

  if (input.item.improvementTrend === "up") {
    return {
      summary: "いまは流れが良いので、そのまま record に戻るのが近道です。聞き直しが必要だと感じたときだけ listen を挟みます。",
      actions: [
        { label: "record に戻る", href: getScriptRecordPath(input.item.script.id), tone: "primary" as const },
        { label: "必要なら listen を挟む", href: getScriptListenPath(input.item.script.id) }
      ]
    };
  }

  return {
    summary: "迷ったら listen から始めます。結果を増やしたいときだけ record に直行し、台本自体を変えたいときだけ script を複製します。",
    actions: [
      { label: "listen から始める", href: getScriptListenPath(input.item.script.id), tone: "primary" as const },
      { label: "record に進む", href: getScriptRecordPath(input.item.script.id) }
    ]
  };
}
