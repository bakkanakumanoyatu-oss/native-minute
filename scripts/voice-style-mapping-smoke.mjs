import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function printCheck(label, ok, detail) {
  console.log(`- ${label}: ${ok ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
}

function assertCheck(label, ok, detail) {
  printCheck(label, ok, detail);

  if (!ok) {
    throw new Error(label);
  }
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

console.log("Native Minute voice style mapping smoke");
console.log("- scope: static boundary check only; no provider API calls");

const providerTypes = read("providers/voice/types.ts");
const styleMapper = read("providers/voice/style-mapper.ts");
const mockProvider = read("providers/voice/mock.ts");
const elevenLabsProvider = read("providers/voice/elevenlabs.ts");
const openAiProvider = read("providers/voice/openai.ts");
const voiceService = read("services/voice/voice.service.ts");
const cacheService = read("services/voice/cache.ts");
const voiceSchema = read("schemas/voice.ts");
const audioLibraryService = read("services/audio-library/audio-library.service.ts");

assertCheck(
  "SynthesizeInput accepts generation style but not playbackRate",
  providerTypes.includes("voiceStylePreset?: VoiceStylePreset") && !providerTypes.includes("playbackRate"),
  "provider input stays generation-only"
);

assertCheck(
  "speakScript passes voiceStylePreset into cache and provider synthesize",
  includesAll(voiceService, [
    "const voiceStylePreset = input.voiceStylePreset ?? DEFAULT_VOICE_STYLE_PRESET",
    "voiceStylePreset,",
    "provider.synthesize({",
    "voiceStylePreset"
  ]),
  "service boundary carries style intent"
);

assertCheck(
  "cache key includes provider-neutral style preset and excludes playbackRate",
  includesAll(cacheService, ["voiceStylePreset?: string | null", "input.voiceStylePreset ?? \"default\""]) &&
    cacheService.includes("must not include playbackRate"),
  "cache identity excludes client playback speed"
);

assertCheck(
  "provider mapper is the provider-specific style boundary",
  includesAll(styleMapper, [
    "mapVoiceGenerationStyleForProvider",
    "buildNeutralVoiceGenerationStyle",
    "voice_settings",
    "unsupportedPresetFallback"
  ]),
  "ElevenLabs maps settings; unsupported providers fallback"
);

assertCheck(
  "ElevenLabs uses the mapper for synthesize request body",
  includesAll(elevenLabsProvider, ["mapVoiceGenerationStyleForProvider", "voice_settings: styleOptions.elevenLabs?.voice_settings"]),
  "provider-specific values stay in adapter"
);

assertCheck(
  "OpenAI synthesize does not receive ad hoc style prompt text",
  !openAiProvider.includes("mapVoiceGenerationStyleForProvider") &&
    !openAiProvider.includes("voiceStylePreset") &&
    includesAll(openAiProvider, ["model:", "input:", "voice:", "response_format:"]),
  "OpenAI remains explicit fallback until style knobs are defined"
);

assertCheck(
  "mock provider accepts style contract without shaping audio",
  includesAll(mockProvider, ["void input.voiceStylePreset", "does not", "generation style", "playbackRate never reaches"]),
  "mock smoke checks boundary, not sound quality"
);

assertCheck(
  "public speak-script schema still exposes only current four presets",
  includesAll(voiceSchema, ["z.enum(VOICE_STYLE_PRESETS).optional()", "Expanded S7 preset ids are local definitions"]),
  "API contract unchanged"
);

assertCheck(
  "Audio Library metadata stores safe style snapshot and no playbackRate",
  includesAll(audioLibraryService, [
    "voice_style_preset",
    "voice_style_label",
    "target_speed",
    "target_wpm",
    "pause_density",
    "cache_key_hash",
    "cache_key_prefix"
  ]) && !audioLibraryService.includes("playbackRate"),
  "saved model audio identity excludes playback speed"
);

console.log("\nResult: voice style mapping boundary looks consistent.");
