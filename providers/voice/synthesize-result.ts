import { buildScriptAudioPlaybackPath } from "@/lib/voice-playback-path";
import type { SynthesizeResult } from "./types";

export const INITIAL_REAL_VOICE_ADAPTER_AUDIO_SOURCE_KIND = "inline-bytes";

type BaseSynthesizeResultInput = {
  providerRequestId: string;
  cached?: boolean;
  playbackPath?: string;
};

export type InlineBytesSynthesizeResultInput = BaseSynthesizeResultInput & {
  bytesBase64: string;
  contentType: string;
};

export type TemporaryUrlSynthesizeResultInput = BaseSynthesizeResultInput & {
  url: string;
  contentType?: string;
};

type MockReplayPathSynthesizeResultInput = {
  providerRequestId: string;
  playbackPath: string;
  cached?: boolean;
};

export function normalizeSynthesizeContentType(contentType: string) {
  const normalized = contentType.trim().toLowerCase().split(";")[0] ?? "";

  if (normalized === "audio/x-wav") {
    return "audio/wav";
  }

  if (normalized === "audio/mp3") {
    return "audio/mpeg";
  }

  if (normalized === "video/webm") {
    return "audio/webm";
  }

  return normalized || "application/octet-stream";
}

export function isSpecificAudioContentType(contentType: string) {
  const normalized = normalizeSynthesizeContentType(contentType);
  return normalized.startsWith("audio/") && normalized !== "application/octet-stream";
}

function resolvePlaybackPath(input: BaseSynthesizeResultInput) {
  return input.playbackPath?.trim() || buildScriptAudioPlaybackPath(`provider-${input.providerRequestId}`);
}

export function createInlineBytesSynthesizeResult(input: InlineBytesSynthesizeResultInput): SynthesizeResult {
  const playbackPath = resolvePlaybackPath(input);

  return {
    audioUrl: playbackPath,
    providerRequestId: input.providerRequestId,
    cached: input.cached ?? false,
    playbackPath,
    audioSource: {
      kind: "inline-bytes",
      bytesBase64: input.bytesBase64,
      contentType: normalizeSynthesizeContentType(input.contentType)
    }
  };
}

export function createPreferredInitialVoiceSynthesizeResult(input: InlineBytesSynthesizeResultInput): SynthesizeResult {
  // For the first real provider, prefer inline bytes:
  // - no extra fetch layer before app-owned storage upload
  // - no temporary URL expiry concerns
  // - stageScriptAudioForReplay can reuse the current upload path unchanged
  return createInlineBytesSynthesizeResult(input);
}

export function createTemporaryUrlSynthesizeResult(input: TemporaryUrlSynthesizeResultInput): SynthesizeResult {
  const playbackPath = resolvePlaybackPath(input);

  return {
    audioUrl: input.url,
    providerRequestId: input.providerRequestId,
    cached: input.cached ?? false,
    playbackPath,
    audioSource: {
      kind: "temporary-url",
      url: input.url,
      contentType: input.contentType ? normalizeSynthesizeContentType(input.contentType) : undefined
    }
  };
}

export function createMockReplayPathSynthesizeResult(input: MockReplayPathSynthesizeResultInput): SynthesizeResult {
  return {
    audioUrl: input.playbackPath,
    providerRequestId: input.providerRequestId,
    cached: input.cached ?? false,
    playbackPath: input.playbackPath,
    audioSource: {
      kind: "mock-replay-path",
      playbackPath: input.playbackPath
    }
  };
}
