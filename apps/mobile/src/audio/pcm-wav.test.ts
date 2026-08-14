import { describe, expect, it } from "vitest";
import {
  AZURE_PCM_BITS_PER_SAMPLE,
  AZURE_PCM_CHANNELS,
  AZURE_PCM_SAMPLE_RATE,
  analyzePcm16WavSignal,
  encodeMonoPcm16Wav,
  inspectPcmWav,
  isAzureCompatiblePcmWav,
  resampleMonoPcm
} from "../../../../lib/browser-pcm-wav";

describe("mobile PCM WAV normalization primitives", () => {
  it("resamples linearly to the fixed Azure input rate", () => {
    const source = new Float32Array(48_000);
    source[0] = 1;
    source[source.length - 1] = -1;

    const resampled = resampleMonoPcm(source, 48_000);

    expect(resampled).toHaveLength(16_000);
    expect(resampled[0]).toBe(1);
    expect(resampled[resampled.length - 1]).toBeLessThanOrEqual(0);
  });

  it("encodes RIFF PCM format 1, mono, 16-bit, 16kHz with a bounded data chunk", () => {
    const bytes = encodeMonoPcm16Wav(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const format = inspectPcmWav(bytes);

    expect(format).toEqual({
      audioFormat: 1,
      channels: AZURE_PCM_CHANNELS,
      sampleRate: AZURE_PCM_SAMPLE_RATE,
      byteRate: 32_000,
      blockAlign: 2,
      bitsPerSample: AZURE_PCM_BITS_PER_SAMPLE,
      dataByteLength: 10
    });
    expect(isAzureCompatiblePcmWav(bytes)).toBe(true);
    expect(new DataView(bytes).getInt16(44, true)).toBe(0);
    expect(new DataView(bytes).getInt16(50, true)).toBe(32_767);
    expect(new DataView(bytes).getInt16(52, true)).toBe(-32_768);
  });

  it("rejects malformed, empty, stereo, or non-16k WAV input", () => {
    expect(inspectPcmWav(new Uint8Array([1, 2, 3]))).toBeNull();

    const empty = encodeMonoPcm16Wav(new Float32Array());
    expect(inspectPcmWav(empty)).toBeNull();

    const wrongRate = encodeMonoPcm16Wav(new Float32Array([0.2]), 48_000);
    expect(isAzureCompatiblePcmWav(wrongRate)).toBe(false);

    const stereo = encodeMonoPcm16Wav(new Float32Array([0.2]));
    new DataView(stereo).setUint16(22, 2, true);
    expect(isAzureCompatiblePcmWav(stereo)).toBe(false);

    const invalidByteRate = encodeMonoPcm16Wav(new Float32Array([0.2]));
    new DataView(invalidByteRate).setUint32(28, 48_000, true);
    expect(isAzureCompatiblePcmWav(invalidByteRate)).toBe(false);

    const truncated = encodeMonoPcm16Wav(new Float32Array([0.2]));
    expect(inspectPcmWav(new Uint8Array(truncated, 0, truncated.byteLength - 1))).toBeNull();
  });

  it("classifies all-zero and near-digital-silence PCM as a hard failure", () => {
    const allZero = encodeMonoPcm16Wav(new Float32Array(16_000));
    const nearDigitalSilenceSamples = new Float32Array(16_000);
    nearDigitalSilenceSamples.fill(1 / 0x8000);
    const nearDigitalSilence = encodeMonoPcm16Wav(nearDigitalSilenceSamples);

    expect(analyzePcm16WavSignal(allZero)?.classification).toBe("DIGITAL_SILENCE");
    expect(analyzePcm16WavSignal(nearDigitalSilence)?.classification).toBe("DIGITAL_SILENCE");
  });

  it("keeps quiet nonzero PCM as a warning instead of rejecting it", () => {
    const samples = Float32Array.from(
      { length: 16_000 },
      (_value, index) => index % 2 === 0 ? 0.002 : -0.002
    );

    expect(analyzePcm16WavSignal(encodeMonoPcm16Wav(samples))?.classification).toBe("LOW_SIGNAL");
  });

  it("classifies ordinary speech-like nonzero PCM as signal present", () => {
    const samples = Float32Array.from(
      { length: 16_000 },
      (_value, index) => Math.sin(index / 12) * 0.12
    );
    const analysis = analyzePcm16WavSignal(encodeMonoPcm16Wav(samples));

    expect(analysis?.classification).toBe("SIGNAL_PRESENT");
    expect(analysis?.peakAbsoluteAmplitude).toBeGreaterThan(0.1);
    expect(analysis?.rmsAmplitude).toBeGreaterThan(0.05);
  });
});
