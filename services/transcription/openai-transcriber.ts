import { AppError } from "@/lib/errors";
import { requireEnv } from "@/lib/env";
import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from "./types";

function getOpenAiTranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
}

function localeToLanguage(locale?: string) {
  return locale?.split("-")[0]?.trim() || undefined;
}

type OpenAiTranscriptionResponse = {
  text?: string;
};

function getOpenAiTranscriptionFailureMessage(status: number) {
  if (status === 401 || status === 403) {
    return "OpenAI transcription の認証に失敗しました。OPENAI_API_KEY と provider 側の利用権限を確認してください。";
  }

  if (status === 413) {
    return "OpenAI transcription に送った録音ファイルが大きすぎます。1分以内の音声で再試行してください。";
  }

  if (status === 429) {
    return "OpenAI transcription が一時的に混み合っています。少し待ってから再試行してください。";
  }

  if (status >= 500) {
    return "OpenAI transcription が一時的に利用できません。少し待ってから再試行してください。";
  }

  return "OpenAI transcription に失敗しました。音声形式、録音長、無音が多くないか、またはモデル設定を確認してください。30〜60秒程度のはっきりした英語音声で再試行してください。";
}

export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!input.audioFile) {
      throw new AppError(400, "transcription に使う録音ファイルが見つかりません。");
    }

    const form = new FormData();
    const fileBlob = new Blob([new Uint8Array(input.audioFile.bytes)], {
      type: input.audioFile.contentType
    });

    form.append("file", fileBlob, input.audioFile.filename);
    form.append("model", getOpenAiTranscriptionModel());
    form.append("response_format", "json");

    const language = localeToLanguage(input.locale);
    if (language) {
      form.append("language", language);
    }

    let response: Response;

    try {
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`
        },
        body: form
      });
    } catch {
      throw new AppError(502, "OpenAI transcription への接続に失敗しました。API キーとネットワーク状態を確認してください。");
    }

    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
      await response.text().catch(() => "");
      console.warn("OpenAI transcription failed", {
        status: response.status,
        requestId: requestId ?? undefined
      });
      throw new AppError(response.status >= 400 && response.status < 500 ? 400 : 502, getOpenAiTranscriptionFailureMessage(response.status));
    }

    const payload = (await response.json()) as OpenAiTranscriptionResponse;
    const transcriptText = payload.text?.trim();

    if (!transcriptText) {
      throw new AppError(
        422,
        "OpenAI transcription の結果が空でした。音声が短い、無音が多い、または英語が聞き取りにくい可能性があります。30〜60秒程度のはっきりした英語音声で再試行してください。"
      );
    }

    return {
      transcriptText,
      provider: "openai"
    };
  }
}

export function createOpenAiTranscriptionProvider() {
  return new OpenAiTranscriptionProvider();
}
