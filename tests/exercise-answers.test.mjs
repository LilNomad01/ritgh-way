import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/exercise-answers.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { assessAnswer, exerciseTypes, isChoice, isSpeaking } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("dictation ignores case, spacing and punctuation", () => {
  assert.equal(assessAnswer("  could I have water please! ", "Could I have water, please?").status, "correct");
});
test("unambiguous contractions and teacher-approved alternatives are accepted", () => {
  assert.equal(assessAnswer("I’m from Brazil", "I am from Brazil.").status, "correct");
  assert.equal(assessAnswer("She doesn't like coffee", "She does not like coffee.").status, "correct");
  assert.equal(assessAnswer("Can I have water?", "Could I have water?", ["Can I have water?"]).status, "correct");
});
test("negation and extra words never receive full credit", () => {
  assert.notEqual(assessAnswer("I do not like tea", "I do like tea").status, "correct");
  assert.notEqual(assessAnswer("I like tea now", "I like tea").status, "correct");
});
test("almost is feedback only, with aligned missing words", () => {
  const result = assessAnswer("Could I have water please", "Could I have a glass of water please");
  assert.equal(result.status, "wrong");
  const close = assessAnswer("Could I have a water please", "Could I have a glass of water please");
  assert.equal(close.status, "almost");
  assert.deepEqual(close.words.filter(word => !word.matched).map(word => word.text), ["glass", "of"]);
});
test("empty, unrelated and reordered answers are not correct", () => {
  for (const answer of ["", "banana", "you meet to nice"]) assert.notEqual(assessAnswer(answer, "Nice to meet you").status, "correct");
});
test("speaking formats are explicit without changing legacy choice exercises", () => {
  assert.equal(exerciseTypes.speaking, "Speaking");
  assert.equal(exerciseTypes.choice_speaking, "Objetiva + Speaking");
  assert.equal(isSpeaking("speaking"), true);
  assert.equal(isSpeaking("choice_speaking"), true);
  assert.equal(isSpeaking("choice"), false);
  assert.equal(isChoice("choice_speaking"), true);
  assert.equal(isChoice("choice"), true);
});
test("teacher-approved semantic variants remain valid for speaking transcription", () => {
  const result = assessAnswer("Could I get a coffee, please?", "Could I have a coffee, please?", ["Could I get a coffee, please?"]);
  assert.equal(result.status, "correct");
  assert.equal(result.expected, "Could I get a coffee, please?");
});

test("speaking feedback compares recognized and expected words", () => {
  const componentSource = readFileSync(new URL("../app/components/SpeakingFeedback.tsx", import.meta.url), "utf8");
  assert.match(componentSource, /<AnswerComparison answer=\{evaluation\.transcription\} correct=\{targetText\}/);
  const expected = assessAnswer("nice to meet iu", "nice to meet you");
  const recognized = assessAnswer(expected.expected, "nice to meet iu");
  assert.deepEqual(expected.words.filter(word => word.matched).map(word => word.text), ["nice", "to", "meet"]);
  assert.deepEqual(expected.words.filter(word => !word.matched).map(word => word.text), ["you"]);
  assert.deepEqual(recognized.words.filter(word => !word.matched).map(word => word.text), ["iu"]);
});
