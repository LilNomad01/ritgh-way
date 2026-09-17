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
  const helper = ts.transpileModule(readFileSync('app/lib/learning-progress.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helperUrl = `data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`;
  const source = readFileSync(path, 'utf8').replace(/import \{ getD1 \} from [^;]+;/, 'const getD1 = () => globalThis.__testD1;').replace('"./learning-progress"', `"${helperUrl}"`);
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

test('finalized lesson, mastery, section barrier, retries and next step stay consistent after recomputation', async () => {
  const { sqlite, d1 } = database();
  sqlite.exec(`INSERT INTO course_modules(id,title,level,position) VALUES(1,'Foundation','Básico',1);
    INSERT INTO course_sections(id,module_id,title,position) VALUES(1,1,'Greetings',1),(2,1,'Conversation',2);
    INSERT INTO lessons(id,section_id,title,video_key,position) VALUES(1,1,'Lesson 1','video/1',1),(2,1,'Lesson without video',NULL,2),(3,2,'Lesson 3','video/3',1);
    INSERT INTO lesson_exercises(lesson_id,title,prompt,correct_answer,skills_json) VALUES(1,'Greetings','Say hello','Hello','["greetings"]');
    INSERT INTO section_exams(id,section_id,title,status,pass_score) VALUES(1,1,'Exam 1','Publicado',70),(2,2,'Exam 2','Publicado',80);
    INSERT INTO section_exam_questions(exam_id,prompt,correct_answer,status) VALUES(1,'Say hello','Hello','Publicado'),(2,'Say bye','Goodbye','Publicado');`);
  const { computeAcademicState, getNextLearningStep } = await load('app/lib/academic.ts', d1);
  let state = await computeAcademicState(7);
  assert.equal(getNextLearningStep(state).href, '/aulas/1');
  assert.equal(state.lessonStates[2].unlocked, false, 'direct URL to next section must remain locked');
  sqlite.exec(`INSERT INTO video_progress(user_id,lesson_id,position_seconds,duration_seconds,progress_percent,status,updated_at) VALUES(7,1,60,60,100,'completed','2026-09-12T12:00:00Z');`);
  state = await computeAcademicState(7);
  assert.equal(getNextLearningStep(state).href, '/praticar/1/sessao');
  sqlite.prepare('INSERT INTO exercise_attempts(user_id,lesson_id,lesson_slug,score,total,answers_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(7,1,'lesson-1-practice',6,10,JSON.stringify({results:[{tags:['polite_requests'],correct:false},{tags:['greetings'],correct:true}]}),'2026-09-12T12:01:00Z');
  state = await computeAcademicState(7);
  assert.equal(state.lessonStates[0].completed,true);
  assert.equal(state.lessonStates[0].lastPercentage,60);
  assert.equal(state.lessonStates[0].reviewRecommended,true);
  assert.equal(state.lessonStates[0].weakSkills[0].skill,'polite_requests');
  assert.equal(state.lessonStates[1].completed,true, 'lesson without video and exercises should not block progression');
  assert.equal(getNextLearningStep(state).href,'/prova/1');
  assert.equal(state.sectionStates[1].unlocked,false);
  sqlite.prepare('INSERT INTO exercise_attempts(user_id,lesson_id,lesson_slug,score,total,answers_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(7,1,'lesson-1-practice',9,10,'[]','2026-09-12T12:01:30Z');
  state = await computeAcademicState(7);
  assert.equal(state.lessonStates[0].masteryReached,true);
  assert.equal(state.lessonStates[0].bestPercentage,90);
  assert.equal(getNextLearningStep(state).href,'/prova/1');
  sqlite.prepare('INSERT INTO section_exam_attempts(user_id,exam_id,score,total,percentage,passed,answers_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(7,1,13,20,65,0,JSON.stringify({results:[{tags:['polite_requests'],correct:false},{tags:['greetings'],correct:true}]}),'2026-09-12T12:02:00Z');
  state = await computeAcademicState(7);
  assert.equal(getNextLearningStep(state).kind,'review');
  assert.equal(state.sectionStates[1].unlocked,false);
  assert.equal(state.sectionStates[0].weakSkills[0].skill,'polite_requests');
  sqlite.prepare('INSERT INTO section_exam_attempts(user_id,exam_id,score,total,percentage,passed,answers_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(7,1,17,20,85,1,'[]','2026-09-12T12:03:00Z');
  state = await computeAcademicState(7);
  assert.equal(state.sectionStates[0].completed,true);
  assert.equal(state.sectionStates[1].unlocked,true);
  assert.equal(getNextLearningStep(state).href,'/aulas/3');
  assert.equal(getNextLearningStep(await computeAcademicState(7)).href,'/aulas/3', 'state survives a fresh request');
  sqlite.exec(`INSERT INTO video_progress(user_id,lesson_id,position_seconds,duration_seconds,progress_percent,status,updated_at) VALUES(7,3,60,60,100,'completed','2026-09-12T12:04:00Z');
    INSERT INTO section_exam_attempts(user_id,exam_id,score,total,percentage,passed,answers_json,created_at) VALUES(7,2,9,10,90,1,'[]','2026-09-12T12:05:00Z');`);
  state = await computeAcademicState(7);
  assert.equal(getNextLearningStep(state).kind,'complete');
  sqlite.close();
});

test('skill aggregation reads new attempts safely and exam retries rotate question order', async () => {
  const { parseAnswerResults, getWeakSkills, rotateExamQuestions, MASTERY_THRESHOLD } = await load('app/lib/learning-progress.ts');
  assert.equal(MASTERY_THRESHOLD,80);
  assert.deepEqual(parseAnswerResults('["legacy answer"]'),[]);
  const summary = getWeakSkills(parseAnswerResults(JSON.stringify({results:[
    {tags:['could_i','restaurant'],correct:false},
    {tags:['could_i'],correct:true},
    {tags:['greetings'],correct:true},
  ]})));
  assert.deepEqual(summary.map(item => [item.skill,item.percentage]),[['restaurant',0],['could_i',50],['greetings',100]]);
  const questions = [1,2,3].map(id => ({id,options:['A','B','C']}));
  const first = rotateExamQuestions(questions,7,1,0);
  const second = rotateExamQuestions(questions,7,1,1);
  assert.notEqual(first[0].id,second[0].id);
  assert.deepEqual(new Set(first.map(item => item.id)),new Set(second.map(item => item.id)));
});
