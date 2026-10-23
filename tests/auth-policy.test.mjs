import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadTypeScript(path, transform = source => source) {
  const source = transform(readFileSync(path, 'utf8'));
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
}

test('password policy accepts ten characters without forced character classes', async () => {
  const { passwordPolicyError } = await loadTypeScript('app/lib/password-policy.ts');
  assert.equal(passwordPolicyError('english123'), null);
  assert.equal(passwordPolicyError('short123'), 'Use pelo menos 10 caracteres.');
});

test('login hides internal infrastructure errors', async () => {
  const { POST } = await loadTypeScript('app/api/auth/login/route.ts', source => source
    .replace(/import \{[^;]+\} from "\.\.\/\.\.\/\.\.\/lib\/auth";/, `
      const assertSameOrigin = () => true;
      const hashToken = async () => '';
      const issueSession = async () => ({ cookies: [] });
      const rootAdminConfig = () => ({});
      const verifyPassword = async () => false;
    `)
    .replace(/import \{[^;]+\} from "\.\.\/\.\.\/\.\.\/\.\.\/db\/supabase";/, `
      const assertSupabase = result => result;
      const getSupabase = () => ({});
    `));
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await POST({
      headers: new Headers(),
      json: async () => { throw new Error('Supabase: JWT issued at future'); },
      url: 'https://right-way.test/api/auth/login',
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Não foi possível entrar. Tente novamente.' });
  } finally {
    console.error = originalError;
  }
});
