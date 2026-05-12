import { analyzeScriptDraft, getScriptFreezeReadiness } from "@/lib/script-studio";

type SavedScriptFreezeCandidateCheckProps = {
  script: {
    title: string;
    content: string;
    targetSeconds: number;
    locale: string;
  };
};

export function SavedScriptFreezeCandidateCheck({ script }: SavedScriptFreezeCandidateCheckProps) {
  const draft = analyzeScriptDraft(script.content, { targetLengthSeconds: script.targetSeconds }, { title: script.title });
  const freezeReadiness = getScriptFreezeReadiness(draft);
  const visibleBlockingReasons = freezeReadiness.blockingReasons.slice(0, 4);
  const visibleWarnings = freezeReadiness.warnings.slice(0, 4);

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Saved script freeze check</p>
          <h2 className="mt-2 text-lg font-semibold text-ink-900">保存済み台本の freeze 目安</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">保存済み script の read-only 目安です。</p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700">
          read-only
        </span>
      </div>

      <p className="mt-4 text-sm font-semibold text-ink-900">
        {freezeReadiness.canFreeze
          ? "将来の freeze 候補として概ね良さそうです。"
          : "音声生成前に少し整えるとよさそうです。"}
      </p>
      <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">台本チェックの詳細を見る</summary>
        <p className="mt-3 text-xs leading-5 text-ink-500">
          ここでは freeze 保存、quota 消費、音声生成は行いません。編集したい場合は duplicate / new script で扱う方針です。
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          <Metric label="words" value={`${draft.wordCount}`} />
          <Metric label="practice" value={`${draft.estimatedSpeakingTime.practiceSeconds}秒`} />
          <Metric label="chunks" value={`${draft.chunks.length}`} />
          <Metric label="focus" value={`${draft.focusWords.length}/3`} />
          <Metric label="locale" value={script.locale} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ListBlock title="先に確認すること" emptyLabel="blocking reason はありません。">
            {visibleBlockingReasons.map((reason) => (
              <li key={reason}>・{reason}</li>
            ))}
          </ListBlock>
          <ListBlock title="直すと安定する点" emptyLabel="大きな warning はありません。">
            {visibleWarnings.map((warning) => (
              <li key={warning}>・{warning}</li>
            ))}
          </ListBlock>
        </div>

        <p className="mt-4 text-xs leading-5 text-ink-500">Next action: {freezeReadiness.nextAction}</p>
      </details>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function ListBlock({ title, emptyLabel, children }: { title: string; emptyLabel: string; children: React.ReactNode }) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{title}</p>
      {childCount > 0 ? <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">{children}</ul> : <p className="mt-2 text-sm text-ink-500">{emptyLabel}</p>}
    </div>
  );
}
