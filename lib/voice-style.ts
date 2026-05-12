export const VOICE_STYLE_PRESETS = ["natural", "expressive", "clear", "slow"] as const;

export type VoiceStylePreset = (typeof VOICE_STYLE_PRESETS)[number];

export const DEFAULT_VOICE_STYLE_PRESET: VoiceStylePreset = "natural";

export const VOICE_STYLE_PRESET_IDS = [
  "natural",
  "expressive",
  "clear",
  "slow",
  "calm",
  "friendly",
  "excited",
  "serious",
  "storytelling",
  "presentation",
  "slow-practice",
  "native-leaning",
  "my-voice-clear"
] as const;

export const VOICE_SPEED_INTENTS = ["slow_practice", "clear_practice", "natural", "native_leaning"] as const;
export const VOICE_PAUSE_DENSITIES = ["low", "medium", "high"] as const;

export type VoiceStylePresetId = (typeof VOICE_STYLE_PRESET_IDS)[number];
export type VoiceSpeedIntent = (typeof VOICE_SPEED_INTENTS)[number];
export type VoicePauseDensity = (typeof VOICE_PAUSE_DENSITIES)[number];

export type VoiceStylePresetDefinition = {
  id: VoiceStylePresetId;
  label: string;
  summary: string;
  targetSpeed: VoiceSpeedIntent;
  targetWpm: number;
  pauseDensity: VoicePauseDensity;
  intent: "practice" | "expression" | "default";
  compatibilityAliasFor?: VoiceStylePresetId;
};

export type VoiceGenerationStyleInput = {
  presetId?: VoiceStylePresetId | string | null;
};

const COMPATIBLE_VOICE_STYLE_PRESET_IDS = new Set<string>(VOICE_STYLE_PRESET_IDS);

export const DEFAULT_VOICE_STYLE_PRESET_ID: VoiceStylePresetId = DEFAULT_VOICE_STYLE_PRESET;

export const VOICE_STYLE_PRESET_DEFINITIONS: Record<VoiceStylePresetId, VoiceStylePresetDefinition> = {
  natural: {
    id: "natural",
    label: "Natural",
    summary: "普段使いの自然な生成 style",
    targetSpeed: "natural",
    targetWpm: 145,
    pauseDensity: "medium",
    intent: "default"
  },
  expressive: {
    id: "expressive",
    label: "Expressive",
    summary: "抑揚を少し強める生成 style",
    targetSpeed: "natural",
    targetWpm: 145,
    pauseDensity: "medium",
    intent: "expression",
    compatibilityAliasFor: "storytelling"
  },
  clear: {
    id: "clear",
    label: "Clear",
    summary: "聞き取りやすさを優先する生成 style",
    targetSpeed: "clear_practice",
    targetWpm: 125,
    pauseDensity: "medium",
    intent: "practice",
    compatibilityAliasFor: "my-voice-clear"
  },
  slow: {
    id: "slow",
    label: "Slow",
    summary: "少しゆっくり真似するための生成 style",
    targetSpeed: "slow_practice",
    targetWpm: 105,
    pauseDensity: "high",
    intent: "practice",
    compatibilityAliasFor: "slow-practice"
  },
  calm: {
    id: "calm",
    label: "Calm",
    summary: "落ち着いた読み",
    targetSpeed: "clear_practice",
    targetWpm: 125,
    pauseDensity: "medium",
    intent: "expression"
  },
  friendly: {
    id: "friendly",
    label: "Friendly",
    summary: "柔らかく親しみやすい読み",
    targetSpeed: "natural",
    targetWpm: 140,
    pauseDensity: "medium",
    intent: "expression"
  },
  excited: {
    id: "excited",
    label: "Excited",
    summary: "少し明るく抑揚を出す",
    targetSpeed: "natural",
    targetWpm: 150,
    pauseDensity: "low",
    intent: "expression"
  },
  serious: {
    id: "serious",
    label: "Serious",
    summary: "低めで落ち着いた読み",
    targetSpeed: "clear_practice",
    targetWpm: 125,
    pauseDensity: "medium",
    intent: "expression"
  },
  storytelling: {
    id: "storytelling",
    label: "Storytelling",
    summary: "意味の流れと間を少し強める",
    targetSpeed: "clear_practice",
    targetWpm: 125,
    pauseDensity: "high",
    intent: "expression"
  },
  presentation: {
    id: "presentation",
    label: "Presentation",
    summary: "1分発表として語尾まで言い切る",
    targetSpeed: "natural",
    targetWpm: 135,
    pauseDensity: "medium",
    intent: "practice"
  },
  "slow-practice": {
    id: "slow-practice",
    label: "Slow practice",
    summary: "まず真似できる見本",
    targetSpeed: "slow_practice",
    targetWpm: 105,
    pauseDensity: "high",
    intent: "practice"
  },
  "native-leaning": {
    id: "native-leaning",
    label: "Native leaning",
    summary: "自然寄りだが速くしすぎない読み",
    targetSpeed: "native_leaning",
    targetWpm: 160,
    pauseDensity: "low",
    intent: "expression"
  },
  "my-voice-clear": {
    id: "my-voice-clear",
    label: "My voice clear",
    summary: "自分の声に近いまま聞き取りやすくする",
    targetSpeed: "clear_practice",
    targetWpm: 125,
    pauseDensity: "medium",
    intent: "practice"
  }
};

export const EXPANDED_VOICE_STYLE_PRESET_OPTIONS = VOICE_STYLE_PRESET_IDS.map((id) => VOICE_STYLE_PRESET_DEFINITIONS[id]);

export const VOICE_STYLE_PRESET_OPTIONS: Array<{
  id: VoiceStylePreset;
  label: string;
  summary: string;
}> = VOICE_STYLE_PRESETS.map((id) => ({
  id,
  label: VOICE_STYLE_PRESET_DEFINITIONS[id].label,
  summary: VOICE_STYLE_PRESET_DEFINITIONS[id].summary
}));

export function normalizeVoiceStylePresetId(presetId: VoiceGenerationStyleInput["presetId"]): VoiceStylePresetId {
  const value = typeof presetId === "string" ? presetId.trim() : "";

  if (value && COMPATIBLE_VOICE_STYLE_PRESET_IDS.has(value)) {
    return value as VoiceStylePresetId;
  }

  return DEFAULT_VOICE_STYLE_PRESET_ID;
}

export function getVoiceStylePresetDefinition(presetId: VoiceGenerationStyleInput["presetId"]) {
  return VOICE_STYLE_PRESET_DEFINITIONS[normalizeVoiceStylePresetId(presetId)];
}

export function getVoiceStyleCompatibilityAlias(presetId: VoiceGenerationStyleInput["presetId"]) {
  const definition = getVoiceStylePresetDefinition(presetId);

  return definition.compatibilityAliasFor ?? definition.id;
}
