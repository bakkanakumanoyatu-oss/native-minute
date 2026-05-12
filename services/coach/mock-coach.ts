import type { CoachFeedback, CoachInput } from "./types";

export function createMockCoachFeedback(input: CoachInput): CoachFeedback {
  const weakWords = input.evaluation.weakWords.map((item) => item.word).slice(0, 3);

  return {
    titleJa: "日本語コーチング",
    summaryJa: input.evaluation.summaryJa,
    bulletPointsJa: [
      "最初の 10 秒は特にテンポを安定させましょう。",
      "弱かった単語は、単語単体よりフレーズで練習すると伸びやすいです。",
      "録音を短く聞き返して、語尾の落ち方を1回だけ修正するのが効率的です。"
    ],
    nextStepJa: weakWords.length > 0
      ? `次は ${weakWords.join("、")} を意識して、もう1回録音してください。`
      : "次は語尾の抜けを少し減らして、同じ台本をもう1回録音してください。",
    focusWords: weakWords
  };
}
