import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
const path = 'app/lib/speech-contracts.ts';
const encode = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const answers = encode(readFileSync('app/lib/exercise-answers.ts', 'utf8'));
const module = existsSync(path) ? await import(encode(readFileSync(path, 'utf8').replace('"./exercise-answers"', JSON.stringify(answers)))) : {};

test('replayed requests must bind the owner, exercise, session, recording and selected target', () => {
  assert.equal(typeof module.matchesSpeechRequest, 'function');
  const context = { user_id: 1, exercise_id: 2, practice_session_id: 3, audio_hash: 'abc', target_text: 'dog' };
  assert.equal(module.matchesSpeechRequest(context, { ...context }), true);
  for (const field of Object.keys(context)) assert.equal(module.matchesSpeechRequest(context, { ...context, [field]: 'other' }), false);
});

test('manual reference never plays a different objective option or rotated target', () => {
  assert.equal(typeof module.referenceMatchesTarget, 'function');
  assert.equal(module.referenceMatchesTarget('dog', ' Dog! '), true);
  assert.equal(module.referenceMatchesTarget('dog', 'dock'), false);
  assert.equal(module.referenceMatchesTarget('Good morning', 'Good evening'), false);
  assert.equal(module.referenceMatchesTarget('', 'dog'), false);
  assert.equal(module.referenceMatchesTarget("I'm fine", 'I am fine'), false);
  assert.equal(module.referenceMatchesTarget('dog', 'cat'), false);
  assert.equal(module.referenceMatchesTarget('1.5', '15'), false);
  assert.equal(module.referenceMatchesTarget('well-being', 'wellbeing'), false);
});

test('uploaded reference stays bound to its text after an exercise answer is edited', () => {
  assert.equal(typeof module.referenceTextHash, 'function');
  const hash=module.referenceTextHash('Dog!');
  assert.equal(hash,module.referenceTextHash('dog'));
  assert.notEqual(hash,module.referenceTextHash('cat'));
  assert.notEqual(module.referenceTextHash("I'm fine"),module.referenceTextHash('I am fine'));
});

test('orphaned requests expire only after the function runtime and a safety margin', () => {
  assert.equal(typeof module.speechRequestExpired,'function');
  assert.equal(module.speechRequestExpired('2026-11-18T12:00:00Z',Date.parse('2026-11-18T12:01:59Z')),false);
  assert.equal(module.speechRequestExpired('2026-11-18T12:00:00Z',Date.parse('2026-11-18T12:02:01Z')),true);
});
