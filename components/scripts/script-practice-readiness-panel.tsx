import { analyzeScriptPracticeReadiness } from "@/lib/script-practice-readiness";

type ScriptPracticeReadinessPanelProps = {
  content: string;
  targetSeconds: number;
};

const toneClasses = {
  empty: "border-[var(--line)] bg-ink-50 text-ink-700",
  steady: "border-emerald-200 bg-emerald-50 text-emerald-950",
  notice: "border-amber-200 bg-amber-50 text-amber-950",
  alert: "border-rose-200 bg-rose-50 text-rose-950"
};

export function ScriptPracticeReadinessPanel({ content, targetSeconds }: ScriptPracticeReadinessPanelProps) {
  const readiness = analyzeScriptPracticeReadiness(content, targetSeconds);

  return (
    <section data-testid="script-practice-readiness" className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${toneClasses[readiness.tone]}`}>
      <p className="text-xs uppercase tracking-[0.18em] opacity-70">1分の話しやすさ</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{readiness.labelJa}</h2>
          <p className="mt-2 text-sm leading-6">{readiness.summaryJa}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-ink-700">
          目標 {readiness.targetSeconds}秒
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="words" value={`${readiness.wordCount}`} />
        <Metric label="1分目安" value={formatTimeEstimate(readiness.estimatedPracticeSeconds, readiness.estimatedNaturalSeconds)} />
        <Metric label="chunks" value={`${readiness.chunkCount}`} />
        <Metric label="長い塊" value={`${readiness.longChunkCount}`} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label="sentences" value={`${readiness.sentenceCount}`} compact />
        <Metric label="長い文" value={`${readiness.longSentenceCount}`} compact />
        <Metric label="息継ぎ" value={`${readiness.breathPointCount}`} compact />
      </div>

      <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Next action</p>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-700">
          {readiness.nextActionsJa.map((action) => (
            <li key={action}>・{action}</li>
          ))}
        </ul>
      </div>

      {readiness.manualRevisionHints.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500">手動で直すヒント</p>
          <div className="mt-3 grid gap-2">
            {readiness.manualRevisionHints.map((hint) => (
              <div key={`${hint.kind}-${hint.labelJa}-${hint.summaryJa}`} className="rounded-2xl border border-white bg-white/80 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700">{hint.labelJa}</span>
                  <p className="text-sm font-semibold text-ink-900">{hint.summaryJa}</p>
                </div>
                {hint.excerptJa ? <p className="mt-2 text-xs leading-5 text-ink-600">{hint.excerptJa}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-white/70 bg-white/70 px-3 ${compact ? "py-2" : "py-3"}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className={`${compact ? "mt-1 text-sm" : "mt-2 text-base"} font-semibold text-ink-900`}>{value}</p>
    </div>
  );
}

function formatTimeEstimate(practiceSeconds: number, naturalSeconds: number) {
  if (practiceSeconds === 0 || naturalSeconds === 0) {
    return "未入力";
  }

  return `${practiceSeconds}秒 / 通常 ${naturalSeconds}秒`;
}
