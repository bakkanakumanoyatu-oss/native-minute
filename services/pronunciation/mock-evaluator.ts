import { isRecordingTooShort } from "@/lib/recording";
import type { EvaluateInput, EvaluateResult, PronunciationEvaluator, WeakWord } from "./types";

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function countOverlap(scriptWords: string[], transcriptWords: string[]) {
  const transcriptSet = new Set(transcriptWords);
  return scriptWords.filter((word) => transcriptSet.has(word)).length;
}

function buildWeakWords(scriptWords: string[], transcriptWords: string[]): WeakWord[] {
  const transcriptSet = new Set(transcriptWords);
  return scriptWords
    .filter((word) => !transcriptSet.has(word))
    .slice(0, 4)
    .map((word, index) => ({
      word,
      score: Math.max(45 - index * 5, 20),
      note: "聞き取りやすさを上げるため、単語の区切りを少し強めてください。"
    }));
}

export class MockPronunciationEvaluator implements PronunciationEvaluator {
  async evaluate(input: EvaluateInput): Promise<EvaluateResult> {
    const scriptWords = tokenize(input.scriptText);
    const transcriptWords = tokenize(input.transcript);
    const overlap = countOverlap(scriptWords, transcriptWords);
    const coverage = scriptWords.length === 0 ? 0 : overlap / scriptWords.length;
    const isShortTake = isRecordingTooShort(input.durationSeconds, input.targetSeconds ?? 60);
    const durationPenalty = isShortTake ? 12 : 0;

    const accuracyScore = Math.round(Math.max(45, 100 * coverage - durationPenalty));
    const fluencyScore = Math.round(Math.max(40, 82 + coverage * 12 - durationPenalty / 2));
    const rhythmScore = Math.round(Math.max(42, 80 + coverage * 10 - durationPenalty / 2));
    const score = Math.round((accuracyScore + fluencyScore + rhythmScore) / 3);

    return {
      score,
      accuracyScore,
      fluencyScore,
      rhythmScore,
      summaryJa:
        isShortTake
          ? "録音が少し短いです。1分に近づけて、語尾まで言い切るテイクを取り直しましょう。"
          : coverage > 0.85
            ? "かなり安定しています。語尾の抜けを減らすと、さらにネイティブ感が増します。"
            : "全体の流れはつかめています。抜けた単語を減らして、つながりを整えましょう。",
      strengthsJa: [
        "1分台本の流れを保てています。",
        "強く読むべき箇所の意識をもう少し上げるとさらに良くなります。"
      ],
      weakWords: buildWeakWords(scriptWords, transcriptWords),
      scriptWordCount: scriptWords.length,
      transcriptWordCount: transcriptWords.length
    };
  }
}

export function createMockPronunciationEvaluator() {
  return new MockPronunciationEvaluator();
}
