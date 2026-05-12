export type PracticeChunk = {
  index: number;
  text: string;
  wordCount: number;
  cueJa: string;
};

export type WeakWordChunkFocus = {
  chunk: PracticeChunk;
  weakWords: string[];
  focusWords: string[];
};

const MIN_WORDS_PER_CHUNK = 4;
const MAX_WORDS_PER_CHUNK = 10;
const SPLIT_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?"]);

export function createPracticeChunks(scriptContent: string): PracticeChunk[] {
  const normalizedContent = scriptContent.replace(/\s+/g, " ").trim();

  if (!normalizedContent) {
    return [];
  }

  const punctuationSegments = mergeShortSegments(splitByPracticePunctuation(normalizedContent));
  const chunkTexts = punctuationSegments.flatMap(splitLongSegment);

  return chunkTexts.map((text, index) => ({
    index: index + 1,
    text,
    wordCount: countWords(text),
    cueJa: getPracticeChunkCue(index, chunkTexts.length)
  }));
}

export function getMatchingFocusWords(text: string, focusWords: string[], limit = 3) {
  const normalizedText = normalizeForMatch(text);
  const matches: string[] = [];

  for (const word of focusWords) {
    const trimmedWord = word.trim();

    if (!trimmedWord) {
      continue;
    }

    const normalizedWord = normalizeForMatch(trimmedWord);

    if (normalizedWord && normalizedText.includes(normalizedWord) && !matches.some((item) => normalizeForMatch(item) === normalizedWord)) {
      matches.push(trimmedWord);
    }

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

export function findWeakWordPracticeChunks({
  chunks,
  weakWords,
  focusWords = [],
  maxChunks = 3,
  maxFocusWords = 3
}: {
  chunks: PracticeChunk[];
  weakWords: string[];
  focusWords?: string[];
  maxChunks?: number;
  maxFocusWords?: number;
}): WeakWordChunkFocus[] {
  const normalizedWeakWords = uniqueTrimmedWords(weakWords).slice(0, maxFocusWords);
  const limitedFocusWords = uniqueTrimmedWords(focusWords).slice(0, maxFocusWords);

  if (chunks.length === 0 || normalizedWeakWords.length === 0) {
    return [];
  }

  return chunks
    .map((chunk) => {
      const chunkTokens = tokenizeForMatch(chunk.text);
      const matchedWeakWords = normalizedWeakWords.filter((word) => chunkTokens.has(normalizeForMatch(word)));

      return {
        chunk,
        weakWords: matchedWeakWords,
        focusWords: getMatchingFocusWords(chunk.text, limitedFocusWords, maxFocusWords)
      };
    })
    .filter((item) => item.weakWords.length > 0)
    .sort((a, b) => b.weakWords.length - a.weakWords.length || a.chunk.index - b.chunk.index)
    .slice(0, maxChunks);
}

function splitByPracticePunctuation(content: string) {
  const segments: string[] = [];
  let buffer = "";

  for (const character of content) {
    buffer += character;

    if (SPLIT_PUNCTUATION.has(character) || character === "-") {
      pushSegment(segments, buffer);
      buffer = "";
    }
  }

  pushSegment(segments, buffer);

  return segments;
}

function splitLongSegment(segment: string) {
  const words = segment.split(/\s+/).filter(Boolean);

  if (words.length <= MAX_WORDS_PER_CHUNK) {
    return [segment.trim()];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < words.length) {
    const remaining = words.length - cursor;

    if (remaining <= MAX_WORDS_PER_CHUNK) {
      const remainderText = words.slice(cursor).join(" ");

      if (remaining < MIN_WORDS_PER_CHUNK && chunks.length > 0) {
        chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${remainderText}`.trim();
      } else {
        chunks.push(remainderText);
      }
      break;
    }

    const chunksRemaining = Math.ceil(remaining / MAX_WORDS_PER_CHUNK);
    const nextSize = Math.min(MAX_WORDS_PER_CHUNK, Math.max(MIN_WORDS_PER_CHUNK, Math.ceil(remaining / chunksRemaining)));
    chunks.push(words.slice(cursor, cursor + nextSize).join(" "));
    cursor += nextSize;
  }

  return chunks;
}

function mergeShortSegments(segments: string[]) {
  const mergedSegments: string[] = [];
  let buffer = "";

  for (const segment of segments) {
    buffer = `${buffer} ${segment}`.trim();

    if (countWords(buffer) >= MIN_WORDS_PER_CHUNK) {
      mergedSegments.push(buffer);
      buffer = "";
    }
  }

  if (buffer) {
    if (mergedSegments.length > 0) {
      mergedSegments[mergedSegments.length - 1] = `${mergedSegments[mergedSegments.length - 1]} ${buffer}`.trim();
    } else {
      mergedSegments.push(buffer);
    }
  }

  return mergedSegments;
}

function pushSegment(segments: string[], segment: string) {
  const trimmedSegment = segment.trim();

  if (trimmedSegment) {
    segments.push(trimmedSegment);
  }
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function getPracticeChunkCue(index: number, total: number) {
  if (index === 0) {
    return "まずこの塊だけまねる";
  }

  if (index === total - 1) {
    return "語尾まで言い切る";
  }

  return index % 2 === 0 ? "ここで息継ぎ" : "意味を保ってつなぐ";
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function tokenizeForMatch(value: string) {
  return new Set(
    value
      .split(/\s+/)
      .map(normalizeForMatch)
      .filter(Boolean)
  );
}

function uniqueTrimmedWords(words: string[]) {
  const uniqueWords: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    const trimmedWord = word.trim();
    const normalizedWord = normalizeForMatch(trimmedWord);

    if (!trimmedWord || !normalizedWord || seen.has(normalizedWord)) {
      continue;
    }

    seen.add(normalizedWord);
    uniqueWords.push(trimmedWord);
  }

  return uniqueWords;
}
