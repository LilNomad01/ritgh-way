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

test('practice read failures stay errors instead of becoming an empty practice library', async () => {
  const originalFetch=globalThis.fetch;
  try {
    const {readJson}=await loadClientData();
    assert.equal(typeof readJson,'function');
    globalThis.fetch=async()=>Response.json({error:'Conclua o vídeo da aula para liberar esta prática.'},{status:403});
    await assert.rejects(readJson('/api/practices/2'),/Conclua o vídeo/);
    globalThis.fetch=async()=>new Response('<html>offline</html>',{status:503});
    await assert.rejects(readJson('/api/practices'),/503/);
    globalThis.fetch=async()=>new Response('<html>wrong response</html>');
    await assert.rejects(readJson('/api/practices'),/resposta inválida/i);
  } finally {globalThis.fetch=originalFetch;}
});

test('expired access refreshes once for concurrent private reads and retries both', async () => {
  const originalFetch = globalThis.fetch;
  let authenticated = false;
  let refreshes = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.credentials, 'same-origin');
    if (url === '/api/auth/refresh') {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 5));
      authenticated = true;
      return Response.json({ ok: true });
    }
    if (!authenticated) return Response.json({ error: 'expired' }, { status: 401 });
    return Response.json(url === '/api/content' ? { modules: [] } : { completedLessons: 0 });
  };
  try {
    const client = await loadClientData();
    const [course, dashboard] = await Promise.all([client.loadCourseData(), client.loadDashboardData()]);
    assert.deepEqual(course, { modules: [] });
    assert.deepEqual(dashboard, { completedLessons: 0 });
    assert.equal(refreshes, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('invalid refresh clears the cached profile and signals login without a retry loop', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const browser = new EventTarget();
  let expired = 0;
  browser.addEventListener('rightway:session-expired', () => expired++);
  globalThis.window = browser;
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    return url === '/api/auth/session'
      ? Response.json({ profile: { fullName: 'Student', email: 'student@example.test' } })
      : Response.json({ error: 'expired' }, { status: 401 });
  };
  try {
    const client = await loadClientData();
    await client.loadSessionProfile();
    await assert.rejects(client.loadDashboardData(), /sessão expirou/i);
    assert.equal(client.getCachedSessionProfile(), null);
    assert.equal(client.getCachedDashboardData(), null);
    assert.equal(expired, 1);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('a retried request cannot refresh forever and keeps the original request body', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body });
    return Response.json({}, { status: url === '/api/auth/refresh' ? 200 : 401 });
  };
  try {
    const { authenticatedFetch } = await loadClientData();
    assert.equal(typeof authenticatedFetch, 'function');
    await assert.rejects(authenticatedFetch('/api/practices/1/session', { method: 'POST', body: '{"action":"progress"}' }), /sessão expirou/i);
    assert.deepEqual(requests, [
      { url: '/api/practices/1/session', method: 'POST', body: '{"action":"progress"}' },
      { url: '/api/auth/refresh', method: 'POST', body: undefined },
      { url: '/api/practices/1/session', method: 'POST', body: '{"action":"progress"}' },
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test('a temporary refresh failure permits retry without erasing the signed-in profile', async () => {
  const originalFetch = globalThis.fetch;
  let available = false;
  globalThis.fetch = async url => {
    if (url === '/api/auth/session') return Response.json({ profile: { fullName: 'Student' } });
    if (url === '/api/auth/refresh') return Response.json({}, { status: available ? 200 : 503 });
    return Response.json({ completedLessons: 0 }, { status: available ? 200 : 401 });
  };
  try {
    const client = await loadClientData();
    await client.loadSessionProfile();
    await assert.rejects(client.loadDashboardData(), /renovar/i);
    assert.equal(client.getCachedSessionProfile().profile.fullName, 'Student');
    available = true;
    assert.deepEqual(await client.loadDashboardData(), { completedLessons: 0 });
  } finally { globalThis.fetch = originalFetch; }
});

test('an old in-flight response cannot restore private data after logout', async () => {
  const originalFetch = globalThis.fetch;
  let respond;
  globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
  try {
    const client = await loadClientData();
    const pending = client.loadDashboardData();
    client.clearPrivateClientCache();
    respond(Response.json({ completedLessons: 9 }));
    await assert.rejects(pending);
    assert.equal(client.getCachedDashboardData(), null);
  } finally { globalThis.fetch = originalFetch; }
});

test('a new anonymous visitor is not reported as an expired signed-in session', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const browser = new EventTarget();
  let expired = 0;
  browser.addEventListener('rightway:session-expired', () => expired++);
  globalThis.window = browser;
  globalThis.fetch = async () => Response.json({}, { status: 401 });
  try {
    const client = await loadClientData();
    await assert.rejects(client.loadSessionProfile());
    assert.equal(expired, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('a late 401 reuses the completed refresh instead of rotating credentials again', async () => {
  const originalFetch = globalThis.fetch;
  let authenticated = false;
  let refreshes = 0;
  let respondLate;
  globalThis.fetch = async url => {
    if (url === '/api/auth/refresh') {
      authenticated = true;
      refreshes++;
      return Response.json({ ok: true });
    }
    if (!authenticated && url === '/api/content') return new Promise(resolve => { respondLate = resolve; });
    if (!authenticated) return Response.json({}, { status: 401 });
    return Response.json({ ready: true });
  };
  try {
    const client = await loadClientData();
    const late = client.loadCourseData();
    await client.loadDashboardData();
    respondLate(Response.json({}, { status: 401 }));
    assert.deepEqual(await late, { ready: true });
    assert.equal(refreshes, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('forbidden operations are not refreshed or replayed', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}, { status: 403 }); };
  try {
    const { authenticatedFetch } = await loadClientData();
    const response = await authenticatedFetch('/api/admin', { method: 'DELETE' });
    assert.equal(response.status, 403);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
