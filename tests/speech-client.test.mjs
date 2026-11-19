import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
const path = 'app/lib/speech-client.ts';
const code = existsSync(path) ? ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText : '';
const { speechRequestOutcome } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('unknown server outcomes keep the same pending paid request', () => {
  assert.equal(typeof speechRequestOutcome, 'function');
  for (const status of [200, 202, 500, 502, 503, 504]) assert.equal(speechRequestOutcome(status, {}), 'pending');
  assert.equal(speechRequestOutcome(200, { attemptId: 1, result: {} }), 'completed');
});
test('only authoritative absence or rejection allows resubmission; only a failed job permits a new identity', () => {
  assert.equal(typeof speechRequestOutcome, 'function');
  assert.equal(speechRequestOutcome(409, { status: 'failed' }), 'failed');
  assert.equal(speechRequestOutcome(404, {}), 'not_found');
  for (const status of [400, 401, 403, 409, 413, 429]) assert.equal(speechRequestOutcome(status, {}), 'rejected');
});
