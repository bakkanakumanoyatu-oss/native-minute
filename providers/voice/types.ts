import type { VoiceStylePreset } from "@/lib/voice-style";

export interface CreateConsentRecordingInput {
  audioPath: string;
  contentType?: string;
  byteLength?: number;
}

export interface CreateConsentInput {
  userId: string;
  provider: string;
  termsAcceptedAt: string;
  // App-owned voice_consents row remains the product source of truth.
  // Provider adapters can use these fields to call external consent APIs,
  // but they should not replace the persisted app consent record.
  name?: string;
  language?: string;
  recording?: CreateConsentRecordingInput;
}

export interface CreateConsentResult {
  providerConsentId: string;
  provider: string;
  consentedAt: string;
}

export interface CreateVoiceSampleInput {
  audioPath: string;
  contentType?: string;
  byteLength?: number;
}

export interface CreateVoiceInput {
  userId: string;
  consentId: string;
  providerConsentId?: string;
  label: string;
  // Preferred real-provider path: app-owned uploaded sample reference.
  // Adapters should convert this into provider-specific multipart/upload calls
  // without widening the app contract.
  sampleAudio?: CreateVoiceSampleInput;
  // Deprecated fallback for mock / older callers.
  sampleAudioPath?: string;
}

export interface CreateVoiceResult {
  providerVoiceId: string;
  label: string;
}

export interface VoiceProviderRequirements {
  provider: string;
  providerLabel: string;
  voiceLabel: string;
  requiresConsentName: boolean;
  requiresConsentLanguage: boolean;
  requiresConsentRecording: boolean;
  requiresSampleAudio: boolean;
  requiresProviderConsentId: boolean;
  entitlementSensitive: boolean;
  builtInVoiceFallbackAvailable: boolean;
  recommendedDevelopmentFallbackProvider: string | null;
}

export type VoiceProviderReadiness = "ready" | "not_configured" | "not_implemented" | "unsupported";

export interface VoiceProviderDiagnostic {
  key: string;
  label: string;
  ok: boolean;
  message: string;
}

export interface VoiceProviderStatus {
  provider: string;
  supported: boolean;
  message: string | null;
  readiness: VoiceProviderReadiness;
  requirements: VoiceProviderRequirements;
  diagnostics: VoiceProviderDiagnostic[];
}

export interface SynthesizeInput {
  providerVoiceId: string;
  text: string;
  locale?: string;
  voiceStylePreset?: VoiceStylePreset;
}

export type SynthesizeAudioSource =
  | {
      // Preferred when the provider SDK already returns bytes.
      kind: "inline-bytes";
      bytesBase64: string;
      contentType: string;
    }
  | {
      // Preferred when the provider only exposes a temporary fetch URL.
      kind: "temporary-url";
      url: string;
      contentType?: string;
    }
  | {
      // Current mock compatibility path.
      kind: "mock-replay-path";
      playbackPath: string;
    };

export interface SynthesizeResult {
  // Legacy compatibility for current mock flow. Real providers should prefer audioSource
  // and let stageScriptAudioForReplay normalize into the app-owned replay path.
  audioUrl: string;
  providerRequestId: string;
  cached: boolean;
  // Optional explicit replay path. If omitted, stageScriptAudioForReplay derives one
  // from providerRequestId and persists the app-owned replay path there.
  playbackPath?: string;
  // Provider adapter output that stageScriptAudioForReplay normalizes into app-owned storage.
  // Adapter helpers in providers/voice/synthesize-result.ts should normalize contentType before setting this.
  audioSource?: SynthesizeAudioSource;
}

export interface VoiceProvider {
  // Fixed boundary:
  // consent/default voice/cache/replay remain app-owned.
  // Adapters only translate the app contract into provider-specific requests.
  createConsent(input: CreateConsentInput): Promise<CreateConsentResult>;
  createVoice(input: CreateVoiceInput): Promise<CreateVoiceResult>;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
}
