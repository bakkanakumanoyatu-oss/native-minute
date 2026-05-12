import { getActionExecutionCue } from "@/lib/guidance-execution";
import { formatFocusedWordList, prioritizeFocusWordGroups } from "@/lib/focus-words";
import type { GuidanceActionKind, GuidanceTone } from "@/lib/guidance-ui";

type RecordFailurePhase = "record" | "upload" | "evaluate";

export type RecordRecoveryGuidance = {
  tone: GuidanceTone;
  actionKind: GuidanceActionKind;
  titleJa: string;
  summaryJa: string;
  stepsJa: string[];
  primaryActionLabelJa: string;
  retryKeepsUpload: boolean;
  focusWords: string[];
  focusReasonJa: string | null;
  focusSummaryJa: string | null;
  executionCueJa: string;
  sourceHintJa: string | null;
};

type RecordRecoveryGuidanceInput = {
  phase: RecordFailurePhase;
  message: string;
  status: number | null;
  transcriptionProvider: string;
  pronunciationProvider: string;
  hasUploadedRecording: boolean;
  shortRecordingPrompt: string | null;
};

type RecordNextStepGuidanceInput = {
  hasSelectedFile: boolean;
  hasUploadedRecording: boolean;
  isMeasuringDuration: boolean;
  isMissingRequiredFallback: boolean;
  shortRecordingPrompt: string | null;
  transcriptionSupported: boolean;
  transcriptionMessage: string | null;
  practiceContext: {
    takeCount: number;
    improvementTrend: "up" | "down" | "flat" | "insufficient_data";
    latestTake: {
      weakWords: string[];
      coachNextStepJa: string;
      coachFocusWords: string[];
    } | null;
    latestVsBest: {
      regressedWeakWords: string[];
      commonWeakWords: string[];
    } | null;
  } | null;
};

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function getRecordFocusWords(input: RecordNextStepGuidanceInput) {
  const latestTake = input.practiceContext?.latestTake;
  const latestVsBest = input.practiceContext?.latestVsBest;

  const prioritized = prioritizeFocusWordGroups([
    {
      words: latestVsBest?.regressedWeakWords ?? [],
      reasonJa: "ベスト結果との差として、いま戻す価値が高い単語だからです。"
    },
    {
      words: latestVsBest?.commonWeakWords ?? [],
      reasonJa: "ベスト結果と比べても、続けて残っている弱点だからです。"
    },
    {
      words: latestTake?.weakWords ?? [],
      reasonJa: "直前の結果でも weak words に残っていたためです。"
    },
    {
      words: latestTake?.coachFocusWords ?? [],
      reasonJa: "直前 coach が次の結果の重点として挙げているためです。"
    }
  ]);

  return {
    words: prioritized.words,
    reasonJa: prioritized.reasonJa,
    summaryJa: formatFocusedWordList(prioritized.words, prioritized.hiddenCount)
  };
}

function formatWords(words: string[]) {
  return words.length > 0 ? words.slice(0, 3).join("、") : null;
}

export function getRecordRecoveryGuidance(input: RecordRecoveryGuidanceInput): RecordRecoveryGuidance {
  const normalized = input.message.toLowerCase();

  if (input.phase === "record") {
    if (includesAny(normalized, ["マイク", "ブラウザでは録音に対応"])) {
      return {
        tone: "focus",
        actionKind: "prepare_recording",
        titleJa: "録音方法を切り替える",
        summaryJa: "マイク録音で止まっているので、権限を見直すか音声ファイル選択に切り替えるのが最短です。",
        stepsJa: [
          "ブラウザのマイク権限を確認する",
          "急ぐ場合は「音声ファイルを選択」で既存録音を使う",
          "録音できたらそのまま評価に進む"
        ],
        primaryActionLabelJa: "録音方法を切り替える",
        retryKeepsUpload: false,
        focusWords: [],
        focusReasonJa: null,
        focusSummaryJa: null,
        executionCueJa: getActionExecutionCue("prepare_recording", []),
        sourceHintJa: null
      };
    }

    return {
      tone: "info",
      actionKind: "prepare_recording",
      titleJa: "録音の準備を整える",
      summaryJa: "録音準備で止まっているので、録音できる状態を作ってからもう一度進めれば十分です。",
      stepsJa: [
        "マイク録音かファイル選択のどちらかを選ぶ",
        "録音が入っているか再生プレビューで確認する",
        "そのあと評価を再開する"
      ],
      primaryActionLabelJa: "録音を準備する",
      retryKeepsUpload: false,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("prepare_recording", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["bucket", "storage", "policy", "権限"])) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "storage 設定を確認する",
      summaryJa: "録音の保存先か権限で止まっているため、今は録り直しより storage 設定の確認が先です。",
      stepsJa: [
        "recordings バケットと migration 適用状況を確認する",
        "ログイン状態と storage policy を確認する",
        "設定後に同じ録音で保存からやり直す"
      ],
      primaryActionLabelJa: "storage を確認する",
      retryKeepsUpload: false,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("settings", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["対応していない録音形式", "大きすぎ", "空です"])) {
    return {
      tone: "focus",
      actionKind: "record",
      titleJa: "録音ファイルを差し替える",
      summaryJa: "ファイル自体の条件で止まっているので、形式か長さを整えた録音に差し替えるのが早いです。",
      stepsJa: [
        "webm / wav / m4a / mp3 / ogg のいずれかを使う",
        "1 分以内で中身のある録音にする",
        "新しいファイルを選び直して upload からやり直す"
      ],
      primaryActionLabelJa: "録音を差し替える",
      retryKeepsUpload: false,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("record", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["openai_api_key", "transcription_provider", "未対応", "環境変数"])) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "transcription 設定を直す",
      summaryJa: `provider 設定で止まっているため、録音内容より先に環境変数と ${input.transcriptionProvider} の設定状態の確認が必要です。`,
      stepsJa: [
        "`TRANSCRIPTION_PROVIDER` の設定値を確認する",
        "openai を使う場合は `OPENAI_API_KEY` を確認する",
        "設定後に同じ録音で評価を再開する"
      ],
      primaryActionLabelJa: "設定を確認する",
      retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("settings", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["wav/pcm", "pcm wav", "wav file", "webm は自動変換", "16-bit pcm wav"])) {
    return {
      tone: "focus",
      actionKind: "record",
      titleJa: "Azure 用の音声形式を整える",
      summaryJa: "Azure pronunciation assessment で扱える音声形式に正規化できていないため、録音内容より先に wav/PCM へ整える必要があります。",
      stepsJa: [
        "このブラウザで自動変換できるか確認して再試行する",
        "続く場合は wav / PCM 形式の録音ファイルを選び直す",
        "開発継続を優先するときは `PRONUNCIATION_PROVIDER=mock` に戻す"
      ],
      primaryActionLabelJa: "音声形式を整える",
      retryKeepsUpload: false,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("record", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["認証を拒否", "authenticationfailure", "forbidden", "azure_speech_key", "azure_speech_region"])) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "Azure 設定を確認する",
      summaryJa: `Azure Speech 側の設定または資格情報で止まっているため、録音内容より先に ${input.pronunciationProvider} の設定状態を確認する必要があります。`,
      stepsJa: [
        "`PRONUNCIATION_PROVIDER` の設定値を確認する",
        "`AZURE_SPEECH_KEY` と `AZURE_SPEECH_REGION` を確認する",
        "続く場合は Azure portal 側の resource 状態を確認する"
      ],
      primaryActionLabelJa: "Azure 設定を確認する",
      retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("settings", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["一時的に利用できません", "connectionfailure", "servicetimeout", "serviceerror", "toomanyrequests"])) {
    return {
      tone: "focus",
      actionKind: input.hasUploadedRecording ? "retry_saved_evaluate" : "record",
      titleJa: "同じ録音で再試行する",
      summaryJa: "Azure Speech の一時失敗に見えるので、まずは同じ録音で evaluation をやり直すのが最短です。",
      stepsJa: [
        input.hasUploadedRecording ? "録音は保存済みなので、再 upload せず evaluation だけやり直せる" : "必要なら録音を保存してから evaluation をやり直す",
        "数秒待ってから再試行する",
        "続く場合は Azure region と service 側状態を確認する"
      ],
      primaryActionLabelJa: input.hasUploadedRecording ? "同じ録音で再試行する" : "もう一度試す",
      retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue(input.hasUploadedRecording ? "retry_saved_evaluate" : "record", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["azure speech", "pronunciation assessment", "pronunciation_provider", "azure_speech_key", "azure_speech_region"])) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "evaluation 設定を直す",
      summaryJa: `pronunciation evaluator の前提で止まっているため、録音内容より先に ${input.pronunciationProvider} の設定状態を確認する必要があります。`,
      stepsJa: [
        "`PRONUNCIATION_PROVIDER` の設定値を確認する",
        "Azure を使う場合は `AZURE_SPEECH_KEY` と `AZURE_SPEECH_REGION` を確認する",
        "現状は `PRONUNCIATION_PROVIDER=mock` に戻して main loop を継続する"
      ],
      primaryActionLabelJa: "evaluation 設定を確認する",
      retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("settings", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["mock transcription", "transcript fallback", "fallback として渡"])) {
    return {
      tone: "focus",
      actionKind: "fallback",
      titleJa: "補助 transcript を入れる",
      summaryJa: "mock transcription のままなので、開発中は補助 transcript を入れてから評価を続ける必要があります。",
      stepsJa: [
        "下の補助 transcript に台本どおりの文を入れる",
        "同じ録音を使って評価を再試行する",
        "実運用では `TRANSCRIPTION_PROVIDER=openai` を使う"
      ],
      primaryActionLabelJa: "補助 transcript を入れる",
      retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("fallback", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["結果が空", "無音", "聞き取りにくい"])) {
    return {
      tone: "focus",
      actionKind: "record",
      titleJa: "声が入った録音に差し替える",
      summaryJa: "文字起こし結果が空に近いので、同じ録音を押し切るより、30〜60秒程度のはっきりした英語で録り直すほうが安定します。",
      stepsJa: [
        "長い無音を避けて、script に近い英語を声に出す",
        "30〜60秒程度を目安に録り直す",
        "再生プレビューで声が入っていることを確認してから評価する"
      ],
      primaryActionLabelJa: "声が入った録音でやり直す",
      retryKeepsUpload: false,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("record", []),
      sourceHintJa: null
    };
  }

  if (includesAny(normalized, ["openai transcription", "接続に失敗", "通信に失敗", "結果が空"])) {
    return {
      tone: "focus",
      actionKind: input.hasUploadedRecording ? "retry_saved_evaluate" : "record",
      titleJa: "同じ録音で再試行する",
      summaryJa: "通信か transcription 側の一時失敗に見えるので、まずは同じ録音で評価をもう一度試すのが最短です。",
      stepsJa: [
        input.hasUploadedRecording ? "録音は保存済みなので、再 upload せず評価だけやり直せる" : "必要ならもう一度保存してから評価する",
        "数秒待ってから再試行する",
        "続く場合は API キー・ネットワーク・モデル設定を確認する"
      ],
      primaryActionLabelJa: input.hasUploadedRecording ? "同じ録音で再試行する" : "もう一度試す",
      retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue(input.hasUploadedRecording ? "retry_saved_evaluate" : "record", []),
      sourceHintJa: null
    };
  }

  if (input.shortRecordingPrompt) {
    return {
      tone: "focus",
      actionKind: "record",
      titleJa: "長さを戻して録り直す",
      summaryJa: "録音が短めなので、評価失敗のあとにそのまま押し切るより長さを戻した結果を作るほうが安定しやすいです。",
      stepsJa: [
        "語尾まで言い切るつもりで 1 分近い長さに戻す",
        "必要なら listen を 1 回だけ挟む",
        "新しい録音で保存からやり直す"
      ],
      primaryActionLabelJa: "録り直す",
      retryKeepsUpload: false,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("record", []),
      sourceHintJa: null
    };
  }

  return {
    tone: input.phase === "evaluate" ? "focus" : "info",
    actionKind: input.phase === "evaluate" && input.hasUploadedRecording ? "retry_saved_evaluate" : input.phase === "evaluate" ? "record" : "prepare_recording",
    titleJa: input.phase === "evaluate" ? "評価をやり直す" : "upload をやり直す",
    summaryJa:
      input.phase === "evaluate"
        ? `評価処理で止まっているので、今の録音を保ったまま再試行するか、必要なら録り直しに切り替えれば十分です${input.status ? ` (status ${input.status})` : ""}。`
        : `保存処理で止まっているので、録音を確認してからもう一度 upload すれば十分です${input.status ? ` (status ${input.status})` : ""}。`,
    stepsJa:
      input.phase === "evaluate"
        ? [
            input.hasUploadedRecording ? "録音は保存済みなので、評価だけ再試行できる" : "必要なら upload からもう一度やり直す",
            "同じエラーが続く場合は録音を差し替える",
            "設定系メッセージなら env を確認する"
          ]
        : [
            "録音ファイルが選ばれているか確認する",
            "必要なら録音を作り直すか別ファイルに差し替える",
            "そのあと upload からやり直す"
          ],
    primaryActionLabelJa: input.phase === "evaluate" && input.hasUploadedRecording ? "同じ録音で再試行する" : "もう一度試す",
    retryKeepsUpload: input.phase === "evaluate" && input.hasUploadedRecording,
    focusWords: [],
    focusReasonJa: null,
    focusSummaryJa: null,
    executionCueJa: getActionExecutionCue(
      input.phase === "evaluate" && input.hasUploadedRecording ? "retry_saved_evaluate" : input.phase === "evaluate" ? "record" : "prepare_recording",
      []
    ),
    sourceHintJa: null
  };
}

export function getRecordNextStepGuidance(input: RecordNextStepGuidanceInput): RecordRecoveryGuidance {
  const latestTake = input.practiceContext?.latestTake ?? null;
  const latestVsBest = input.practiceContext?.latestVsBest ?? null;
  const focus = getRecordFocusWords(input);
  const focusWords = focus.words;
  const focusLabel = formatWords(focusWords);

  if (!input.transcriptionSupported) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "transcription 設定を確認する",
      summaryJa: input.transcriptionMessage ?? "transcription provider の設定を確認してから進める必要があります。",
      stepsJa: [
        "`TRANSCRIPTION_PROVIDER` の設定値を確認する",
        "openai を使う場合は `OPENAI_API_KEY` を確認する",
        "設定後に同じ録音で評価を再開する"
      ],
      primaryActionLabelJa: "設定を確認する",
      retryKeepsUpload: input.hasUploadedRecording,
      focusWords: [],
      focusReasonJa: null,
      focusSummaryJa: null,
      executionCueJa: getActionExecutionCue("settings", []),
      sourceHintJa: null
    };
  }

  if (!input.hasSelectedFile) {
    return {
      tone: "info",
      actionKind: "prepare_recording",
      titleJa: "まず録音を準備する",
      summaryJa: latestTake
        ? "次に進むには、マイク録音するか音声ファイルを選ぶ必要があります。直前の結果の重点をそのまま次の 1 本に持ち込めます。"
        : "次に進むには、マイク録音するか音声ファイルを選ぶ必要があります。",
      stepsJa: [
        "マイク録音かファイル選択のどちらかを使う",
        focusLabel ? `${focusLabel} を意識するつもりで準備する` : "再生プレビューで音声が入っていることを確認する",
        "そのあと保存と評価を進める"
      ],
      primaryActionLabelJa: "録音を準備する",
      retryKeepsUpload: false,
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getActionExecutionCue("prepare_recording", focusWords),
      sourceHintJa: latestTake ? "直前の結果で出た focus words を引き継いでいます。" : null
    };
  }

  if (input.isMeasuringDuration) {
    return {
      tone: "info",
      actionKind: "prepare_recording",
      titleJa: "録音の長さを確認する",
      summaryJa: "自動判定が終わるまで待つか、必要なら録音秒数を手入力すると次に進めます。",
      stepsJa: [
        "自動判定が終わるまで少し待つ",
        "必要なら録音秒数を手入力する",
        "長さが出たら評価に進む"
      ],
      primaryActionLabelJa: "長さを確認する",
      retryKeepsUpload: false,
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getActionExecutionCue("prepare_recording", focusWords),
      sourceHintJa: latestTake ? "直前の結果の focus を保ったまま、まず長さだけ確定します。" : null
    };
  }

  if (input.shortRecordingPrompt) {
    return {
      tone: "focus",
      actionKind: "record",
      titleJa: "長さを戻してから進む",
      summaryJa: focusLabel
        ? `短めの録音なので、そのまま押し切るより長さを戻しつつ ${focusLabel} を含む録音に差し替えるほうが安定します。`
        : "短めの録音なので、そのまま押し切るより長さを戻した録音に差し替えるほうが安定します。",
      stepsJa: [
        "必要なら listen を 1 回だけ挟む",
        "語尾まで言い切るつもりで録り直す",
        "長さを戻してから保存と評価を進める"
      ],
      primaryActionLabelJa: "録り直す",
      retryKeepsUpload: false,
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getActionExecutionCue("record", focusWords),
      sourceHintJa: latestTake ? "直前の結果の focus words を保ったまま、まず長さを戻します。" : null
    };
  }

  if (input.isMissingRequiredFallback) {
    return {
      tone: "focus",
      actionKind: "fallback",
      titleJa: "補助 transcript を入れてから進む",
      summaryJa: latestTake
        ? "mock transcription のままなので、開発中は補助 transcript を入れないと評価に進めません。直前の結果の重点をそのまま試せます。"
        : "mock transcription のままなので、開発中は補助 transcript を入れないと評価に進めません。",
      stepsJa: [
        "下の補助 transcript に台本どおりの文を入れる",
        latestTake?.coachNextStepJa ?? "同じ録音のまま評価に進む",
        "実運用では `TRANSCRIPTION_PROVIDER=openai` を使う"
      ],
      primaryActionLabelJa: "補助 transcript を入力する",
      retryKeepsUpload: input.hasUploadedRecording,
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getActionExecutionCue("fallback", focusWords),
      sourceHintJa: latestTake ? "補助 transcript を入れても、結果確認由来の focus はそのまま使えます。" : null
    };
  }

  if (input.hasUploadedRecording) {
    return {
      tone: "focus",
      actionKind: "retry_saved_evaluate",
      titleJa: "保存済み録音で評価を続ける",
      summaryJa: focusLabel
        ? `この録音はすでに保存済みなので、次は再 upload せず、${focusLabel} を意識したまま評価を続ける段階です。`
        : "この録音はすでに保存済みなので、次は再 upload せず評価を続ける段階です。",
      stepsJa: [
        latestTake?.coachNextStepJa ?? "必要なら補助 transcript を整える",
        "保存済み録音のまま評価を再試行する",
        latestVsBest?.regressedWeakWords.length ? `${formatWords(latestVsBest.regressedWeakWords) ?? "崩れた単語"} を意識して結果を見る` : "失敗した場合も Recovery plan に沿って対処する"
      ],
      primaryActionLabelJa: "保存済み録音で再試行する",
      retryKeepsUpload: true,
      focusWords,
      focusReasonJa: focus.reasonJa,
      focusSummaryJa: focus.summaryJa,
      executionCueJa: getActionExecutionCue("retry_saved_evaluate", focusWords),
      sourceHintJa: latestTake ? "直前の結果の coach / weak words を見ながら、同じ録音で再試行できます。" : null
    };
  }

  return {
    tone: "steady",
    actionKind: "record",
      titleJa: "この録音で評価に進む",
    summaryJa:
      input.practiceContext?.improvementTrend === "down" && focusLabel
        ? `録音の準備はできています。直前の結果で崩れた ${focusLabel} を意識して、このまま評価に進めます。`
        : input.practiceContext?.takeCount
          ? "録音の準備はできています。直前の結果の重点を引き継いだまま、このまま評価に進めます。"
          : "録音の準備はできているので、このまま保存して評価に進めます。",
    stepsJa: [
      focusLabel ? `${focusLabel} を意識できているか再生プレビューで 1 回確認する` : "再生プレビューで録音内容を 1 回確認する",
      "そのまま保存と評価を進める",
      latestTake?.coachNextStepJa ?? "失敗した場合は画面内の Recovery plan を使う"
    ],
    primaryActionLabelJa: "この録音で進む",
    retryKeepsUpload: false,
    focusWords,
    focusReasonJa: focus.reasonJa,
    focusSummaryJa: focus.summaryJa,
    executionCueJa: getActionExecutionCue("record", focusWords),
    sourceHintJa: latestTake ? "直前の結果の coach / weak words を次の 1 本に引き継いでいます。" : null
  };
}
