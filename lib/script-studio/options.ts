import type {
  ScriptStudioAudience,
  ScriptStudioDifficulty,
  ScriptStudioLengthTarget,
  ScriptStudioPriority,
  ScriptStudioSituation,
  ScriptStudioTone,
  ScriptStudioTopicCategory
} from "@/lib/script-studio/types";

export type ScriptStudioOption<TValue extends string> = {
  value: TValue;
  labelJa: string;
  descriptionJa: string;
};

export const SCRIPT_STUDIO_TONE_OPTIONS = [
  { value: "friendly", labelJa: "親しみやすく", descriptionJa: "やわらかく、会話で使いやすい言い方にする" },
  { value: "calm", labelJa: "落ち着いて", descriptionJa: "急がず、聞き取りやすい語調にする" },
  { value: "confident", labelJa: "自信を持って", descriptionJa: "結論をはっきり言う形にする" },
  { value: "polite", labelJa: "丁寧に", descriptionJa: "相手に失礼がない表現にする" },
  { value: "casual", labelJa: "カジュアルに", descriptionJa: "日常会話に近い表現にする" },
  { value: "enthusiastic", labelJa: "前向きに", descriptionJa: "気持ちが伝わる表現にする" },
  { value: "reflective", labelJa: "振り返る感じで", descriptionJa: "経験や考えを落ち着いて話す形にする" }
] as const satisfies readonly ScriptStudioOption<ScriptStudioTone>[];

export const SCRIPT_STUDIO_DIFFICULTY_OPTIONS = [
  { value: "easy", labelJa: "やさしめ", descriptionJa: "短い文と基本語彙を優先する" },
  { value: "standard", labelJa: "標準", descriptionJa: "自然さと話しやすさのバランスを取る" },
  { value: "challenging", labelJa: "少し挑戦", descriptionJa: "自然な表現を少し増やす" }
] as const satisfies readonly ScriptStudioOption<ScriptStudioDifficulty>[];

export const SCRIPT_STUDIO_LENGTH_OPTIONS = [
  { id: "short_45", labelJa: "短め", targetLengthSeconds: 45, descriptionJa: "まず言い切る練習に向く長さ" },
  { id: "standard_60", labelJa: "1分", targetLengthSeconds: 60, descriptionJa: "Native Minute の標準" },
  { id: "extended_75", labelJa: "少し長め", targetLengthSeconds: 75, descriptionJa: "内容を少し足したいときの目安" }
] as const satisfies readonly ScriptStudioLengthTarget[];

export const SCRIPT_STUDIO_PRIORITY_OPTIONS = [
  { value: "accuracy", labelJa: "正確さ", descriptionJa: "元の意味をできるだけ保つ" },
  { value: "speakability", labelJa: "話しやすさ", descriptionJa: "口に出しやすい長さと構造を優先する" },
  { value: "self_likeness", labelJa: "自分らしさ", descriptionJa: "自分の言い方や人格を残す" },
  { value: "native_likeness", labelJa: "ネイティブっぽさ", descriptionJa: "英語として自然な表現を優先する" }
] as const satisfies readonly ScriptStudioOption<ScriptStudioPriority>[];

export const SCRIPT_STUDIO_SITUATION_OPTIONS = [
  { value: "meeting", labelJa: "会議", descriptionJa: "仕事の場で短く伝える" },
  { value: "self_introduction", labelJa: "自己紹介", descriptionJa: "自分のことを1分で話す" },
  { value: "travel", labelJa: "旅行", descriptionJa: "旅先で使いやすい表現にする" },
  { value: "small_talk", labelJa: "雑談", descriptionJa: "気軽な会話で使う" },
  { value: "presentation", labelJa: "発表", descriptionJa: "聞き手に向けて順序立てて話す" },
  { value: "lesson", labelJa: "レッスン", descriptionJa: "先生や学習相手に話す" },
  { value: "interview", labelJa: "面接", descriptionJa: "質問への回答として使う" },
  { value: "daily_reflection", labelJa: "日々の振り返り", descriptionJa: "経験や考えを短くまとめる" }
] as const satisfies readonly ScriptStudioOption<ScriptStudioSituation>[];

export const SCRIPT_STUDIO_AUDIENCE_OPTIONS = [
  { value: "friend", labelJa: "友人", descriptionJa: "親しみやすく話す" },
  { value: "colleague", labelJa: "同僚", descriptionJa: "仕事相手に自然に話す" },
  { value: "teacher", labelJa: "先生", descriptionJa: "学習や相談の場で話す" },
  { value: "customer", labelJa: "顧客", descriptionJa: "丁寧さを保って話す" },
  { value: "interviewer", labelJa: "面接官", descriptionJa: "結論を分かりやすく話す" },
  { value: "group", labelJa: "複数人", descriptionJa: "聞き手全体に向けて話す" },
  { value: "general_listener", labelJa: "一般の聞き手", descriptionJa: "相手を限定せず分かりやすく話す" }
] as const satisfies readonly ScriptStudioOption<ScriptStudioAudience>[];

export const SCRIPT_STUDIO_TOPIC_CATEGORY_OPTIONS = [
  { value: "work", labelJa: "仕事", descriptionJa: "仕事の状況や考えを話す" },
  { value: "study", labelJa: "学習", descriptionJa: "学んだことや目標を話す" },
  { value: "travel", labelJa: "旅行", descriptionJa: "旅や場所について話す" },
  { value: "daily_life", labelJa: "日常", descriptionJa: "毎日の出来事を話す" },
  { value: "self_introduction", labelJa: "自己紹介", descriptionJa: "自分について話す" },
  { value: "opinion", labelJa: "意見", descriptionJa: "考えや理由を話す" },
  { value: "story", labelJa: "体験談", descriptionJa: "出来事を短く話す" },
  { value: "other", labelJa: "その他", descriptionJa: "固定カテゴリに当てはまらない内容" }
] as const satisfies readonly ScriptStudioOption<ScriptStudioTopicCategory>[];
