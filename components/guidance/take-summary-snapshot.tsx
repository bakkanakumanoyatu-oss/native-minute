import type { ProgressTakeSummary } from "@/services/progress";

function formatTakeTimestamp(timestamp: string) {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return "保存時刻未取得";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function formatWeakWords(take: ProgressTakeSummary) {
  const words = take.weakWords.slice(0, 3).map((item) => item.word).filter(Boolean);

  if (words.length === 0) {
    return "今は大きな weak words はありません。";
  }

  return words.join(" / ");
}

function formatStrengths(take: ProgressTakeSummary, maxStrengths: number) {
  const strengths = take.evaluation.strengthsJa.slice(0, maxStrengths).filter(Boolean);

  if (strengths.length === 0) {
    return "大きく崩れていない点は、この結果の評価コメントで確認できます。";
  }

  return strengths.join(" / ");
}

export function TakeSummarySnapshot({
  eyebrow = "最新結果の要点",
  take,
  lead,
  showScoreChip = true,
  showStrengths = false,
  maxStrengths = 2,
  coachLabel = "coach の一言"
}: {
  eyebrow?: string;
  take: ProgressTakeSummary;
  lead?: string;
  showScoreChip?: boolean;
  showStrengths?: boolean;
  maxStrengths?: number;
  coachLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">{eyebrow}</p>
          {lead ? <p className="mt-2 text-sm leading-6 text-ink-700">{lead}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {showScoreChip ? (
            <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-ink-700">総合 {take.score}</span>
          ) : null}
          <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-ink-700">
            {formatTakeTimestamp(take.reviewedAt ?? take.createdAt)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-700">弱点語: {formatWeakWords(take)}</p>
      {showStrengths ? <p className="mt-2 text-sm leading-6 text-ink-700">強み: {formatStrengths(take, maxStrengths)}</p> : null}
      <p className="mt-2 text-sm leading-6 text-ink-600">{coachLabel}: {take.coach.nextStepJa}</p>
    </div>
  );
}
