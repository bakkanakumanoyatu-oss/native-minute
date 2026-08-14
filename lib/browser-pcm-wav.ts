"use client";

export const AZURE_PCM_SAMPLE_RATE = 16_000;
export const AZURE_PCM_CHANNELS = 1;
export const AZURE_PCM_BITS_PER_SAMPLE = 16;

export type PcmWavFormat = Readonly<{
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataByteLength: number;
}>;

export type PcmSignalClassification =
  | "SIGNAL_PRESENT"
  | "LOW_SIGNAL"
  | "DIGITAL_SILENCE";

export type PcmSignalAnalysis = Readonly<{
  classification: PcmSignalClassification;
  peakAbsoluteAmplitude: number;
  rmsAmplitude: number;
  nearZeroRatio: number;
}>;

// Gate 3 rejects only samples indistinguishable from digital zero. The wider
// low-signal band is advisory until real-device calibration is available.
const DIGITAL_SILENCE_SAMPLE_MAGNITUDE = 4;
const DIGITAL_SILENCE_MAX_RMS = 2 / 0x8000;
const DIGITAL_SILENCE_MIN_NEAR_ZERO_RATIO = 0.999;
const LOW_SIGNAL_MAX_PEAK = 0.01;
const LOW_SIGNAL_MAX_RMS = 0.001;

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
  const bytesPerSample = AZURE_PCM_BITS_PER_SAMPLE / 8;
  const byteRate = input.sampleRate * bytesPerSample * AZURE_PCM_CHANNELS;
  const blockAlign = bytesPerSample * AZURE_PCM_CHANNELS;

  dataView.setUint32(0, 0x52494646, false);
  dataView.setUint32(4, 36 + input.byteLength, true);
  dataView.setUint32(8, 0x57415645, false);
  dataView.setUint32(12, 0x666d7420, false);
  dataView.setUint32(16, 16, true);
  dataView.setUint16(20, 1, true);
  dataView.setUint16(22, AZURE_PCM_CHANNELS, true);
  dataView.setUint32(24, input.sampleRate, true);
  dataView.setUint32(28, byteRate, true);
  dataView.setUint16(32, blockAlign, true);
  dataView.setUint16(34, AZURE_PCM_BITS_PER_SAMPLE, true);
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

export function resampleMonoPcm(
  samples: Float32Array,
  inputSampleRate: number,
  outputSampleRate = AZURE_PCM_SAMPLE_RATE
) {
  if (
    !Number.isFinite(inputSampleRate) ||
    inputSampleRate <= 0 ||
    !Number.isFinite(outputSampleRate) ||
    outputSampleRate <= 0
  ) {
    throw new Error("Invalid PCM sample rate.");
  }

  if (samples.length === 0 || inputSampleRate === outputSampleRate) {
    return samples.slice();
  }

  const outputLength = Math.max(1, Math.round(samples.length * outputSampleRate / inputSampleRate));
  const output = new Float32Array(outputLength);
  const sourceScale = inputSampleRate / outputSampleRate;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * sourceScale;
    const leftIndex = Math.min(Math.floor(sourcePosition), samples.length - 1);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const weight = sourcePosition - leftIndex;
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    output[outputIndex] = left + (right - left) * weight;
  }

  return output;
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

export function encodeMonoPcm16Wav(
  samples: Float32Array,
  sampleRate = AZURE_PCM_SAMPLE_RATE
) {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("Invalid PCM sample rate.");
  }

  const bytesPerSample = AZURE_PCM_BITS_PER_SAMPLE / 8;
  const dataByteLength = samples.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataByteLength);
  const dataView = new DataView(arrayBuffer);

  encodeWaveHeader(dataView, {
    sampleRate,
    byteLength: dataByteLength
  });
  writePcmSamples(dataView, 44, samples);

  return arrayBuffer;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function findWaveDataChunk(bytes: Uint8Array) {
  if (bytes.byteLength < 44) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const chunkEnd = chunkDataOffset + chunkSize;

    if (chunkEnd > bytes.byteLength) {
      return null;
    }

    if (chunkId === "data") {
      return { byteOffset: chunkDataOffset, byteLength: chunkSize };
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  return null;
}

export function inspectPcmWav(input: ArrayBuffer | Uint8Array): PcmWavFormat | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength < 44 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) {
    return null;
  }

  let offset = 12;
  let audioFormat: number | null = null;
  let channels: number | null = null;
  let sampleRate: number | null = null;
  let byteRate: number | null = null;
  let blockAlign: number | null = null;
  let bitsPerSample: number | null = null;
  let dataByteLength: number | null = null;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const chunkEnd = chunkDataOffset + chunkSize;

    if (chunkEnd > bytes.byteLength) {
      return null;
    }

    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      byteRate = view.getUint32(chunkDataOffset + 8, true);
      blockAlign = view.getUint16(chunkDataOffset + 12, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataByteLength = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (
    audioFormat === null ||
    channels === null ||
    sampleRate === null ||
    byteRate === null ||
    blockAlign === null ||
    bitsPerSample === null ||
    dataByteLength === null ||
    dataByteLength <= 0 ||
    dataByteLength % 2 !== 0
  ) {
    return null;
  }

  return {
    audioFormat,
    channels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    dataByteLength
  };
}

export function isAzureCompatiblePcmWav(input: ArrayBuffer | Uint8Array) {
  const format = inspectPcmWav(input);

  return Boolean(
    format &&
    format.audioFormat === 1 &&
    format.channels === AZURE_PCM_CHANNELS &&
    format.sampleRate === AZURE_PCM_SAMPLE_RATE &&
    format.byteRate === AZURE_PCM_SAMPLE_RATE * AZURE_PCM_CHANNELS * (AZURE_PCM_BITS_PER_SAMPLE / 8) &&
    format.blockAlign === AZURE_PCM_CHANNELS * (AZURE_PCM_BITS_PER_SAMPLE / 8) &&
    format.bitsPerSample === AZURE_PCM_BITS_PER_SAMPLE
  );
}

export function analyzePcm16WavSignal(
  input: ArrayBuffer | Uint8Array
): PcmSignalAnalysis | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (!isAzureCompatiblePcmWav(bytes)) {
    return null;
  }

  const dataChunk = findWaveDataChunk(bytes);
  if (!dataChunk || dataChunk.byteLength <= 0 || dataChunk.byteLength % 2 !== 0) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = dataChunk.byteLength / 2;
  let peakSample = 0;
  let squaredSum = 0;
  let nearZeroSamples = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(dataChunk.byteOffset + index * 2, true);
    const magnitude = Math.abs(sample);
    peakSample = Math.max(peakSample, magnitude);
    squaredSum += sample * sample;
    if (magnitude <= DIGITAL_SILENCE_SAMPLE_MAGNITUDE) {
      nearZeroSamples += 1;
    }
  }

  const peakAbsoluteAmplitude = peakSample / 0x8000;
  const rmsAmplitude = Math.sqrt(squaredSum / sampleCount) / 0x8000;
  const nearZeroRatio = nearZeroSamples / sampleCount;
  const classification =
    peakSample <= DIGITAL_SILENCE_SAMPLE_MAGNITUDE &&
    rmsAmplitude <= DIGITAL_SILENCE_MAX_RMS &&
    nearZeroRatio >= DIGITAL_SILENCE_MIN_NEAR_ZERO_RATIO
      ? "DIGITAL_SILENCE"
      : peakAbsoluteAmplitude < LOW_SIGNAL_MAX_PEAK ||
          rmsAmplitude < LOW_SIGNAL_MAX_RMS
        ? "LOW_SIGNAL"
        : "SIGNAL_PRESENT";

  return {
    classification,
    peakAbsoluteAmplitude,
    rmsAmplitude,
    nearZeroRatio
  };
}

export function isBrowserPcmWavFile(file: File) {
  const normalizedType = file.type.trim().toLowerCase();
  return normalizedType === "audio/wav" || normalizedType === "audio/wave" || normalizedType === "audio/x-wav" || file.name.toLowerCase().endsWith(".wav");
}

export async function normalizeBrowserAudioFileToPcmWav(file: File) {
  const sourceBytes = await file.arrayBuffer();

  if (isAzureCompatiblePcmWav(sourceBytes)) {
    return new File([sourceBytes], `${getBaseFilename(file.name)}.wav`, {
      type: "audio/wav",
      lastModified: file.lastModified || Date.now()
    });
  }

  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    throw new Error("Azure evaluation 用に wav/PCM へ変換できませんでした。このブラウザでは音声 decode に対応していないため、wav ファイルを選ぶか mock に戻して継続してください。");
  }

  const audioContext = new AudioContextConstructor();

  try {
    const decoded = await audioContext.decodeAudioData(sourceBytes.slice(0));
    const monoSamples = mixToMono(decoded);
    const resampled = resampleMonoPcm(monoSamples, decoded.sampleRate);
    const wavBytes = encodeMonoPcm16Wav(resampled);

    if (!isAzureCompatiblePcmWav(wavBytes)) {
      throw new Error("Invalid normalized PCM WAV.");
    }

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
