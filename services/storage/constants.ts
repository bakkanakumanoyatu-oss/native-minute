export const RECORDINGS_BUCKET = "recordings";
export const VOICE_SAMPLES_BUCKET = "voice-samples";
export const VOICE_CONSENTS_BUCKET = "voice-consents";
export const RECORDING_FORMAT_LABEL = "webm / wav / m4a / mp3 / ogg";
export const VOICE_SAMPLE_FORMAT_LABEL = RECORDING_FORMAT_LABEL;
export const VOICE_CONSENT_FORMAT_LABEL = "webm / wav / m4a / mp3 / ogg / aac / flac";

export const RECORDING_MIME_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/ogg"
]);
export const VOICE_SAMPLE_MIME_TYPES = RECORDING_MIME_TYPES;
export const VOICE_CONSENT_MIME_TYPES = new Set([
  ...RECORDING_MIME_TYPES,
  "audio/aac",
  "audio/flac"
]);

export const MAX_RECORDING_BYTES = 15 * 1024 * 1024;
export const MAX_VOICE_SAMPLE_BYTES = 15 * 1024 * 1024;
export const MAX_VOICE_CONSENT_BYTES = 10 * 1024 * 1024;
