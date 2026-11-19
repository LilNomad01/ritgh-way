import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,readFileSync } from 'node:fs';
import ts from 'typescript';
const file='app/lib/practice-history.ts';
const history=existsSync(file)?await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64')}`):{};

test('best practice result keeps its own denominator and compares percentages, not raw points',()=>{
  assert.equal(typeof history.practiceHistory,'function');
  const result=history.practiceHistory([{lessonId:1,score:2,total:5},{lessonId:1,score:8,total:10},{lessonId:1,score:2,total:2}],1,'greetings');
  assert.deepEqual(result,{attemptsCount:3,lastScore:2,lastTotal:5,bestScore:2,bestTotal:2});
});
test('matching titles never import another lesson history; legacy slug-only records still work',()=>{
  assert.equal(typeof history.practiceHistory,'function');
  const result=history.practiceHistory([{lessonId:99,lessonSlug:'greetings',score:10,total:10},{lessonId:null,lessonSlug:'greetings-practice',score:1,total:2},{lessonId:1,score:1,total:3}],1,'greetings');
  assert.deepEqual(result,{attemptsCount:2,lastScore:1,lastTotal:2,bestScore:1,bestTotal:2});
});
