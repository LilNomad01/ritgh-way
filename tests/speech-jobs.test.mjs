import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
const path = 'app/lib/speech-contracts.ts';
const encode = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const contracts = existsSync(path) ? await import(encode(readFileSync(path, 'utf8'))) : {};

test('replayed requests must bind the owner, exercise, session, recording and selected target', () => {
  assert.equal(typeof contracts.matchesSpeechRequest, 'function');
  const context = { user_id: 1, exercise_id: 2, practice_session_id: 3, audio_hash: 'abc', target_text: 'dog' };
  assert.equal(contracts.matchesSpeechRequest(context, { ...context }), true);
  for (const field of Object.keys(context)) assert.equal(contracts.matchesSpeechRequest(context, { ...context, [field]: 'other' }), false);
});

test('manual reference never plays a different objective option or rotated target', () => {
  assert.equal(typeof contracts.referenceMatchesTarget, 'function');
  assert.equal(contracts.referenceMatchesTarget('dog', ' Dog! '), true);
  assert.equal(contracts.referenceMatchesTarget('dog', 'dock'), false);
  assert.equal(contracts.referenceMatchesTarget('Good morning', 'Good evening'), false);
  assert.equal(contracts.referenceMatchesTarget('', 'dog'), false);
  assert.equal(contracts.referenceMatchesTarget("I'm fine", 'I am fine'), false);
  assert.equal(contracts.referenceMatchesTarget('dog', 'cat'), false);
  assert.equal(contracts.referenceMatchesTarget('1.5', '15'), false);
  assert.equal(contracts.referenceMatchesTarget('well-being', 'wellbeing'), false);
});

test('uploaded reference stays bound to its text after an exercise answer is edited', () => {
  assert.equal(typeof contracts.referenceTextHash, 'function');
  const hash=contracts.referenceTextHash('Dog!');
  assert.equal(hash,contracts.referenceTextHash('dog'));
  assert.notEqual(hash,contracts.referenceTextHash('cat'));
  assert.notEqual(contracts.referenceTextHash("I'm fine"),contracts.referenceTextHash('I am fine'));
});

test('orphaned requests expire only after the function runtime and a safety margin', () => {
  assert.equal(typeof contracts.speechRequestExpired,'function');
  assert.equal(contracts.speechRequestExpired('2026-11-18T12:00:00Z',Date.parse('2026-11-18T12:01:59Z')),false);
  assert.equal(contracts.speechRequestExpired('2026-11-18T12:00:00Z',Date.parse('2026-11-18T12:02:01Z')),true);
});
