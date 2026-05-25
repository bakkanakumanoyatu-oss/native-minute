import { getMatchingFocusWords, type PracticeChunk } from "@/lib/script-practice-chunks";

type ScriptPracticeChunksProps = {
  chunks: PracticeChunk[];
  focusWords?: string[];
  title?: string;
  summary: string;
  actionCue: string;
  testId?: string;
};

export function ScriptPracticeChunks({
  chunks,
  focusWords = [],
  title = "意味の塊",
  summary,
  actionCue,
  testId
}: ScriptPracticeChunksProps) {
  if (chunks.length === 0) {
    return null;
  }

  const limitedFocusWords = focusWords.map((word) => word.trim()).filter(Boolean).slice(0, 3);

  return (
    <section data-testid={testId} className="rounded-[2rem] border border-[var(--line-subtle)] bg-[var(--surface-primary)] p-6 shadow-[var(--shadow-studio-soft)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Practice chunks</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink-900">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-700">{summary}</p>
        </div>
        <p className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] px-4 py-3 text-sm leading-6 text-ink-700">{actionCue}</p>
      </div>

      {limitedFocusWords.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {limitedFocusWords.map((word) => (
            <span key={word} className="rounded-full border border-[var(--line-inset)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-700">
              focus: {word}
            </span>
          ))}
        </div>
      ) : null}

      <ol className="mt-5 grid gap-3">
        {chunks.map((chunk) => {
          const chunkFocusWords = getMatchingFocusWords(chunk.text, limitedFocusWords);

          return (
            <li key={`${chunk.index}-${chunk.text}`} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink-500">chunk {chunk.index}</p>
                  <p className="mt-2 text-base leading-7 text-ink-900">{chunk.text}</p>
                </div>
                <div className="shrink-0 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-xs font-semibold text-ink-700">
                  {chunk.wordCount} words
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm leading-6">
                <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 font-semibold text-[var(--accent-strong)]">{chunk.cueJa}</span>
                {chunkFocusWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-xs font-semibold text-ink-600">
                    focus word: {word}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
