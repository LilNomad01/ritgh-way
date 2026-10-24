import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadTypeScript(path) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
}

const now = '2026-10-24T12:00:05.000Z';

test('accepts continuous playback progress', async () => {
  const { validateVideoProgress } = await loadTypeScript('app/lib/video-progress.ts');
  const result = validateVideoProgress({ positionSeconds: 5, durationSeconds: 100, completed: false, updatedAt: '2026-10-24T12:00:00.000Z' }, { positionSeconds: 10, durationSeconds: 100 }, now);
  assert.equal(result.positionSeconds, 10);
  assert.equal(result.status, 'watching');
});

test('caps a forged forward jump', async () => {
  const { validateVideoProgress } = await loadTypeScript('app/lib/video-progress.ts');
  const result = validateVideoProgress({ positionSeconds: 5, durationSeconds: 100, completed: false, updatedAt: '2026-10-24T12:00:00.000Z' }, { positionSeconds: 55, durationSeconds: 100 }, now);
  assert.equal(result.positionSeconds, 13);
  assert.equal(result.completed, false);
});

test('does not complete a video from an initial forged ended event', async () => {
  const { validateVideoProgress } = await loadTypeScript('app/lib/video-progress.ts');
  const result = validateVideoProgress(null, { positionSeconds: 100, durationSeconds: 100, ended: true }, now);
  assert.equal(result.positionSeconds, 8);
  assert.equal(result.completed, false);
});

test('completes after continuous playback reaches the end', async () => {
  const { validateVideoProgress } = await loadTypeScript('app/lib/video-progress.ts');
  const result = validateVideoProgress({ positionSeconds: 95, durationSeconds: 100, completed: false, updatedAt: '2026-10-24T12:00:00.000Z' }, { positionSeconds: 100, durationSeconds: 100, ended: true }, now);
  assert.equal(result.positionSeconds, 100);
  assert.equal(result.percentage, 100);
  assert.equal(result.completed, true);
});

test('allows seeking after the video is completed', async () => {
  const { validateVideoProgress } = await loadTypeScript('app/lib/video-progress.ts');
  const result = validateVideoProgress({ positionSeconds: 100, durationSeconds: 100, completed: true, updatedAt: now }, { positionSeconds: 40, durationSeconds: 100 }, now);
  assert.equal(result.positionSeconds, 40);
  assert.equal(result.completed, true);
});
