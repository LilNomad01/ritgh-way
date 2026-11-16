import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(path, replacements = {}) {
  let source = readFileSync(path, 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
}
const answers = moduleUrl('app/lib/exercise-answers.ts');
const speech = await import(moduleUrl('app/lib/speech.ts', { '"./runtime-env"': JSON.stringify(moduleUrl('app/lib/runtime-env.ts')), '"./exercise-answers"': JSON.stringify(answers) }));

test('fallback never marks a reversed or negated message correct from word overlap', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    for (const text of ['I do not like tea', 'you meet to nice']) {
      const result = await speech.evaluateSpeaking(text, text.startsWith('I') ? 'I do like tea' : 'nice to meet you', [], '', 'test');
      assert.notEqual(result.intent.status, 'correct');
    }
  } finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});

test('choice speaking validates the selected variant, not the base exercise answer', () => {
  const question = { type: 'choice_speaking', options: ['Good evening', 'Good morning'], correct: 'Good morning', accepted: [], prompt: 'An evening greeting' };
  assert.deepEqual(speech.speakingTarget(question, 'Good evening'), { target: 'Good evening', accepted: [] });
  assert.throws(() => speech.speakingTarget(question, 'Injected target'), /INVALID_SPEAKING_TARGET/);
});

test('provider errors distinguish missing configuration, invalid credentials and quota', async () => {
  const previous = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(speech.transcribeSpeech(new File(['audio'], 'test.webm')), /SPEECH_NOT_CONFIGURED/);
    process.env.OPENAI_API_KEY = 'test-only';
    for (const [status, code] of [[401, 'SPEECH_AUTH_FAILED'], [429, 'SPEECH_LIMIT_REACHED']]) {
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(speech.transcribeSpeech(new File(['audio'], 'test.webm')), new RegExp(code));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});
