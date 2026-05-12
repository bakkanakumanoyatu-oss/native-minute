"use client";

function getAudioContextConstructor() {
  return window.AudioContext
    ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ?? null;
}

function getBaseFilename(filename: string) {
  const trimmed = filename.trim();

  if (!trimmed.includes(".")) {
    return trimmed || "recording";
  }

  return trimmed.slice(0, trimmed.lastIndexOf(".")) || "recording";
}

function encodeWaveHeader(dataView: DataView, input: { sampleRate: number; byteLength: number }) {
  const bytesPerSample = 2;
  const channels = 1;
  const byteRate = input.sampleRate * bytesPerSample * channels;
  const blockAlign = bytesPerSample * channels;

  dataView.setUint32(0, 0x52494646, false);
  dataView.setUint32(4, 36 + input.byteLength, true);
  dataView.setUint32(8, 0x57415645, false);
  dataView.setUint32(12, 0x666d7420, false);
  dataView.setUint32(16, 16, true);
  dataView.setUint16(20, 1, true);
  dataView.setUint16(22, channels, true);
  dataView.setUint32(24, input.sampleRate, true);
  dataView.setUint32(28, byteRate, true);
  dataView.setUint16(32, blockAlign, true);
  dataView.setUint16(34, 16, true);
  dataView.setUint32(36, 0x64617461, false);
  dataView.setUint32(40, input.byteLength, true);
}

function mixToMono(audioBuffer: AudioBuffer) {
  const mono = new Float32Array(audioBuffer.length);

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex);

    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      mono[sampleIndex] += channel[sampleIndex] / audioBuffer.numberOfChannels;
    }
  }

  return mono;
}

function writePcmSamples(dataView: DataView, offset: number, samples: Float32Array) {
  let byteOffset = offset;

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const normalized = Math.max(-1, Math.min(1, samples[sampleIndex] ?? 0));
    const value = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
    dataView.setInt16(byteOffset, Math.round(value), true);
    byteOffset += 2;
  }
}

function encodeAudioBufferToPcmWav(audioBuffer: AudioBuffer) {
  const monoSamples = mixToMono(audioBuffer);
  const bytesPerSample = 2;
  const dataByteLength = monoSamples.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataByteLength);
  const dataView = new DataView(arrayBuffer);

  encodeWaveHeader(dataView, {
    sampleRate: Math.round(audioBuffer.sampleRate),
    byteLength: dataByteLength
  });
  writePcmSamples(dataView, 44, monoSamples);

  return arrayBuffer;
}

export function isBrowserPcmWavFile(file: File) {
  const normalizedType = file.type.trim().toLowerCase();
  return normalizedType === "audio/wav" || normalizedType === "audio/wave" || normalizedType === "audio/x-wav" || file.name.toLowerCase().endsWith(".wav");
}

export async function normalizeBrowserAudioFileToPcmWav(file: File) {
  if (isBrowserPcmWavFile(file)) {
    return file;
  }

  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    throw new Error("Azure evaluation 用に wav/PCM へ変換できませんでした。このブラウザでは音声 decode に対応していないため、wav ファイルを選ぶか mock に戻して継続してください。");
  }

  const audioContext = new AudioContextConstructor();

  try {
    const sourceBytes = await file.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(sourceBytes.slice(0));
    const wavBytes = encodeAudioBufferToPcmWav(decoded);

    return new File([wavBytes], `${getBaseFilename(file.name)}.wav`, {
      type: "audio/wav",
      lastModified: Date.now()
    });
  } catch {
    throw new Error("Azure evaluation 用に wav/PCM へ変換できませんでした。wav / PCM ファイルを選ぶか、PRONUNCIATION_PROVIDER=mock に戻して継続してください。");
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}
