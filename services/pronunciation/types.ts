export interface EvaluateAudioFile {
  filename: string;
  contentType: string;
  bytes: Buffer;
  audioPath?: string;
  audioStorageKey?: string;
}

export interface EvaluateInput {
  scriptText: string;
  transcript: string;
  durationSeconds?: number;
  targetSeconds?: number;
  locale?: string;
  audioFile?: EvaluateAudioFile;
  audioPath?: string;
  audioStorageKey?: string;
}

export interface WeakWord {
  word: string;
  score: number;
  note: string;
}

export interface EvaluateResult {
  score: number;
  accuracyScore: number;
  fluencyScore: number;
  rhythmScore: number;
  summaryJa: string;
  strengthsJa: string[];
  weakWords: WeakWord[];
  scriptWordCount: number;
  transcriptWordCount: number;
}

export interface PronunciationProviderDiagnostic {
  key: string;
  label: string;
  ok: boolean;
  message: string;
}

export interface PronunciationProviderStatus {
  provider: string;
  supported: boolean;
  message: string | null;
  readiness: "ready" | "not_configured" | "unsupported";
  diagnostics: PronunciationProviderDiagnostic[];
  recommendedDevelopmentFallbackProvider: "mock" | null;
}

export interface PronunciationEvaluator {
  evaluate(input: EvaluateInput): Promise<EvaluateResult>;
}
