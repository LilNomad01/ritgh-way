import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('server runtime reads environment values without a Cloudflare binding', async () => {
  const source = readFileSync('app/lib/runtime-env.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { runtimeEnv } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  process.env.RIGHT_WAY_RUNTIME_TEST = 'server-only-value';
  try { assert.equal(runtimeEnv.RIGHT_WAY_RUNTIME_TEST, 'server-only-value'); }
  finally { delete process.env.RIGHT_WAY_RUNTIME_TEST; }
});
