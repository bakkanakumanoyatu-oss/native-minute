import {
  getVoiceStyleCompatibilityAlias,
  getVoiceStylePresetDefinition,
  type VoiceGenerationStyleInput,
  type VoicePauseDensity,
  type VoiceSpeedIntent,
  type VoiceStylePresetId
} from "@/lib/voice-style";

export type NeutralVoiceGenerationStyle = {
  presetId: VoiceStylePresetId;
  compatibilityAliasFor: VoiceStylePresetId;
  targetSpeed: VoiceSpeedIntent;
  targetWpm: number;
  pauseDensity: VoicePauseDensity;
};

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
};

export type ProviderVoiceGenerationStyleOptions = {
  presetId: VoiceStylePresetId;
  neutral: NeutralVoiceGenerationStyle;
  elevenLabs?: {
    voice_settings: ElevenLabsVoiceSettings;
  };
  openAi?: {
    // OpenAI speech currently has no stable public equivalent for these style knobs in this repo.
    // Keep this as an explicit boundary so style intent does not leak as ad hoc prompt text.
    unsupportedPresetFallback: VoiceStylePresetId;
  };
  unsupportedPresetFallback?: VoiceStylePresetId;
};

const ELEVENLABS_VOICE_STYLE_SETTINGS: Record<VoiceStylePresetId, ElevenLabsVoiceSettings> = {
  natural: {
    stability: 0.5,
    similarity_boost: 0.8,
    style: 0.1,
    speed: 1,
    use_speaker_boost: true
  },
  expressive: {
    stability: 0.35,
    similarity_boost: 0.8,
    style: 0.25,
    speed: 1,
    use_speaker_boost: true
  },
  clear: {
    stability: 0.6,
    similarity_boost: 0.85,
    style: 0.05,
    speed: 0.95,
    use_speaker_boost: true
  },
  slow: {
    stability: 0.45,
    similarity_boost: 0.8,
    style: 0.15,
    speed: 0.9,
    use_speaker_boost: true
  },
  calm: {
    stability: 0.65,
    similarity_boost: 0.85,
    style: 0.05,
    speed: 0.95,
    use_speaker_boost: true
  },
  friendly: {
    stability: 0.45,
    similarity_boost: 0.8,
    style: 0.18,
    speed: 1,
    use_speaker_boost: true
  },
  excited: {
    stability: 0.32,
    similarity_boost: 0.78,
    style: 0.32,
    speed: 1.03,
    use_speaker_boost: true
  },
  serious: {
    stability: 0.68,
    similarity_boost: 0.86,
    style: 0.04,
    speed: 0.96,
    use_speaker_boost: true
  },
  storytelling: {
    stability: 0.4,
    similarity_boost: 0.82,
    style: 0.24,
    speed: 0.95,
    use_speaker_boost: true
  },
  presentation: {
    stability: 0.58,
    similarity_boost: 0.84,
    style: 0.08,
    speed: 0.98,
    use_speaker_boost: true
  },
  "slow-practice": {
    stability: 0.48,
    similarity_boost: 0.82,
    style: 0.1,
    speed: 0.88,
    use_speaker_boost: true
  },
  "native-leaning": {
    stability: 0.42,
    similarity_boost: 0.78,
    style: 0.16,
    speed: 1.03,
    use_speaker_boost: true
  },
  "my-voice-clear": {
    stability: 0.62,
    similarity_boost: 0.88,
    style: 0.04,
    speed: 0.95,
    use_speaker_boost: true
  }
};

export function buildNeutralVoiceGenerationStyle(input: VoiceGenerationStyleInput): NeutralVoiceGenerationStyle {
  const definition = getVoiceStylePresetDefinition(input.presetId);

  return {
    presetId: definition.id,
    compatibilityAliasFor: getVoiceStyleCompatibilityAlias(definition.id),
    targetSpeed: definition.targetSpeed,
    targetWpm: definition.targetWpm,
    pauseDensity: definition.pauseDensity
  };
}

export function mapVoiceGenerationStyleForProvider(
  provider: string,
  input: VoiceGenerationStyleInput
): ProviderVoiceGenerationStyleOptions {
  const neutral = buildNeutralVoiceGenerationStyle(input);

  if (provider === "elevenlabs") {
    return {
      presetId: neutral.presetId,
      neutral,
      elevenLabs: {
        voice_settings: ELEVENLABS_VOICE_STYLE_SETTINGS[neutral.presetId]
      }
    };
  }

  if (provider === "openai") {
    return {
      presetId: neutral.presetId,
      neutral,
      openAi: {
        unsupportedPresetFallback: "natural"
      },
      unsupportedPresetFallback: "natural"
    };
  }

  return {
    presetId: neutral.presetId,
    neutral,
    unsupportedPresetFallback: "natural"
  };
}
