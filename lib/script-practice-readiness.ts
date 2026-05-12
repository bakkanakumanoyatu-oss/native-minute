import { createPracticeChunks } from "@/lib/script-practice-chunks";

export type ScriptPracticeReadinessTone = "empty" | "steady" | "notice" | "alert";
export type ScriptManualRevisionHintKind = "length" | "breath" | "chunk" | "focus";

export type ScriptManualRevisionHint = {
  kind: ScriptManualRevisionHintKind;
  labelJa: string;
  summaryJa: string;
  excerptJa?: string;
};

export type ScriptPracticeReadiness = {
  tone: ScriptPracticeReadinessTone;
  labelJa: string;
  summaryJa: string;
  wordCount: number;
  sentenceCount: number;
  chunkCount: number;
  longChunkCount: number;
  longSentenceCount: number;
  breathPointCount: number;
  estimatedNaturalSeconds: number;
  estimatedPracticeSeconds: number;
  targetSeconds: number;
  nextActionsJa: string[];
  manualRevisionHints: ScriptManualRevisionHint[];
};

const NATURAL_WORDS_PER_SECOND = 2.35;
const PRACTICE_WORDS_PER_SECOND = 1.85;
const LONG_CHUNK_WORDS = 12;
const LONG_SENTENCE_WORDS = 24;

export function analyzeScriptPracticeReadiness(scriptContent: string, targetSeconds = 60): ScriptPracticeReadiness {
  const normalizedContent = scriptContent.replace(/\s+/g, " ").trim();
  const safeTargetSeconds = Number.isFinite(targetSeconds) && targetSeconds > 0 ? targetSeconds : 60;
  const words = normalizedContent ? normalizedContent.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;
  const sentenceInfos = getSentenceInfos(normalizedContent);
  const sentenceWordCounts = sentenceInfos.map((sentence) => sentence.wordCount);
  const breathGroups = getBreathGroups(normalizedContent);
  const breathGroupInfos = breathGroups.map((group) => ({
    text: group,
    wordCount: countWords(group)
  }));
  const chunks = createPracticeChunks(normalizedContent);
  const longChunkCount = breathGroupInfos.filter((group) => group.wordCount > LONG_CHUNK_WORDS).length;
  const longSentenceCount = sentenceWordCounts.filter((count) => count > LONG_SENTENCE_WORDS).length;
  const breathPointCount = countBreathPoints(normalizedContent);
  const estimatedNaturalSeconds = wordCount > 0 ? Math.max(1, Math.round(wordCount / NATURAL_WORDS_PER_SECOND)) : 0;
  const estimatedPracticeSeconds = wordCount > 0 ? Math.max(1, Math.round(wordCount / PRACTICE_WORDS_PER_SECOND)) : 0;
  const hasTooFewBreathPoints = wordCount >= 35 && breathGroups.length <= Math.ceil(wordCount / LONG_CHUNK_WORDS) - 1;
  const isTooLongForPractice = estimatedPracticeSeconds > safeTargetSeconds + 12;
  const isShortForMinute = safeTargetSeconds >= 50 && estimatedPracticeSeconds > 0 && estimatedPracticeSeconds < Math.max(25, safeTargetSeconds * 0.45);

  if (wordCount === 0) {
    return {
      tone: "empty",
      labelJa: "入力待ち",
      summaryJa: "台本を入れると、1分の話しやすさをここで確認できます。",
      wordCount,
      sentenceCount: 0,
      chunkCount: 0,
      longChunkCount: 0,
      longSentenceCount: 0,
      breathPointCount: 0,
      estimatedNaturalSeconds,
      estimatedPracticeSeconds,
      targetSeconds: safeTargetSeconds,
      nextActionsJa: ["まずは短い1分台本を貼り付ける"],
      manualRevisionHints: []
    };
  }

  const nextActionsJa = getReadinessActions({
    wordCount,
    isTooLongForPractice,
    isShortForMinute,
    longChunkCount,
    longSentenceCount,
    hasTooFewBreathPoints,
    chunkCount: chunks.length
  });
  const manualRevisionHints = getManualRevisionHints({
    wordCount,
    isTooLongForPractice,
    isShortForMinute,
    longSentence: sentenceInfos.find((sentence) => sentence.wordCount > LONG_SENTENCE_WORDS) ?? null,
    longBreathGroup: breathGroupInfos.find((group) => group.wordCount > LONG_CHUNK_WORDS) ?? null,
    hasTooFewBreathPoints,
    chunksLength: chunks.length
  });
  const tone = getReadinessTone({
    isTooLongForPractice,
    longChunkCount,
    longSentenceCount,
    hasTooFewBreathPoints
  });

  return {
    tone,
    labelJa: getReadinessLabel(tone, isShortForMinute),
    summaryJa: getReadinessSummary({
      tone,
      isShortForMinute,
      isTooLongForPractice,
      hasTooFewBreathPoints
    }),
    wordCount,
    sentenceCount: sentenceWordCounts.length,
    chunkCount: chunks.length,
    longChunkCount,
    longSentenceCount,
    breathPointCount,
    estimatedNaturalSeconds,
    estimatedPracticeSeconds,
    targetSeconds: safeTargetSeconds,
    nextActionsJa,
    manualRevisionHints
  };
}

function getSentenceInfos(content: string) {
  if (!content) {
    return [];
  }

  return content
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => ({
      text: sentence,
      wordCount: countWords(sentence)
    }));
}

function getBreathGroups(content: string) {
  if (!content) {
    return [];
  }

  return content
    .split(/[.,;:!?-]+/)
    .map((group) => group.trim())
    .filter(Boolean);
}

function countBreathPoints(content: string) {
  return (content.match(/[.,;:!?-]/g) ?? []).length;
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function getReadinessTone(input: {
  isTooLongForPractice: boolean;
  longChunkCount: number;
  longSentenceCount: number;
  hasTooFewBreathPoints: boolean;
}): ScriptPracticeReadinessTone {
  if (input.isTooLongForPractice || input.longSentenceCount >= 2) {
    return "alert";
  }

  if (input.longChunkCount > 0 || input.longSentenceCount > 0 || input.hasTooFewBreathPoints) {
    return "notice";
  }

  return "steady";
}

function getReadinessLabel(tone: ScriptPracticeReadinessTone, isShortForMinute: boolean) {
  if (tone === "empty") {
    return "入力待ち";
  }

  if (tone === "alert") {
    return "少し長め";
  }

  if (tone === "notice") {
    return "区切りを足すとよい";
  }

  return isShortForMinute ? "短めで練習しやすい" : "練習しやすい";
}

function getReadinessSummary(input: {
  tone: ScriptPracticeReadinessTone;
  isShortForMinute: boolean;
  isTooLongForPractice: boolean;
  hasTooFewBreathPoints: boolean;
}) {
  if (input.isTooLongForPractice) {
    return "1分でまねるには少し長めです。長い文を分けるか、言いたいことを1つ減らすと安定します。";
  }

  if (input.hasTooFewBreathPoints) {
    return "息継ぎポイントが少なめです。comma か period を足すと、listen / record の chunk 練習につながります。";
  }

  if (input.tone === "notice") {
    return "大筋は使えます。長い塊だけ短くすると、語尾まで言い切りやすくなります。";
  }

  if (input.isShortForMinute) {
    return "短めなので最初の練習に向いています。慣れたら少しだけ情報を足せます。";
  }

  return "意味の塊を追いやすい長さです。保存後は listen で同じ chunk を見ながら練習できます。";
}

function getReadinessActions(input: {
  wordCount: number;
  isTooLongForPractice: boolean;
  isShortForMinute: boolean;
  longChunkCount: number;
  longSentenceCount: number;
  hasTooFewBreathPoints: boolean;
  chunkCount: number;
}) {
  const actions: string[] = [];

  if (input.isTooLongForPractice) {
    actions.push("言いたいことを1つ減らす");
  }

  if (input.longSentenceCount > 0) {
    actions.push("長い文を2つに分ける");
  }

  if (input.longChunkCount > 0 || input.hasTooFewBreathPoints) {
    actions.push("comma か period で息継ぎを作る");
  }

  if (input.isShortForMinute && input.wordCount < 45) {
    actions.push("短めなので、慣れたら1文だけ足す");
  }

  if (input.chunkCount > 0) {
    actions.push("focus words を1〜3個に絞る");
    actions.push("速さより語尾まで言い切る");
  }

  return actions.slice(0, 4);
}

function getManualRevisionHints(input: {
  wordCount: number;
  isTooLongForPractice: boolean;
  isShortForMinute: boolean;
  longSentence: { text: string; wordCount: number } | null;
  longBreathGroup: { text: string; wordCount: number } | null;
  hasTooFewBreathPoints: boolean;
  chunksLength: number;
}) {
  const hints: ScriptManualRevisionHint[] = [];

  if (input.isTooLongForPractice) {
    hints.push({
      kind: "length",
      labelJa: "長さ",
      summaryJa: "まずは1文削る候補を探します。説明より結論を残すと、1分に収まりやすくなります。",
      excerptJa: input.longSentence ? `削る候補の目安: ${formatExcerpt(input.longSentence.text)}` : undefined
    });
  }

  if (input.longSentence) {
    hints.push({
      kind: "length",
      labelJa: "長い文",
      summaryJa: "この文は2文に分けるとまねしやすいです。中ほどの意味が切れる場所で period を置くのが目安です。",
      excerptJa: `${formatExcerpt(input.longSentence.text)} / 分割候補: ${getSplitCue(input.longSentence.text)}`
    });
  }

  if (input.longBreathGroup) {
    hints.push({
      kind: "chunk",
      labelJa: "意味の塊",
      summaryJa: "この塊だけ先に短くする候補です。comma か period で2つの意味の塊に分けます。",
      excerptJa: formatExcerpt(input.longBreathGroup.text)
    });
  }

  if (input.hasTooFewBreathPoints) {
    hints.push({
      kind: "breath",
      labelJa: "息継ぎ",
      summaryJa: "息継ぎポイントが少なめです。長い塊の中ほどに comma か period を1つ足すとまねしやすいです。",
      excerptJa: input.longBreathGroup ? `入れやすい位置の目安: ${getSplitCue(input.longBreathGroup.text)}` : undefined
    });
  }

  if (input.isShortForMinute && input.wordCount < 45) {
    hints.push({
      kind: "length",
      labelJa: "短め",
      summaryJa: "短めなので、理由を1文足すか具体例を1つ足す候補があります。",
      excerptJa: "例: because ... / for example ..."
    });
  }

  if (input.chunksLength > 0) {
    hints.push({
      kind: "focus",
      labelJa: "focus",
      summaryJa: "直す量を増やしすぎず、focus words は1〜3個に絞ります。速さより語尾まで言い切るのが目安です。"
    });
  }

  return dedupeHints(hints).slice(0, 3);
}

function getSplitCue(text: string) {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= 6) {
    return formatExcerpt(text);
  }

  const midpoint = Math.floor(words.length / 2);
  const start = Math.max(0, midpoint - 3);
  const end = Math.min(words.length, midpoint + 3);

  return `... ${words.slice(start, end).join(" ")} ...`;
}

function formatExcerpt(text: string) {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= 14) {
    return `「${words.join(" ")}」`;
  }

  return `「${words.slice(0, 12).join(" ")} ...」`;
}

function dedupeHints(hints: ScriptManualRevisionHint[]) {
  const uniqueHints: ScriptManualRevisionHint[] = [];
  const seen = new Set<string>();

  for (const hint of hints) {
    const key = `${hint.kind}:${hint.labelJa}:${hint.summaryJa}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueHints.push(hint);
  }

  return uniqueHints;
}
