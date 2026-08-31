import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path, encoding = "utf8") {
  return readFile(new URL(path, root), encoding);
}

function pngSize(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("defines an Android-installable web app manifest", async () => {
  const manifest = await source("app/manifest.ts");
  assert.match(manifest, /id:\s*"\/"/);
  assert.match(manifest, /start_url:\s*"\/"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /app-icon-192\.png/);
  assert.match(manifest, /sizes:\s*"192x192"/);
  assert.match(manifest, /app-icon-512\.png/);
  assert.match(manifest, /sizes:\s*"512x512"/);
  assert.match(manifest, /purpose:\s*"maskable"/);
});

test("registers a service worker with offline and safe runtime caching", async () => {
  const [support, worker, offline] = await Promise.all([
    source("app/components/PwaSupport.tsx"),
    source("public/sw.js"),
    source("public/offline.html"),
  ]);
  assert.match(support, /beforeinstallprompt/);
  assert.match(support, /appinstalled/);
  assert.match(support, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(worker, /OFFLINE_URL\s*=\s*"\/offline\.html"/);
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(offline, /Você está sem conexão/);
});

test("ships Android and Apple icons at their declared sizes", async () => {
  const [android192, android512, apple180] = await Promise.all([
    source("public/app-icon-192.png", null),
    source("public/app-icon-512.png", null),
    source("public/apple-touch-icon.png", null),
  ]);
  assert.deepEqual(pngSize(android192), { width: 192, height: 192 });
  assert.deepEqual(pngSize(android512), { width: 512, height: 512 });
  assert.deepEqual(pngSize(apple180), { width: 180, height: 180 });
});

test("loads heavy application areas on demand", async () => {
  const page = await source("app/page.tsx");
  for (const component of ["AdminPanel", "ExercisePlayer", "JourneyView", "LessonsLibrary", "PracticeHub", "SectionExam"]) {
    assert.match(page, new RegExp(`const ${component} = dynamic`));
  }
});

test("creates real login accounts for admin-managed students", async () => {
  const [adminRoute, panel] = await Promise.all([
    source("app/api/admin/route.ts"),
    source("app/components/AdminPanel.tsx"),
  ]);
  assert.match(adminRoute, /INSERT INTO user_accounts/);
  assert.match(adminRoute, /action === "resetStudentPassword"/);
  assert.match(adminRoute, /UPDATE auth_sessions SET revoked_at/);
  assert.match(panel, /Redefinir senha/);
  assert.match(panel, /Troca pendente/);
});

test("versions password hashes and forces first-access password replacement", async () => {
  const [auth, page] = await Promise.all([
    source("app/lib/auth.ts"),
    source("app/page.tsx"),
  ]);
  assert.match(auth, /PASSWORD_SCHEME = "pbkdf2-sha256"/);
  assert.match(auth, /`\$\{PASSWORD_SCHEME\}\$\$\{PASSWORD_ITERATIONS\}\$\$\{hash\}`/);
  assert.match(auth, /parts\.length === 3/);
  assert.match(page, /required=\{Boolean\(profile\.mustChangePassword\)\}/);
});

test("keeps schema maintenance out of request hot paths", async () => {
  const [auth, admin] = await Promise.all([
    source("app/lib/auth.ts"),
    source("app/api/admin/route.ts"),
  ]);
  assert.doesNotMatch(auth, /CREATE TABLE|PRAGMA table_info|ALTER TABLE/);
  assert.doesNotMatch(admin, /CREATE TABLE|PRAGMA table_info|ALTER TABLE/);
  assert.match(auth, /return getD1\(\)/);
  assert.match(admin, /const db = getD1\(\)/);
});
