import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadPracticeRotation() {
  const source = readFileSync('app/lib/practice-rotation.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
}

test('refreshes pending questions from published exercises and keeps answered questions', async () => {
  const { refreshPracticePlan } = await loadPracticeRotation();
  const oldAnswered = { id: 1, type: 'choice', category: 'old', title: 'Answered', prompt: 'old', options: [], correct: 'yes', accepted: [], explanation: '', skills: [], variantKey: -1 };
  const oldPending = { ...oldAnswered, id: 2, title: 'Unpublished pending' };
  const livePending = { ...oldAnswered, id: 3, title: 'Published listening', type: 'listening_transcription' };
  const result = refreshPracticePlan([oldAnswered, oldPending], [livePending], 1);
  assert.deepEqual(result.map((item) => item.id), [1, 3]);
});

test('drops unpublished pending items even when replacement leaves the same total', async () => {
  const { refreshPracticePlan } = await loadPracticeRotation();
  const old = { id: 10, type: 'choice', category: 'old', title: 'Old', prompt: 'old', options: [], correct: 'yes', accepted: [], explanation: '', skills: [], variantKey: -1 };
  const fresh = { ...old, id: 11, type: 'choice_listening', title: 'Published listening' };
  const result = refreshPracticePlan([old], [fresh], 0);
  assert.deepEqual(result.map((item) => item.id), [11]);
});
