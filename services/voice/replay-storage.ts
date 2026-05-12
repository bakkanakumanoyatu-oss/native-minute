export const SCRIPT_AUDIO_STORAGE_BUCKET = "script-audios";

type ScriptAudioStorageObjectKeyInput = {
  userId: string;
  scriptId: string;
  voiceId: string;
  cacheKey: string;
  contentType: string;
};

function getScriptAudioExtension(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized.includes("wav")) {
    return "wav";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }

  if (normalized.includes("ogg")) {
    return "ogg";
  }

  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return "m4a";
  }

  return "bin";
}

export function buildScriptAudioStorageObjectKey(input: ScriptAudioStorageObjectKeyInput) {
  // Chosen shape for generated script audio objects:
  // - userId prefix: coarse storage ownership / policy boundary
  // - scriptId + voiceId: keep the object path legible without relying on provider IDs
  // - cacheKey: align with the persisted script_audios cache identity
  return `${input.userId}/${input.scriptId}/${input.voiceId}/${input.cacheKey}.${getScriptAudioExtension(input.contentType)}`;
}
