import { AppError } from "@/lib/errors";
import { requireEnv } from "@/lib/env";
import { isRecordingTooShort } from "@/lib/recording";
import type {
  EvaluateAudioFile,
  EvaluateInput,
  EvaluateResult,
  PronunciationEvaluator,
  PronunciationProviderDiagnostic,
  PronunciationProviderStatus,
  WeakWord
} from "./types";

type AzureSdk = typeof import("microsoft-cognitiveservices-speech-sdk");
type AzureRecognitionResult = import("microsoft-cognitiveservices-speech-sdk").SpeechRecognitionResult;

type AzurePronunciationWord = {
  word: string;
  accuracyScore: number;
  errorType: string;
};

type AzurePronunciationSegment = {
  text: string;
  pronunciationScore: number;
  accuracyScore: number;
  fluencyScore: number;
  prosodyScore: number;
  words: AzurePronunciationWord[];
};

const WAV_CONTENT_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav"]);

function createRequirementDiagnostic(key: string, label: string, ok: boolean, message: string): PronunciationProviderDiagnostic {
  return { key, label, ok, message };
}

function createEnvDiagnostic(
  key: string,
  label: string,
  envValue: string | undefined,
  configuredMessage: string,
  missingMessage: string
): PronunciationProviderDiagnostic {
  return {
    key,
    label,
    ok: Boolean(envValue?.trim()),
    message: envValue?.trim() ? configuredMessage : missingMessage
  };
}

export function getAzurePronunciationProviderStatus(): PronunciationProviderStatus {
  const diagnostics = [
    createEnvDiagnostic(
      "speech-key",
      "AZURE_SPEECH_KEY",
      process.env.AZURE_SPEECH_KEY,
      "Azure Speech key は設定済みです。",
      "Azure Speech key が未設定です。"
    ),
    createEnvDiagnostic(
      "speech-region",
      "AZURE_SPEECH_REGION",
      process.env.AZURE_SPEECH_REGION,
      "Azure Speech region は設定済みです。",
      "Azure Speech region が未設定です。"
    ),
    createRequirementDiagnostic(
      "locale",
      "locale",
      true,
      "評価時は script locale を Azure Speech recognizer に渡します。未指定時の既定は en-US です。"
    ),
    createRequirementDiagnostic(
      "audio-format",
      "audio format",
      true,
      "Azure evaluator は PCM WAV を前提にします。browser 録音や非 wav file は client 側で変換できるときだけ wav/PCM へ正規化してから upload します。"
    ),
    createRequirementDiagnostic(
      "recognition-mode",
      "recognition mode",
      true,
      "1分前後の録音を想定して continuous recognition で pronunciation assessment を集計します。"
    ),
    createRequirementDiagnostic(
      "prosody",
      "prosody support",
      true,
      "Prosody assessment は en-US で有効にし、review の rhythmScore へ寄せます。"
    )
  ];

  if (!process.env.AZURE_SPEECH_KEY?.trim() || !process.env.AZURE_SPEECH_REGION?.trim()) {
    return {
      provider: "azure",
      supported: false,
      message: "PRONUNCIATION_PROVIDER=azure を使うには AZURE_SPEECH_KEY と AZURE_SPEECH_REGION が必要です。",
      readiness: "not_configured",
      diagnostics,
      recommendedDevelopmentFallbackProvider: "mock"
    };
  }

  return {
    provider: "azure",
    supported: true,
    message: null,
    readiness: "ready",
    diagnostics,
    recommendedDevelopmentFallbackProvider: "mock"
  };
}

export function getAzurePronunciationStatusMessage() {
  return getAzurePronunciationProviderStatus().message;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function countOverlap(scriptWords: string[], transcriptWords: string[]) {
  const transcriptSet = new Set(transcriptWords);
  return scriptWords.filter((word) => transcriptSet.has(word)).length;
}

function roundScore(value: number | null | undefined, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(value ?? fallback)));
}

function computeWeightedAverage(values: Array<{ score: number; weight: number }>, fallback = 0) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0) {
    return fallback;
  }

  return values.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
}

function isLikelyPcmWav(audioFile: EvaluateAudioFile) {
  if (WAV_CONTENT_TYPES.has(audioFile.contentType.toLowerCase())) {
    return true;
  }

  return audioFile.filename.toLowerCase().endsWith(".wav");
}

function parseWavFormat(bytes: Buffer) {
  if (bytes.length < 44) {
    return null;
  }

  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let audioFormat: number | null = null;
  let channels: number | null = null;
  let sampleRate: number | null = null;
  let bitsPerSample: number | null = null;
  let hasDataChunk = false;

  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt " && chunkDataOffset + 16 <= bytes.length) {
      audioFormat = bytes.readUInt16LE(chunkDataOffset);
      channels = bytes.readUInt16LE(chunkDataOffset + 2);
      sampleRate = bytes.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = bytes.readUInt16LE(chunkDataOffset + 14);
    }

    if (chunkId === "data") {
      hasDataChunk = true;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!hasDataChunk || audioFormat === null || channels === null || sampleRate === null || bitsPerSample === null) {
    return null;
  }

  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample
  };
}

function assertSupportedAzureAudioFile(input: EvaluateInput) {
  const audioFile = input.audioFile;

  if (!audioFile) {
    throw new AppError(400, "Azure pronunciation assessment では保存済み録音の audio bytes が必要です。録音を保存し直してから再試行してください。");
  }

  if (!isLikelyPcmWav(audioFile)) {
    throw new AppError(
      400,
      "Azure pronunciation assessment は現在 wav/PCM file のみ対応です。client 側の自動変換で扱えない場合は、wav ファイルを選ぶか PRONUNCIATION_PROVIDER=mock に戻して継続してください。"
    );
  }

  const wavFormat = parseWavFormat(audioFile.bytes);

  if (!wavFormat || wavFormat.audioFormat !== 1) {
    throw new AppError(
      400,
      "Azure pronunciation assessment は現在 PCM WAV 録音を前提にしています。16-bit PCM wav を選び直すか、開発継続は PRONUNCIATION_PROVIDER=mock を使用してください。"
    );
  }

  return audioFile;
}

function createWeakWordNote(errorType: string, score: number) {
  const normalized = errorType.toLowerCase();

  if (normalized === "omission") {
    return "この単語が抜けやすいので、語尾まで言い切ってください。";
  }

  if (normalized === "insertion") {
    return "余分な音が入らないよう、単語の切れ目を整えましょう。";
  }

  if (normalized === "unexpectedbreak" || normalized === "missingbreak") {
    return "単語のつながりと間の取り方を少し整えると自然です。";
  }

  if (normalized === "monotone") {
    return "抑揚を少しつけると、より自然な響きになります。";
  }

  if (score < 60) {
    return "母音と子音の形をはっきり出して、ゆっくり正確に当ててください。";
  }

  return "この単語の音を少し丁寧に置くと、聞き取りやすさが上がります。";
}

function buildWeakWords(segments: AzurePronunciationSegment[], scriptText: string, transcript: string): WeakWord[] {
  const weakWordMap = new Map<string, WeakWord>();

  for (const segment of segments) {
    for (const word of segment.words) {
      const normalizedWord = normalize(word.word);

      if (!normalizedWord) {
        continue;
      }

      const isClearlyWeak = word.accuracyScore < 80 || word.errorType.toLowerCase() !== "none";

      if (!isClearlyWeak) {
        continue;
      }

      const current = weakWordMap.get(normalizedWord);
      const next: WeakWord = {
        word: normalizedWord,
        score: roundScore(word.accuracyScore),
        note: createWeakWordNote(word.errorType, roundScore(word.accuracyScore))
      };

      if (!current || next.score < current.score) {
        weakWordMap.set(normalizedWord, next);
      }
    }
  }

  const transcriptSet = new Set(tokenize(transcript));
  const missingScriptWords = tokenize(scriptText).filter((word) => !transcriptSet.has(word) && !weakWordMap.has(word));

  for (const [index, word] of missingScriptWords.entries()) {
    weakWordMap.set(word, {
      word,
      score: Math.max(55 - index * 5, 25),
      note: "台本のこの単語が抜けやすいので、語尾まで言い切ってください。"
    });

    if (weakWordMap.size >= 4) {
      break;
    }
  }

  return [...weakWordMap.values()].sort((left, right) => left.score - right.score).slice(0, 4);
}

function buildStrengthsJa(input: {
  accuracyScore: number;
  fluencyScore: number;
  rhythmScore: number;
  coverage: number;
}) {
  const strengths: string[] = [];

  if (input.accuracyScore >= 80) {
    strengths.push("単語ごとの発音精度は大きく崩れていません。");
  }

  if (input.fluencyScore >= 80) {
    strengths.push("語のつながりと間の取り方は安定しています。");
  }

  if (input.rhythmScore >= 78) {
    strengths.push("抑揚とリズムは自然さが見えています。");
  }

  if (input.coverage >= 0.9) {
    strengths.push("台本の最後まで読み切る流れは保てています。");
  }

  if (strengths.length === 0) {
    strengths.push("1分台本の流れ自体は保てています。");
  }

  return strengths.slice(0, 3);
}

function buildSummaryJa(input: {
  score: number;
  coverage: number;
  isShortTake: boolean;
  weakWords: WeakWord[];
}) {
  const focusWords = input.weakWords.slice(0, 2).map((item) => item.word).filter(Boolean);

  if (input.isShortTake) {
    return "録音が短めです。1分に近づけつつ、語尾まで言い切るテイクで評価を取り直しましょう。";
  }

  if (input.coverage < 0.85) {
    return "全体の流れはつかめていますが、台本の抜けがまだあります。後半まで言い切る意識を少し強めましょう。";
  }

  if (input.score >= 85) {
    return focusWords.length > 0
      ? `かなり安定しています。次は ${focusWords.join("、")} の置き方だけを軽く整えるとさらに自然です。`
      : "かなり安定しています。次はリズムと語尾の抜けを少し整えるだけで十分です。";
  }

  if (focusWords.length > 0) {
    return `流れは保てています。次は ${focusWords.join("、")} を丁寧に置いて、聞き取りやすさを上げましょう。`;
  }

  return "全体の流れは作れています。弱い単語の置き方と語尾の抜けを減らすと、さらに安定します。";
}

function toAzureSegment(sdk: AzureSdk, result: AzureRecognitionResult): AzurePronunciationSegment | null {
  if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
    return null;
  }

  const assessment = sdk.PronunciationAssessmentResult.fromResult(result);
  const detail = assessment.detailResult;

  return {
    text: result.text?.trim() ?? "",
    pronunciationScore: assessment.pronunciationScore,
    accuracyScore: assessment.accuracyScore,
    fluencyScore: assessment.fluencyScore,
    prosodyScore: assessment.prosodyScore,
    words: (detail.Words ?? []).map((word) => ({
      word: word.Word ?? "",
      accuracyScore: word.PronunciationAssessment?.AccuracyScore ?? 0,
      errorType: word.PronunciationAssessment?.ErrorType ?? "None"
    }))
  };
}

function createAzureSpeechConfig(sdk: AzureSdk, locale: string) {
  const speechConfig = sdk.SpeechConfig.fromSubscription(requireEnv("AZURE_SPEECH_KEY").trim(), requireEnv("AZURE_SPEECH_REGION").trim());
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;
  speechConfig.speechRecognitionLanguage = locale;
  return speechConfig;
}

function mapAzureCancellationError(input: {
  errorDetails: string;
  errorCode: string;
  sessionId: string | null;
}) {
  const errorCode = input.errorCode.trim();

  console.warn("Azure pronunciation assessment canceled", {
    sessionId: input.sessionId,
    errorCode,
    hasErrorDetails: Boolean(input.errorDetails.trim())
  });

  if (errorCode === "AuthenticationFailure" || errorCode === "Forbidden") {
    return new AppError(
      502,
      "Azure Speech が認証を拒否しました。AZURE_SPEECH_KEY / AZURE_SPEECH_REGION / Azure リソース状態を確認してください。"
    );
  }

  if (errorCode === "ConnectionFailure" || errorCode === "ServiceTimeout" || errorCode === "ServiceError" || errorCode === "TooManyRequests") {
    return new AppError(
      503,
      "Azure Speech が一時的に利用できません。少し待ってから再試行し、続く場合は region と Azure 側状態を確認してください。"
    );
  }

  return new AppError(
    502,
    "Azure Speech pronunciation assessment に失敗しました。locale、音声形式、録音長を確認してください。"
  );
}

async function runContinuousPronunciationAssessment(sdk: AzureSdk, input: {
  scriptText: string;
  locale: string;
  audioFile: EvaluateAudioFile;
}) {
  const speechConfig = createAzureSpeechConfig(sdk, input.locale);
  const audioConfig = sdk.AudioConfig.fromWavFileInput(input.audioFile.bytes, input.audioFile.filename);
  const assessmentConfig = new sdk.PronunciationAssessmentConfig(
    input.scriptText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Word,
    false
  );

  if (input.locale.toLowerCase() === "en-us") {
    assessmentConfig.enableProsodyAssessment = true;
  }

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  assessmentConfig.applyTo(recognizer);

  return new Promise<{ segments: AzurePronunciationSegment[]; sessionId: string | null }>((resolve, reject) => {
    const segments: AzurePronunciationSegment[] = [];
    let sessionId: string | null = null;
    let settled = false;

    const cleanup = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      recognizer.close(() => callback(), () => callback());
    };

    recognizer.sessionStarted = (_sender, event) => {
      sessionId = event.sessionId;
    };

    recognizer.recognized = (_sender, event) => {
      const segment = toAzureSegment(sdk, event.result);
      if (segment) {
        segments.push(segment);
      }
    };

    recognizer.canceled = (_sender, event) => {
      if (event.reason === sdk.CancellationReason.EndOfStream) {
        return;
      }

      cleanup(() => reject(mapAzureCancellationError({
        errorDetails: event.errorDetails ?? "",
        errorCode: sdk.CancellationErrorCode[event.errorCode] ?? "Unknown",
        sessionId
      })));
    };

    recognizer.sessionStopped = () => {
      cleanup(() => resolve({ segments, sessionId }));
    };

    recognizer.startContinuousRecognitionAsync(
      () => undefined,
      (error) => {
        console.warn("Azure pronunciation assessment start failed", {
          hasError: Boolean(error)
        });
        cleanup(() => reject(new AppError(502, "Azure Speech への接続に失敗しました。AZURE_SPEECH_REGION とネットワーク状態を確認してください。")));
      }
    );
  });
}

export class AzureSpeechPronunciationEvaluator implements PronunciationEvaluator {
  async evaluate(input: EvaluateInput): Promise<EvaluateResult> {
    const audioFile = assertSupportedAzureAudioFile(input);
    const locale = input.locale?.trim() || "en-US";

    let sdk: AzureSdk;

    try {
      sdk = await import("microsoft-cognitiveservices-speech-sdk");
    } catch {
      throw new AppError(500, "Azure Speech SDK を読み込めませんでした。依存関係の install を確認してください。");
    }

    const { segments } = await runContinuousPronunciationAssessment(sdk, {
      scriptText: input.scriptText,
      locale,
      audioFile
    });

    if (segments.length === 0) {
      throw new AppError(502, "Azure Speech から評価結果を取得できませんでした。音声形式、録音長、locale を確認してください。");
    }

    const scriptWords = tokenize(input.scriptText);
    const transcriptWords = tokenize(input.transcript);
    const coverage = scriptWords.length === 0 ? 0 : countOverlap(scriptWords, transcriptWords) / scriptWords.length;
    const score = roundScore(
      computeWeightedAverage(segments.map((segment) => ({
        score: segment.pronunciationScore,
        weight: Math.max(segment.words.length, 1)
      })))
    );
    const accuracyScore = roundScore(
      computeWeightedAverage(segments.map((segment) => ({
        score: segment.accuracyScore,
        weight: Math.max(segment.words.length, 1)
      })))
    );
    const fluencyScore = roundScore(
      computeWeightedAverage(segments.map((segment) => ({
        score: segment.fluencyScore,
        weight: Math.max(tokenize(segment.text).length, 1)
      })))
    );
    const prosodySegments = segments.filter((segment) => segment.prosodyScore > 0);
    const rhythmScore = roundScore(
      prosodySegments.length > 0
        ? computeWeightedAverage(prosodySegments.map((segment) => ({
            score: segment.prosodyScore,
            weight: Math.max(tokenize(segment.text).length, 1)
          })))
        : fluencyScore
    );
    const weakWords = buildWeakWords(segments, input.scriptText, input.transcript);
    const isShortTake = isRecordingTooShort(input.durationSeconds, input.targetSeconds ?? 60);

    return {
      score,
      accuracyScore,
      fluencyScore,
      rhythmScore,
      summaryJa: buildSummaryJa({
        score,
        coverage,
        isShortTake,
        weakWords
      }),
      strengthsJa: buildStrengthsJa({
        accuracyScore,
        fluencyScore,
        rhythmScore,
        coverage
      }),
      weakWords,
      scriptWordCount: scriptWords.length,
      transcriptWordCount: transcriptWords.length
    };
  }
}

export function createAzureSpeechPronunciationEvaluator() {
  const status = getAzurePronunciationProviderStatus();

  if (!status.supported) {
    throw new AppError(503, status.message ?? "Azure Speech pronunciation assessment の設定を確認してください。");
  }

  return new AzureSpeechPronunciationEvaluator();
}
