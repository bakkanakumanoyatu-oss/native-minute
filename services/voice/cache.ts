import { createHash } from "node:crypto";

type CacheKeyInput = {
  revisionId?: string;
  provider: string;
  voiceId: string;
  scriptLocale: string;
  scriptContent: string;
  // Cache identity should use the provider-neutral generation preset id.
  // It must not include playbackRate, provider raw request payloads, signed URLs, or audio bytes.
  voiceStylePreset?: string | null;
};

export function buildScriptAudioCacheKey(input: CacheKeyInput) {
  if (input.revisionId) return createHash("sha256").update(JSON.stringify(["v2", input.revisionId, input.provider, input.voiceId, input.voiceStylePreset ?? "default"])).digest("hex").slice(0, 32);
  // Legacy v1 is retained only for explicit compatibility inspection.
  // Cache identity stays on server-owned script content, locale, the saved voice row, provider, and generation style.
  return createHash("sha256")
    .update([input.provider, input.voiceId, input.scriptLocale, input.voiceStylePreset ?? "default", input.scriptContent].join("|"))
    .digest("hex")
    .slice(0, 24);
}
