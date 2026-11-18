import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

async function load(path) {
  if (!existsSync(path)) return {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const audio = await load('app/lib/speech-audio.ts');
const costs = await load('app/lib/speech-usage.ts');

function wav(amplitude = 0.25) {
  const bytes = new Uint8Array(32044);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 32036, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, 32000, true);
  for (let i = 0; i < 16000; i++) view.setInt16(44 + i * 2, Math.round(amplitude * 32767 * Math.sin(2 * Math.PI * i / 40)), true);
  return bytes;
}

test('WAV duration and signal energy come from actual PCM samples', () => {
  assert.equal(typeof audio.inspectWav, 'function');
  const facts = audio.inspectWav(wav());
  assert.equal(facts.durationSeconds, 1);
  assert.equal(facts.sampleRate, 16000);
  assert.equal(facts.channels, 1);
  assert.ok(facts.rms > 0.17 && facts.rms < 0.18);
  assert.equal(facts.clippingRatio, 0);
});

test('silence and unusably low volume are rejected before paid analysis', () => {
  assert.equal(typeof audio.inspectWav, 'function');
  assert.throws(() => audio.inspectWav(wav(0)), /SILENT_AUDIO/);
  assert.throws(() => audio.inspectWav(wav(0.00001)), /SILENT_AUDIO/);
});

test('forged headers, truncated chunks and non-PCM data cannot claim a valid duration', () => {
  assert.equal(typeof audio.inspectWav, 'function');
  const invalid = wav();
  new DataView(invalid.buffer).setUint32(40, 40000, true);
  assert.throws(() => audio.inspectWav(invalid), /INVALID_AUDIO/);
  assert.throws(() => audio.inspectWav(wav().subarray(0, 50)), /INVALID_AUDIO/);
  const compressed = wav(); new DataView(compressed.buffer).setUint16(20, 3, true);
  assert.throws(() => audio.inspectWav(compressed), /INVALID_AUDIO/);
});

test('PCM encoder emits a standard mono WAV with bounded sample values', () => {
  assert.equal(typeof audio.encodePcmWav, 'function');
  const bytes = audio.encodePcmWav(new Float32Array([0, 0.5, -0.5, 2, -2]), 24000);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIFF');
  assert.equal(bytes.length, 54);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getInt16(46, true), 16384);
  assert.equal(view.getInt16(50, true), 32767);
  assert.equal(view.getInt16(52, true), -32768);
});

test('automatic stop trims timer drift instead of discarding the whole recording', () => {
  assert.equal(audio.recordingDuration(60.25),60);
  assert.equal(audio.recordingDuration(1.5),1.5);
  assert.throws(()=>audio.recordingDuration(NaN),/INVALID_DURATION/);
});

test('cost estimates use reported duration and separately priced audio tokens', () => {
  assert.equal(typeof costs.estimateUsageCost, 'function');
  assert.ok(Math.abs(costs.estimateUsageCost('gpt-transcribe', { billedSeconds: 2 }) - 0.00015) < 1e-10);
  assert.ok(Math.abs(costs.estimateUsageCost('gpt-audio-1.5', { inputTokens: 1100, inputAudioTokens: 100, outputTokens: 100 }) - 0.0067) < 1e-10);
  assert.ok(Math.abs(costs.estimateUsageCost('gpt-6-luna', { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 100 }) - 0.000132) < 1e-10);
});

test('unknown rates or missing usage never become invented zero-cost attempts', () => {
  assert.equal(typeof costs.estimateUsageCost, 'function');
  assert.equal(costs.estimateUsageCost('unknown-model', { inputTokens: 100, outputTokens: 100 }), null);
  assert.equal(costs.estimateUsageCost('gpt-audio-1.5', {}), null);
});
