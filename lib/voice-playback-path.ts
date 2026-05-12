const SCRIPT_AUDIO_PLAYBACK_PREFIX = "/api/script-audio/";

export function buildScriptAudioPlaybackPath(audioId: string) {
  return `${SCRIPT_AUDIO_PLAYBACK_PREFIX}${encodeURIComponent(audioId)}`;
}

export function parseScriptAudioPlaybackPath(path: string) {
  const pathOnly = (() => {
    try {
      return new URL(path, "http://native-minute.local").pathname;
    } catch {
      return path.split(/[?#]/, 1)[0] ?? path;
    }
  })();

  if (!pathOnly.startsWith(SCRIPT_AUDIO_PLAYBACK_PREFIX)) {
    return null;
  }

  const encodedAudioId = pathOnly.slice(SCRIPT_AUDIO_PLAYBACK_PREFIX.length);

  if (!encodedAudioId) {
    return null;
  }

  try {
    return decodeURIComponent(encodedAudioId);
  } catch {
    return null;
  }
}
