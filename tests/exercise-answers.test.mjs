import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/exercise-answers.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { assessAnswer } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

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
