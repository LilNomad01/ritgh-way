import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadClientData() {
  const source = readFileSync('app/lib/client-data.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
}

test('private client data deduplicates concurrent reads and clears between sessions', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    requests += 1;
    assert.equal(url, '/api/content');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    return Response.json({ modules: [{ id: requests }] });
  };
  try {
    const { loadCourseData, clearPrivateClientCache } = await loadClientData();
    const [first, second] = await Promise.all([loadCourseData(), loadCourseData()]);
    assert.equal(requests, 1);
    assert.deepEqual(first, second);
    clearPrivateClientCache();
    const third = await loadCourseData();
    assert.equal(requests, 2);
    assert.notDeepEqual(first, third);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed reads are evicted so retry can recover', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return requests === 1 ? Response.json({ error: 'offline' }, { status: 503 }) : Response.json({ completedLessons: 0 });
  };
  try {
    const { loadDashboardData } = await loadClientData();
    await assert.rejects(loadDashboardData());
    assert.deepEqual(await loadDashboardData(), { completedLessons: 0 });
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
