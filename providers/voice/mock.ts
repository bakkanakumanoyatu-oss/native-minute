import type {
  CreateConsentInput,
  CreateConsentResult,
  CreateVoiceInput,
  CreateVoiceResult,
  SynthesizeInput,
  VoiceProvider
} from "./types";
import { createMockReplayPathSynthesizeResult } from "./synthesize-result";
import { buildScriptAudioPlaybackPath } from "@/lib/voice-playback-path";

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export class MockVoiceProvider implements VoiceProvider {
  async createConsent(input: CreateConsentInput): Promise<CreateConsentResult> {
    return {
      providerConsentId: createId("consent"),
      provider: input.provider,
      consentedAt: input.termsAcceptedAt
    };
  }

  async createVoice(input: CreateVoiceInput): Promise<CreateVoiceResult> {
    return {
      providerVoiceId: createId("provider_voice"),
      label: input.label
    };
  }

  async synthesize(input: SynthesizeInput) {
    // Mock keeps the same synthesize contract as real providers, but it does not
    // shape audio by generation style. speakScript/cache/Audio Library metadata
    // still see voiceStylePreset; playbackRate never reaches provider adapters.
    void input.voiceStylePreset;
    const playbackPath = buildScriptAudioPlaybackPath(createId("audio"));

    return createMockReplayPathSynthesizeResult({
      providerRequestId: createId("speak"),
      playbackPath,
      cached: false
    });
  }
}

export function createMockVoiceProvider(): VoiceProvider {
  return new MockVoiceProvider();
}
