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
const speech = await import(moduleUrl('app/lib/speech.ts', { '"./runtime-env"': JSON.stringify(moduleUrl('app/lib/runtime-env.ts')), '"./exercise-answers"': JSON.stringify(answers), '"./speech-usage"': JSON.stringify(moduleUrl('app/lib/speech-usage.ts')) }));

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

test('a correct isolated word has correct vocabulary, no grammar grade, and no text-model call', async () => {
  const previous = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  process.env.OPENAI_API_KEY = 'test-only';
  globalThis.fetch = async () => { requests++; return Response.json({ choices: [] }); };
  try {
    const result = await speech.evaluateSpeaking('Dog!', 'dog', [], 'Como se fala cachorro em inglês?', 'test');
    assert.equal(result.intent.status, 'correct');
    assert.equal(result.vocabulary.status, 'correct');
    assert.equal(result.vocabulary.score, 100);
    assert.equal(result.grammar.available, false);
    assert.equal(result.grammar.score, null);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous;
  }
});

test('a mismatched isolated word is not proof of missing vocabulary or grammar', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await speech.evaluateSpeaking('dock', 'dog', [], 'Say dog.', 'test');
    assert.notEqual(result.intent.status, 'correct');
    assert.equal(result.vocabulary.available, false);
    assert.equal(result.vocabulary.score, null);
    assert.equal(result.grammar.available, false);
  } finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});

test('an isolated contraction is one spoken word, not a grammatical phrase', async () => {
  const result=await speech.evaluateSpeaking("I'm", "I'm", [], '', 'test');
  assert.equal(result.grammar.available,false);
});

test('empty paid transcription retains reported usage without recording its content', async () => {
  const originalFetch=globalThis.fetch, previous=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test-only';
  globalThis.fetch=async()=>Response.json({text:'',usage:{type:'duration',seconds:2}});
  try {
    await assert.rejects(speech.transcribeSpeech(new File(['wav'],'test.wav')), error=>error.message==='NO_SPEECH' && error.usage?.billedSeconds===2);
  } finally {globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
});

test('legacy contradictory feedback is repaired without changing academic intent', () => {
  assert.equal(typeof speech.normalizeSpeakingEvaluation, 'function');
  const legacy = {
    transcription: 'dog', provider: 'legacy', summary: 'Bom trabalho!',
    intent: { available: true, score: 100, status: 'correct', feedback: 'Correto.' },
    vocabulary: { available: true, score: 0, status: 'review', feedback: 'Vocabulário adequado para a situação.', used: ['dog'], difficulties: [] },
    grammar: { available: true, score: 0, status: 'review', feedback: 'Bom trabalho!' },
    pronunciation: { available: false, score: null, status: 'attention', feedback: 'Sem áudio.' },
  };
  const normalized = speech.normalizeSpeakingEvaluation(legacy, 'dog');
  assert.equal(normalized.intent.status, 'correct');
  assert.equal(normalized.vocabulary.status, 'correct');
  assert.equal(normalized.grammar.available, false);
  assert.equal(normalized.pronunciation.available, false);
});

test('acoustic claims need audio evidence and high confidence, never a numerical phoneme score', () => {
  assert.equal(typeof speech.parseAcousticEvaluation, 'function');
  const sample = { heard: 'dog', pronunciation: 'correct', clarity: 'correct', fluency: 'correct', confidence: 0.95, evidence: 'A consoante final está audível.', tip: 'Continue praticando.' };
  const result = speech.parseAcousticEvaluation(sample, 'nice to meet you', 4.5);
  assert.equal(result.pronunciation.available, true);
  assert.equal(result.pronunciation.score, null);
  assert.equal(result.fluency.available, true);
  const short=speech.parseAcousticEvaluation(sample,'dog',1.5);
  assert.equal(short.pronunciation.available,false);
  assert.equal(short.fluency.available,false);
  for (const invalid of [{ ...sample, confidence: 0.3 }, { ...sample, evidence: '' }, { ...sample, pronunciation: 'perfect' }]) {
    const guarded = speech.parseAcousticEvaluation(invalid, 'dog', 1.5);
    assert.equal(guarded.pronunciation.available, false);
    assert.equal(guarded.pronunciation.score, null);
  }
});

test('invalid or contradictory semantic JSON falls back without accepting the answer', async () => {
  const previous = process.env.OPENAI_API_KEY, originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-only';
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ intent_status: 'correct', intent_score: -500 }) } }] });
  try {
    const result = await speech.evaluateSpeaking('I hate tea', 'I enjoy tea', [], 'Say you like tea', 'test');
    assert.notEqual(result.intent.status, 'correct');
    assert.equal(result.grammar.available, false);
  } finally { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});
