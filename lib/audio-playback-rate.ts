export const PLAYBACK_RATE_OPTIONS = [
  { value: 0.75, label: "ゆっくり確認" },
  { value: 0.85, label: "まねる速度" },
  { value: 1, label: "通常" },
  { value: 1.15, label: "少し速め" }
] as const;

export type PlaybackRate = (typeof PLAYBACK_RATE_OPTIONS)[number]["value"];

