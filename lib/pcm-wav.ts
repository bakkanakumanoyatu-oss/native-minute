export const MOBILE_PCM_SAMPLE_RATE = 16_000;
export const MOBILE_PCM_CHANNELS = 1;
export const MOBILE_PCM_BITS_PER_SAMPLE = 16;
export const MOBILE_PCM_BYTES_PER_SECOND =
  MOBILE_PCM_SAMPLE_RATE * MOBILE_PCM_CHANNELS * (MOBILE_PCM_BITS_PER_SAMPLE / 8);
export const MOBILE_RECORDING_MAX_SECONDS = 120;

export type MobilePcmWavMetadata = Readonly<{
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataByteLength: number;
  durationSeconds: number;
}>;

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function parseMobilePcmWav(bytes: Uint8Array): MobilePcmWavMetadata | null {
  if (
    bytes.byteLength < 44 ||
    readAscii(bytes, 0, 4) !== "RIFF" ||
    readAscii(bytes, 8, 4) !== "WAVE"
  ) {
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

    const paddedChunkEnd = chunkEnd + (chunkSize % 2);
    if (paddedChunkEnd > bytes.byteLength) {
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

    offset = paddedChunkEnd;
  }

  if (
    audioFormat !== 1 ||
    channels !== MOBILE_PCM_CHANNELS ||
    sampleRate !== MOBILE_PCM_SAMPLE_RATE ||
    byteRate !== MOBILE_PCM_BYTES_PER_SECOND ||
    blockAlign !== MOBILE_PCM_CHANNELS * (MOBILE_PCM_BITS_PER_SAMPLE / 8) ||
    bitsPerSample !== MOBILE_PCM_BITS_PER_SAMPLE ||
    dataByteLength === null ||
    dataByteLength <= 0 ||
    dataByteLength % blockAlign !== 0 ||
    dataByteLength / MOBILE_PCM_BYTES_PER_SECOND > MOBILE_RECORDING_MAX_SECONDS
  ) {
    return null;
  }

  return {
    channels,
    sampleRate,
    bitsPerSample,
    dataByteLength,
    durationSeconds: Math.max(
      1,
      Math.round(dataByteLength / MOBILE_PCM_BYTES_PER_SECOND)
    )
  };
}
