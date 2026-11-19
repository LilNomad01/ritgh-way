import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
function compile(source, fileName) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(`import * as React from '${reactUrl}';\n${source}`, { fileName, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText).toString('base64')}`;
}
const iconUrl = compile(readFileSync('app/components/MaterialIcon.tsx', 'utf8'), 'icon.tsx');
const source = readFileSync('app/components/StudentDashboard.tsx', 'utf8')
  .replace(/import styles from "[^\"]+\.module\.css";/, 'const styles = { achievements: "achievements" };')
  .replace('from "react"', `from '${reactUrl}'`)
  .replace('import { useRouter } from "next/navigation";', 'const useRouter = () => ({ push() {} });')
  .replace('from "./MaterialIcon"', `from '${iconUrl}'`)
  .replace(/import \{[^;]+\} from "\.\.\/lib\/client-data";/, 'const getCachedDashboardData = () => globalThis.__dashboardFixture; const loadDashboardData = async () => globalThis.__dashboardFixture;');
const { StudentDashboard } = await import(compile(source, 'dashboard.tsx'));
function render(view) {
  globalThis.__dashboardFixture = {
    completedLessons: 0, totalLessons: 0, practiceAttempts: 7, accuracy: 23, examAttempts: 0, examAverage: null,
    modules: [
      { id: 1, title: 'Start speaking', level: 'Básico', state: { unlocked: true, completed: false, reviewOnly: true, completedSections: 0, sectionCount: 2, percent: 43 } },
      { id: 3, title: 'Fluent thinking', level: 'Avançado', state: { unlocked: true, completed: false, reviewOnly: false, completedSections: 0, sectionCount: 1, percent: 0 } },
    ],
    resume: { title: 'Nuance & persuasion', description: 'Esta aula está em preparação.', moduleId: 3, moduleTitle: 'Fluent thinking', sectionTitle: 'Nuance', kind: 'pending', started: false, total: 0, position: 0, href: '/aulas' },
  };
  return renderToStaticMarkup(React.createElement(StudentDashboard, { view }));
}
test('dashboard focuses the placed module, not a lower review-only module', () => {
  const html = render();
  assert.match(html, /SEU FOCO AGORA[\s\S]*?<strong>Fluent thinking<\/strong>/);
  assert.doesNotMatch(html, /0 de 0 aulas|0 \/ 0/);
  assert.match(html, /Conteúdo em preparação/);
  assert.match(html, /Ver aulas disponíveis/);
  assert.match(html, /Disponível para revisão/);
});
test('achievements shows recorded activity without duplicating the homepage', () => {
  const html = render('achievements');
  assert.match(html, /Seu progresso até aqui/);
  assert.match(html, /RESPOSTAS ENVIADAS/);
  assert.doesNotMatch(html, /SEU PRÓXIMO PASSO|SEU FOCO AGORA|dashboard-hero|medalhas|XP/);
});
