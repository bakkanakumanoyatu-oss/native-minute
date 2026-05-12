export type ScriptStudioTemplate = {
  id: string;
  title: string;
  categoryLabelJa: string;
  situationLabelJa: string;
  targetSeconds: number;
  summaryJa: string;
  content: string;
  focusWords: string[];
  source: "native-minute-original";
};

export const SCRIPT_STUDIO_TEMPLATES: ScriptStudioTemplate[] = [
  {
    id: "small-work-win",
    title: "A small win at work",
    categoryLabelJa: "仕事の小さな成果",
    situationLabelJa: "同僚に近況を話す",
    targetSeconds: 60,
    summaryJa: "小さな前進を、結論・理由・次の一手で話す自作テンプレ。",
    content:
      "This week, I had a small win at work. I finished one task that I had been avoiding, and it gave me a little more confidence. It was not a big achievement, but it reminded me that progress often starts with one clear step. Next time, I want to choose the next small task earlier, so I can keep the momentum going.",
    focusWords: ["win", "confidence", "momentum"],
    source: "native-minute-original"
  },
  {
    id: "learning-reason",
    title: "Why I keep learning English",
    categoryLabelJa: "英語学習の理由",
    situationLabelJa: "自己紹介や学習共有",
    targetSeconds: 60,
    summaryJa: "学習理由を、自分らしさと話しやすさを優先して言う自作テンプレ。",
    content:
      "I keep learning English because I want to express myself more clearly. I do not need perfect English right away. I want English that feels useful in real conversations. When I practice for one minute every day, I can hear my own progress. That makes the language feel less distant and more connected to my daily life.",
    focusWords: ["express", "useful", "progress"],
    source: "native-minute-original"
  },
  {
    id: "friendly-opinion",
    title: "A friendly opinion",
    categoryLabelJa: "短い意見",
    situationLabelJa: "会話で意見を言う",
    targetSeconds: 60,
    summaryJa: "強く言い切りすぎず、理由を1つ添える意見テンプレ。",
    content:
      "I think a good routine should be simple. If a routine is too complicated, it is easy to stop after a few days. For me, the best routine is something I can repeat even when I am busy. One minute may sound short, but it is enough to practice one idea, one rhythm, and one clear ending.",
    focusWords: ["routine", "repeat", "ending"],
    source: "native-minute-original"
  }
];
