const DEFAULT_MAX_FOCUS_WORDS = 3;

export type FocusWordGroup = {
  words: string[];
  reasonJa: string | null;
};

export function prioritizeFocusWords(groups: string[][], maxWords = DEFAULT_MAX_FOCUS_WORDS) {
  const ordered = groups.flatMap((group) => group).map((word) => word.trim()).filter(Boolean);
  const unique = [...new Set(ordered)];

  return {
    words: unique.slice(0, maxWords),
    hiddenCount: Math.max(0, unique.length - maxWords)
  };
}

export function prioritizeFocusWordGroups(groups: FocusWordGroup[], maxWords = DEFAULT_MAX_FOCUS_WORDS) {
  const prioritized = prioritizeFocusWords(groups.map((group) => group.words), maxWords);

  const primaryGroup = groups.find((group) => group.words.some((word) => prioritized.words.includes(word.trim())));

  return {
    words: prioritized.words,
    hiddenCount: prioritized.hiddenCount,
    reasonJa: primaryGroup?.reasonJa ?? null
  };
}

export function formatFocusedWordList(words: string[], hiddenCount = 0) {
  if (words.length === 0) {
    return null;
  }

  const head = words.join("、");
  return hiddenCount > 0 ? `${head} を優先し、ほか ${hiddenCount} 個は次の結果に回して十分です。` : `${head} を優先します。`;
}

export function formatWordListWithOverflow(words: string[], maxWords = DEFAULT_MAX_FOCUS_WORDS) {
  const head = words.slice(0, maxWords);
  const hiddenCount = Math.max(0, words.length - maxWords);

  if (head.length === 0) {
    return "なし";
  }

  return hiddenCount > 0 ? `${head.join(" / ")} ほか ${hiddenCount} 個` : head.join(" / ");
}
