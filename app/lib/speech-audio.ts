export type AudioFacts = { durationSeconds: number; sampleRate: number; channels: number; rms: number; clippingRatio: number };

export function recordingDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration < 0.7) throw new Error("INVALID_DURATION");
  return Math.min(60, duration);
}

/** Validate actual PCM data, never the duration claimed by the browser. */
export function inspectWav(bytes: Uint8Array): AudioFacts {
  const invalid = () => { throw new Error("INVALID_AUDIO"); };
  if (bytes.length < 44 || bytes.length > 6 * 1024 * 1024) return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || view.getUint32(4, true) !== bytes.length - 8) return invalid();
  let sampleRate = 0, channels = 0, dataOffset = 0, dataLength = 0, formatSeen = false;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return invalid();
    const length = view.getUint32(offset + 4, true), start = offset + 8;
    if (length > bytes.length - start) return invalid();
    if (tag(offset) === "fmt ") {
      if (formatSeen || length < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) return invalid();
      channels = view.getUint16(start + 2, true); sampleRate = view.getUint32(start + 4, true);
      if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 48000 || view.getUint16(start + 12, true) !== channels * 2 || view.getUint32(start + 8, true) !== sampleRate * channels * 2) return invalid();
      formatSeen = true;
    } else if (tag(offset) === "data") {
      if (dataOffset || !length) return invalid();
      dataOffset = start; dataLength = length;
    }
    offset = start + length + (length % 2);
    if (offset > bytes.length) return invalid();
  }
  if (!formatSeen || !dataOffset || dataLength % (channels * 2)) return invalid();
  const durationSeconds = dataLength / (sampleRate * channels * 2);
  if (durationSeconds < 0.7 || durationSeconds > 60.1) throw new Error("INVALID_DURATION");
  let energy = 0, clipped = 0;
  for (let i = dataOffset; i < dataOffset + dataLength; i += 2) {
    const sample = view.getInt16(i, true) / 32768;
    energy += sample * sample;
    if (Math.abs(sample) >= 0.999) clipped++;
  }
  const samples = dataLength / 2, rms = Math.sqrt(energy / samples);
  if (rms < 0.002) throw new Error("SILENT_AUDIO");
  return { durationSeconds, sampleRate, channels, rms, clippingRatio: clipped / samples };
}

export function encodePcmWav(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000 || samples.length > sampleRate * 61) throw new Error("INVALID_AUDIO");
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => { const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0; view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); });
  return bytes;
}
