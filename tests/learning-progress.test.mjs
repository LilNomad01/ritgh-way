import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  function prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return sqlite.prepare(sql).run(...args); } }; }
  return { sqlite, d1: { prepare, batch: statements => Promise.all(statements.map(statement => statement.all())) } };
}
async function load(path, d1) {
  const source = readFileSync(path, 'utf8').replace(/import \{ getD1 \} from [^;]+;/, 'const getD1 = () => globalThis.__testD1;');
  globalThis.__testD1 = d1;
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
}
test('all migrations apply; legacy video and progress survive adding a second video', async () => {
  const { sqlite, d1 } = database();
  sqlite.exec(`INSERT INTO course_modules (id,title,level,position) VALUES(1,'Foundation','Básico',1);
    INSERT INTO course_sections (id,module_id,title,position) VALUES(1,1,'Greetings',1);
    INSERT INTO lessons(id,section_id,title,video_key,position) VALUES(1,1,'Meeting people','lessons/1/original',1);
    INSERT INTO lesson_exercises(lesson_id,title,prompt,correct_answer) VALUES(1,'Greeting','Say hello','Hello');
    INSERT INTO video_progress(user_id,lesson_id,position_seconds,duration_seconds,progress_percent,status,updated_at) VALUES(7,1,120,120,100,'completed','2026-09-12T12:00:00Z');`);
  const { importLegacyVideo, lessonVideos } = await load('app/lib/lesson-videos.ts', d1);
  await importLegacyVideo(1); await importLegacyVideo(1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM lesson_videos').get().count, 1);
  let videos = await lessonVideos(1,7);
  assert.equal(videos[0].completed,1);
  assert.equal(videos[0].savedPosition,120);
  sqlite.exec("INSERT INTO lesson_videos(lesson_id,video_key,title,position) VALUES(1,'lessons/1/second','Conversation',1)");
  const { computeAcademicState } = await load('app/lib/academic.ts', d1);
  let state = (await computeAcademicState(7)).lessonStates[0];
  assert.equal(state.videoStatus,'watching');
  assert.equal(state.videoPercent,50);
  assert.equal(state.completed,false);
  assert.equal((await computeAcademicState(8)).lessonStates[0].videoStatus,'not_started');
  sqlite.exec("INSERT INTO video_item_progress(user_id,video_id,position_seconds,duration_seconds,completed,updated_at) VALUES(7,2,60,60,1,'2026-09-12T12:02:00Z')");
  state = (await computeAcademicState(7)).lessonStates[0];
  assert.equal(state.videoStatus,'completed');
  assert.equal(state.completed,false, 'Video alone must not complete lesson');
  sqlite.exec("INSERT INTO exercise_attempts(user_id,lesson_id,lesson_slug,score,total,created_at) VALUES(7,1,'practice',1,1,'2026-09-12T12:03:00Z')");
  assert.equal((await computeAcademicState(7)).lessonStates[0].completed,true);
  sqlite.close();
});
