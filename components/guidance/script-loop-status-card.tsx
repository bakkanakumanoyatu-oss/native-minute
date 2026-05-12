import Link from "next/link";
import type { ProgressTakeSummary } from "@/services/progress";
import { TakeSummarySnapshot } from "@/components/guidance/take-summary-snapshot";

type ScriptLoopStep = "listen" | "record" | "review";

type ScriptLoopStatusCardProps = {
  currentStep: ScriptLoopStep;
  takeCount: number;
  improvementTrend: "up" | "down" | "flat" | "insufficient_data";
  listenHref: string;
  recordHref: string;
  latestTake?: ProgressTakeSummary | null;
  latestReviewHref?: string | null;
  isCurrentLatestReview?: boolean;
  blockedSummary?: string | null;
};

function getTrendLabel(improvementTrend: ScriptLoopStatusCardProps["improvementTrend"], takeCount: number) {
  if (takeCount === 0) {
    return "最初の結果前";
  }

  if (improvementTrend === "up") {
    return "改善傾向";
  }

  if (improvementTrend === "down") {
    return "listen で戻す";
  }

  return "大きな崩れなし";
}

function getStepClasses(active: boolean, available: boolean) {
  if (active) {
    return "rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white";
  }

  if (available) {
    return "rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-ink-700";
  }

  return "rounded-full border border-dashed border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-500";
}

function getLoopSummary(input: {
  currentStep: ScriptLoopStep;
  takeCount: number;
  improvementTrend: ScriptLoopStatusCardProps["improvementTrend"];
  hasLatestReview: boolean;
  isCurrentLatestReview: boolean;
  blockedSummary: string | null;
}) {
  if (input.blockedSummary) {
    return input.blockedSummary;
  }

  if (input.currentStep === "listen") {
    if (input.takeCount === 0) {
      return "いまは listen です。見本確認を短く済ませたら、次は record で最初の結果を作ると main loop がつながります。";
    }

    if (input.improvementTrend === "down") {
      return input.hasLatestReview
        ? "いまは listen です。前回の結果を少し戻してから record に戻る流れが主で、必要なときだけ最新結果を見返せます。"
        : "いまは listen です。前回の結果を少し戻してから record に戻る流れが主です。";
    }

    if (input.improvementTrend === "up") {
      return "いまは listen です。耳合わせができたら、listen を増やしすぎずに record へ戻る流れが自然です。";
    }

    return input.hasLatestReview
      ? "いまは listen です。短く確認したら record に戻り、迷うときだけ最新結果を見返せば十分です。"
      : "いまは listen です。短く確認したら、そのまま record に戻れば十分です。";
  }

  if (input.currentStep === "record") {
    if (input.takeCount === 0) {
      return "いまは record です。ここで最初の録音を保存すると、review まで main loop を通せる状態になります。";
    }

    if (input.improvementTrend === "down") {
      return input.hasLatestReview
        ? "いまは record です。必要なら一度 listen を挟みつつ、次の 1 本を保存すると結果比較を続けられます。"
        : "いまは record です。必要なら一度 listen を挟みつつ、次の 1 本を保存すると流れを保てます。";
    }

    return input.hasLatestReview
      ? "いまは record です。主導線は次の 1 本の保存で、迷うときだけ listen や最新結果に戻れば十分です。"
      : "いまは record です。主導線は次の 1 本の保存で、迷うときだけ listen に戻れば十分です。";
  }

  if (input.isCurrentLatestReview) {
    return "いまは最新の review です。内容を確認したら、listen か record に戻ってこの script の main loop を再開できます。";
  }

  if (input.hasLatestReview) {
    return "いまは履歴 review です。通常利用へ戻るときは listen / record に加えて、最新結果にもすぐ戻れます。";
  }

  return "いまは review です。内容を確認したら、listen か record に戻ってこの script の main loop を続けます。";
}

function getLatestTakeLead(input: {
  currentStep: ScriptLoopStep;
  isCurrentLatestReview: boolean;
}) {
  if (input.isCurrentLatestReview) {
    return "いま見ている review が最新結果です。";
  }

  if (input.currentStep === "review") {
    return "通常利用へ戻る前に、いまの最新結果の要点だけをここで確認できます。";
  }

  return "戻り先を決める前に、いまの最新結果がどんな内容だったかをここで軽く確認できます。";
}

export function ScriptLoopStatusCard({
  currentStep,
  takeCount,
  improvementTrend,
  listenHref,
  recordHref,
  latestTake = null,
  latestReviewHref = null,
  isCurrentLatestReview = false,
  blockedSummary = null
}: ScriptLoopStatusCardProps) {
  const hasLatestReview = Boolean(latestReviewHref);
  const summary = getLoopSummary({
    currentStep,
    takeCount,
    improvementTrend,
    hasLatestReview,
    isCurrentLatestReview,
    blockedSummary
  });

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">main loop</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">この script の現在位置</h2>
          <p className="mt-3 text-sm leading-6 text-ink-700">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-ink-700">保存済み結果 {takeCount}件</span>
          <span className="rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-ink-700">{getTrendLabel(improvementTrend, takeCount)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={getStepClasses(currentStep === "listen", true)}>listen</span>
        <span className="text-sm text-ink-400">→</span>
        <span className={getStepClasses(currentStep === "record", true)}>record</span>
        <span className="text-sm text-ink-400">→</span>
        <span className={getStepClasses(currentStep === "review", hasLatestReview || currentStep === "review")}>
          {hasLatestReview || currentStep === "review" ? "review" : "review 待ち"}
        </span>
      </div>

      {latestTake ? (
        <div className="mt-4">
          <TakeSummarySnapshot
            eyebrow={isCurrentLatestReview ? "最新結果の要点" : "直近の最新結果"}
            take={latestTake}
            lead={getLatestTakeLead({
              currentStep,
              isCurrentLatestReview
            })}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        {currentStep !== "listen" ? (
          <Link href={listenHref} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
            listen
          </Link>
        ) : null}
        {currentStep !== "record" ? (
          <Link href={recordHref} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
            record
          </Link>
        ) : null}
        {hasLatestReview && (currentStep !== "review" || !isCurrentLatestReview) ? (
          <Link href={latestReviewHref!} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
            最新結果を見る
          </Link>
        ) : null}
      </div>
    </section>
  );
}
