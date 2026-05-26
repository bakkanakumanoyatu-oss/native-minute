import Link from "next/link";
import type { PracticeChunk, WeakWordChunkFocus } from "@/lib/script-practice-chunks";

type ReviewPracticeFocusProps = {
  focusItems: WeakWordChunkFocus[];
  fallbackChunk: PracticeChunk | null;
  weakWords: string[];
  coachFocusWords: string[];
  listenHref: string;
  recordHref: string;
};

export function ReviewPracticeFocus({
  focusItems,
  fallbackChunk,
  weakWords,
  coachFocusWords,
  listenHref,
  recordHref
}: ReviewPracticeFocusProps) {
  const limitedWeakWords = weakWords.map((word) => word.trim()).filter(Boolean).slice(0, 3);
  const limitedCoachFocusWords = coachFocusWords.map((word) => word.trim()).filter(Boolean).slice(0, 3);
  const hasMatchedChunk = focusItems.length > 0;

  if (!hasMatchedChunk && !fallbackChunk) {
    return null;
  }

  return (
    <section data-testid="review-practice-focus" className="rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-notice)] p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Focus words</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-900">次に練習する塊</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-700">
        {hasMatchedChunk
          ? "Focus words を単語だけで直さず、次はその単語が入っている意味の塊ごと練習します。"
          : "Focus words と一致する塊は見つかりませんでした。次は最初の塊を短くまねて、区切りと語尾を整えます。"}
      </p>

      {limitedWeakWords.length > 0 || limitedCoachFocusWords.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {limitedWeakWords.map((word) => (
            <span key={`weak-${word}`} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-700">
              focus: {word}
            </span>
          ))}
          {limitedCoachFocusWords.map((word) => (
            <span key={`focus-${word}`} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-paper)] px-3 py-1 text-xs font-semibold text-ink-700">
              focus: {word}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {hasMatchedChunk ? (
          focusItems.map((item) => (
            <div key={`${item.chunk.index}-${item.chunk.text}`} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-ink-500">chunk {item.chunk.index}</p>
                  <p className="mt-2 text-base leading-7 text-ink-900">{item.chunk.text}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-700">
                  {item.chunk.wordCount} words
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm leading-6">
                <span className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-notice)] px-3 py-1 font-semibold text-[var(--accent-strong)]">この塊だけ、語尾まで言い切る</span>
                {item.weakWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-700">
                    focus: {word}
                  </span>
                ))}
                {item.focusWords.map((word) => (
                  <span key={word} className="rounded-full border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-1 text-xs font-semibold text-ink-600">
                    focus: {word}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : fallbackChunk ? (
          <div className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">chunk {fallbackChunk.index}</p>
            <p className="mt-2 text-base leading-7 text-ink-900">{fallbackChunk.text}</p>
            <p className="mt-3 inline-flex rounded-full border border-[var(--line-subtle)] bg-[var(--surface-notice)] px-3 py-1 text-sm font-semibold text-[var(--accent-strong)]">速度より区切りを優先</p>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-700">
        Focus words は単語だけでなく、この塊の中で言います。迷ったらリズムを聞き直し、十分ならこの塊を意識して Record に戻ります。
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href={recordHref} className="rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-white">
          この塊で Take を録る
        </Link>
        <Link href={listenHref} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-paper)] px-4 py-3 text-ink-800">
          リズムを聞き直す
        </Link>
      </div>
    </section>
  );
}
