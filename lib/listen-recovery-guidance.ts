import { getActionExecutionCue } from "@/lib/guidance-execution";
import type { GuidanceActionKind, GuidanceTone } from "@/lib/guidance-ui";
import { getListenPracticeGuidance, type ListenPracticeContext } from "@/lib/listen-guidance";

type ListenRecoveryKind =
  | "provider_unavailable"
  | "consent_required"
  | "voice_required"
  | "generate_failed"
  | "quality_concern"
  | "playback_failed"
  | "playback_unstable";

export type ListenRecoveryGuidance = {
  tone: GuidanceTone;
  actionKind: GuidanceActionKind;
  titleJa: string;
  summaryJa: string;
  reasonJa: string;
  primaryActionLabelJa: string;
  executionCueJa: string;
  followupCueJa: string | null;
  focusWords: string[];
  focusReasonJa: string | null;
  focusSummaryJa: string | null;
};

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function isElevenLabsMessage(text: string) {
  return text.includes("elevenlabs");
}

function isDeletedElevenLabsVoiceMessage(text: string) {
  return isElevenLabsMessage(text) && (text.includes("voice が見つかりません") || text.includes("voice not found") || text.includes("404"));
}

function isElevenLabsAccountOrLimitMessage(text: string) {
  return (
    isElevenLabsMessage(text) &&
    includesAny(text, [
      "rate limit",
      "too many requests",
      "利用枠",
      "課金",
      "billing",
      "quota",
      "plan",
      "実行権限",
      "api key",
      "tts 利用可否"
    ])
  );
}

function isScriptAudioStorageMessage(text: string) {
  return includesAny(text, [
    "script-audios",
    "お手本ボイスの保存",
    "お手本ボイスの読み込み",
    "保存権限",
    "参照権限",
    "storage policy",
    "bucket"
  ]);
}

export function getListenRecoveryGuidance(input: {
  kind: ListenRecoveryKind;
  message: string | null;
  hasAudio: boolean;
  practiceContext: ListenPracticeContext;
}): ListenRecoveryGuidance {
  const baseGuidance = getListenPracticeGuidance({
    hasAudio: input.hasAudio,
    practiceContext: input.practiceContext
  });

  if (input.kind === "provider_unavailable") {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "voice 設定を確認する",
      summaryJa: "お手本ボイスを作れないため、聞いてまねる前に voice provider の設定を直す必要があります。",
      reasonJa: input.message ?? "voice provider が現在は利用できません。",
      primaryActionLabelJa: "voice 設定へ進む",
      executionCueJa: getActionExecutionCue("settings", []),
      followupCueJa: baseGuidance.executionCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "consent_required") {
    return {
      tone: "focus",
      actionKind: "settings",
      titleJa: "voice の同意を完了する",
      summaryJa: "お手本ボイスを作る前に、まず `/setup/voice` で consent を完了する必要があります。",
      reasonJa: input.message ?? "consent がないとお手本を聞けません。",
      primaryActionLabelJa: "voice 設定へ進む",
      executionCueJa: getActionExecutionCue("settings", []),
      followupCueJa: baseGuidance.executionCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "voice_required") {
    return {
      tone: "focus",
      actionKind: "settings",
      titleJa: "voice を作成する",
      summaryJa: "consent は済んでいますが、お手本ボイスを作る voice がまだないため、先に voice を作る必要があります。",
      reasonJa: input.message ?? "voice がないとお手本ボイスを作れません。",
      primaryActionLabelJa: "voice を作成する",
      executionCueJa: getActionExecutionCue("settings", []),
      followupCueJa: baseGuidance.executionCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "quality_concern") {
    return {
      tone: "focus",
      actionKind: "listen",
      titleJa: "違和感があるときの次の判断",
      summaryJa: "音は聞こえています。更新の意味は上の `音声状態` を確認しつつ、一時的な違和感か、voice 自体を見直すべきかをここで切り分けます。",
      reasonJa: input.message ?? "再生失敗ではなく、聞こえ方や voice の印象に違和感がある状態です。",
      primaryActionLabelJa: "同じ voice のまま更新する",
      executionCueJa: "まず違和感が一時的かを切り分け、同じ voice で十分なら更新し、voice 自体が違うなら voice 設定に戻し、許容できるなら今の音声で進みます。",
      followupCueJa: baseGuidance.followupCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  const normalized = (input.message ?? "").toLowerCase();
  if (input.kind === "playback_failed") {
    return {
      tone: "alert",
      actionKind: "listen",
      titleJa: "再生方法を立て直す",
      summaryJa: input.hasAudio
        ? "お手本ボイス自体はあるので、まずお手本の更新かブラウザ再読込で再生を立て直すのが自然です。"
        : "再生を続ける前に、まずお手本ボイスをもう一度作って再生を立て直す必要があります。",
      reasonJa: input.message ?? "ブラウザでお手本を再生できませんでした。",
      primaryActionLabelJa: "お手本を更新する",
      executionCueJa: "ブラウザ再生を確認し、難しければお手本を更新して 1 回だけ聞き直します。",
      followupCueJa: baseGuidance.followupCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "playback_unstable") {
    return {
      tone: "focus",
      actionKind: "listen",
      titleJa: "再生を安定させる",
      summaryJa: "一時的に再生が不安定なので、聞き続けるより一度立て直してから短く聞き直すほうが自然です。",
      reasonJa: input.message ?? "再生が途中で止まるか、読み込みが不安定です。",
      primaryActionLabelJa: "お手本を更新する",
      executionCueJa: "いったん再生を止めて状態を戻し、必要ならお手本を更新してから 1 回だけ聞き直します。",
      followupCueJa: baseGuidance.followupCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "generate_failed" && isDeletedElevenLabsVoiceMessage(normalized)) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "ElevenLabs voice を作り直す",
      summaryJa: "ElevenLabs 側で保存済み voice が見つからないため、この voice では新しいお手本ボイスを作れません。",
      reasonJa: input.message ?? "ElevenLabs 側で voice が見つかりませんでした。",
      primaryActionLabelJa: "voice 設定へ進む",
      executionCueJa: "先に /setup/voice で voice を作り直します。急ぐ場合は mock provider に戻して main loop を続けます。",
      followupCueJa: baseGuidance.executionCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "generate_failed" && isElevenLabsAccountOrLimitMessage(normalized)) {
    return {
      tone: "alert",
      actionKind: "settings",
      titleJa: "ElevenLabs の利用状態を確認する",
      summaryJa: "API key、TTS 利用可否、rate limit、plan / quota / billing のどれかで provider 側が止まっています。",
      reasonJa: input.message ?? "ElevenLabs text-to-speech を実行できませんでした。",
      primaryActionLabelJa: "voice 設定へ進む",
      executionCueJa: "rate limit なら少し待ってから 1 回だけ再試行し、権限や利用枠の問題なら provider 側を確認します。開発継続は mock provider へ戻せます。",
      followupCueJa: baseGuidance.executionCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  if (input.kind === "generate_failed" && isScriptAudioStorageMessage(normalized)) {
    return {
      tone: "alert",
      actionKind: "listen",
      titleJa: "お手本ボイスの保存・再生準備を確認する",
      summaryJa: "provider の合成後、app-owned storage または protected replay の準備で止まっています。provider voice を作り直す前に storage 側を確認します。",
      reasonJa: input.message ?? "お手本ボイスの保存または読み込みに失敗しました。",
      primaryActionLabelJa: "もう一度生成する",
      executionCueJa: "一時的な保存失敗かを 1 回だけ確認し、続く場合は script-audios bucket / storage policy / replay route を確認します。",
      followupCueJa: baseGuidance.followupCueJa,
      focusWords: baseGuidance.focusWords,
      focusReasonJa: baseGuidance.focusReasonJa,
      focusSummaryJa: baseGuidance.focusSummaryJa
    };
  }

  const needsSettings = includesAny(normalized, ["provider", "voice", "/setup/voice", "一致しません", "未対応"]);
  const actionKind: GuidanceActionKind = needsSettings ? "settings" : "listen";

  return {
    tone: needsSettings ? "alert" : "focus",
    actionKind,
    titleJa: needsSettings ? "voice 設定を確認してからやり直す" : input.hasAudio ? "お手本の作り直しを試す" : "お手本ボイスを作り直す",
    summaryJa: needsSettings
      ? "お手本ボイスの作成が設定側で止まっているため、再試行より先に `/setup/voice` と provider 状態の確認が必要です。"
      : input.hasAudio
        ? "作り直しだけ失敗しているので、今のお手本を使うか、少し待ってからもう一度更新するのが自然です。"
        : "お手本ボイスの作成に失敗したので、少し待ってからもう一度作り、練習を再開するのが自然です。",
    reasonJa: input.message ?? "お手本ボイスの作成に失敗しました。",
    primaryActionLabelJa: needsSettings ? "voice 設定へ進む" : "もう一度生成する",
    executionCueJa: getActionExecutionCue(actionKind, baseGuidance.focusWords),
    followupCueJa: baseGuidance.followupCueJa,
    focusWords: baseGuidance.focusWords,
    focusReasonJa: baseGuidance.focusReasonJa,
    focusSummaryJa: baseGuidance.focusSummaryJa
  };
}
