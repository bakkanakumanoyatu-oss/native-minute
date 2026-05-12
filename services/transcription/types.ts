export interface TranscriptionAudioFile {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface TranscriptionInput {
  audioFile?: TranscriptionAudioFile;
  audioPath?: string;
  audioStorageKey?: string;
  transcriptText?: string;
  locale?: string;
}

export interface TranscriptionResult {
  transcriptText: string;
  provider: string;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
