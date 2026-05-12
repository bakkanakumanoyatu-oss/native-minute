const SHORT_RECORDING_RATIO = 0.6;
const MIN_SHORT_RECORDING_SECONDS = 20;

export function getShortRecordingThresholdSeconds(targetSeconds: number) {
  return Math.max(MIN_SHORT_RECORDING_SECONDS, Math.round(targetSeconds * SHORT_RECORDING_RATIO));
}

export function isRecordingTooShort(durationSeconds: number | null | undefined, targetSeconds: number) {
  return typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds < getShortRecordingThresholdSeconds(targetSeconds);
}

export function getShortRecordingPrompt(durationSeconds: number | null | undefined, targetSeconds: number) {
  if (!isRecordingTooShort(durationSeconds, targetSeconds)) {
    return null;
  }

  const thresholdSeconds = getShortRecordingThresholdSeconds(targetSeconds);

  return `この録音は ${durationSeconds} 秒で、目標 ${targetSeconds} 秒に対して短めです。${thresholdSeconds} 秒以上を目安に、語尾まで言い切るテイクで録り直すと評価が安定しやすくなります。`;
}
