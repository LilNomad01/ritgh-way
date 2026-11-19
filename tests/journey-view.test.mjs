import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function compile(source, fileName = 'source.ts') {
  const code = ts.transpileModule(source, { fileName, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const courseUrl = compile(readFileSync('app/lib/course.ts', 'utf8'));
const progressUrl = compile(readFileSync('app/lib/learning-progress.ts', 'utf8'));
const iconUrl = compile(`import * as React from '${pathToFileURL(require.resolve('react')).href}';\n` + readFileSync('app/components/MaterialIcon.tsx', 'utf8'), 'icon.tsx');
const source = readFileSync('app/components/JourneyView.tsx', 'utf8')
  .replace(/from "react"/g, `from '${pathToFileURL(require.resolve('react')).href}'`)
  .replace(/import \{ useRouter \} from "next\/navigation";/, 'const useRouter = () => ({ push() {} });')
  .replace(/from "\.\.\/lib\/course"/g, `from '${courseUrl}'`)
  .replace(/from "\.\.\/lib\/learning-progress"/g, `from '${progressUrl}'`)
  .replace(/from "\.\/MaterialIcon"/g, `from '${iconUrl}'`)
  .replace(/import \{[^;]+\} from "\.\.\/lib\/client-data";/, 'const getCachedCourseData = () => globalThis.__journeyFixture; const loadCourseData = async () => globalThis.__journeyFixture;');
const { JourneyView } = await import(compile(`import * as React from '${pathToFileURL(require.resolve('react')).href}';\n${source}`, 'journey.tsx'));
function render(data) {
  globalThis.__journeyFixture = data;
  return renderToStaticMarkup(React.createElement(JourneyView, { onContinue() {}, onOpenExam() {} }));
}
const base = {
  modules: [{ id: 1, title: 'Start speaking', level: 'Básico', position: 1 }, { id: 2, title: 'Real conversations', level: 'Intermediário', position: 2 }],
  sections: [{ id: 1, moduleId: 1, title: 'Apresentações', position: 1 }, { id: 2, moduleId: 2, title: 'Reuniões futuras', position: 1 }],
  lessons: [{ id: 1, sectionId: 1, title: 'Nice to meet you', duration: '12 min', position: 1 }, { id: 2, sectionId: 1, title: 'Próxima aula em preparação', duration: '8 min', position: 2 }],
  academic: {
    moduleStates: [{ moduleId: 1, unlocked: true, completed: false, reviewOnly: false, completedSections: 0, sectionCount: 1, percent: 0, status: 'available' }, { moduleId: 2, unlocked: false, completed: false, percent: 0, status: 'locked' }],
    sectionStates: [{ sectionId: 1, unlocked: true, completed: false, reviewOnly: false, completedLessons: 0, lessonCount: 2, percent: 0, weakSkills: [], status: 'available', examId: 1, examUnlocked: false, examPassed: false, examTitle: 'Prova de apresentações' }],
    lessonStates: [{ lessonId: 1, sectionId: 1, ready: true, unlocked: true, completed: false, reviewOnly: false, videoStatus: 'not_started', exerciseCount: 2, exercisesCompleted: false, status: 'available' }, { lessonId: 2, sectionId: 1, ready: false, unlocked: false, completed: false, status: 'locked' }],
  },
};
test('journey starts at real zero and only shows subjects from the selected module', () => {
  const html = render(base);
  assert.match(html, /Sua jornada de inglês/);
  assert.match(html, /Evolua no seu ritmo, uma conquista de cada vez\./);
  assert.match(html, /Progresso atual/);
  assert.doesNotMatch(html, /Reuniões futuras/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /disabled=""[^>]*>[\s\S]*?Próxima aula em preparação/);
});
test('empty course is preparation, not a fabricated completion', () => {
  const html = render({ modules: [], sections: [], lessons: [], academic: { moduleStates: [], sectionStates: [], lessonStates: [] } });
  assert.match(html, /prepara|começa/i);
  assert.doesNotMatch(html, /Jornada concluída|Curso concluído|>100%/);
});
test('a subject without ready lessons shows preparation instead of a zero denominator', () => {
  const data = structuredClone(base);
  data.academic.sectionStates[0].lessonCount = 0;
  data.academic.lessonStates.forEach(lesson => { lesson.ready = false; lesson.unlocked = false; });
  const html = render(data);
  assert.match(html, /Aulas em preparação/);
  assert.doesNotMatch(html, /0 de 0 aulas/);
});
test('next practice shows the pending-practice label and accessible chapter control', () => {
  const data = structuredClone(base);
  data.academic.lessonStates[0].videoStatus = 'completed';
  const html = render(data);
  assert.match(html, /PRÁTICA PENDENTE/);
  assert.match(html, /Continuar aprendendo/);
  assert.match(html, /aria-controls="rwj-chapter-body-1"/);
});
