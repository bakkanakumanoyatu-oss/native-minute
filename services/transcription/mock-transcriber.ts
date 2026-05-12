import { AppError } from "@/lib/errors";
import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from "./types";

function normalizeTranscript(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const hasAudioReference = Boolean(input.audioFile || input.audioPath?.trim() || input.audioStorageKey?.trim());
    const transcriptText = input.transcriptText?.trim();

    if (!hasAudioReference) {
      throw new AppError(400, "audioPath または audioStorageKey が必要です。");
    }

    if (transcriptText) {
      return {
        transcriptText: normalizeTranscript(transcriptText),
        provider: "mock-dev-fallback"
      };
    }

    throw new AppError(
      501,
      "音声入力は受け取りましたが、transcription provider はまだ mock のままです。TRANSCRIPTION_PROVIDER=openai を設定するか、開発中は transcriptText を fallback として渡してください。"
    );
  }
}

export function createMockTranscriptionProvider() {
  return new MockTranscriptionProvider();
}
