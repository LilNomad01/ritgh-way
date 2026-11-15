# Jornada Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar Jornada compacta e acessível com a versão atual em um preview Vercel.
**Architecture:** Reutilizar os dados e callbacks atuais; adaptar somente a leitura de ambiente ao runtime Node. Aproveitar seletor e acordeões do PR #3 sem merge.
**Tech Stack:** Next.js, React, TypeScript, CSS, Supabase existente, Vercel preview.
**Spec:** docs/superpowers/specs/2026-11-14-jornada-vercel-design.md

## Global Constraints
- Não publicar no Sites nem alterar banco, autenticação ou regras acadêmicas.
- Validar 320, 375, 390, 430 px e desktop; sem texto cortado ou overflow da página.
- Dados reais; estados bloqueados e em preparação não navegáveis.
- Nenhum segredo em código, Git ou logs; nenhum merge do PR #3.

## Review Focus
- Selecionar módulo bloqueado permite inspeção, nunca acesso às aulas.
- Curso vazio ou em preparação não pode ser anunciado como concluído.
- Próximo passo de prática, vídeo, revisão e prova mantém o href do backend.
- Média ausente é traço, não número fictício; progresso do CTA não muda ao inspecionar outro módulo.
- Conteúdo fechado não recebe foco; teclado e reduced motion funcionam.

### Task 1: Compatibilidade Vercel
**Files:** app/lib/runtime-env.ts; db/supabase.ts; app/lib/auth.ts; app/lib/speech.ts; package.json; tsconfig.json; vercel.json; tests/runtime-env.test.mjs.
**Interfaces:** runtimeEnv usa process.env no servidor; funções públicas permanecem iguais.
- [ ] Criar teste de leitura de variável apenas no runtime e observar falha.
- [ ] Trocar imports ativos Cloudflare por runtimeEnv; usar scripts Next padrão e manter scripts legados separados.
- [ ] Excluir fontes geradas/legadas inativas do TypeScript; verificar build Next e suíte.

### Task 2: Jornada
**Files:** app/components/JourneyView.tsx; app/journey-redesign.css; app/layout.tsx; tests/journey-view.test.mjs.
**Interfaces:** CourseData, onContinue e onOpenExam permanecem iguais; regras vêm de academic.
- [ ] Escrever testes de renderização de estados vazios, bloqueados, preparação e próximo passo; observar falhas.
- [ ] Reutilizar PR com apply_patch, corrigir texto literal, quatro métricas, CTA, progresso mobile, contraste e acordeões acessíveis.
- [ ] Validar interação e ausência de overflow com fixtures somente em memória; não criar rota demo ou dados reais.

### Task 3: Validação e preview
**Files:** somente configuração Vercel se necessária.
- [ ] Executar testes, TypeScript, lint e build; registrar falhas sem escondê-las.
- [ ] Revisar diff completo e confirmar ausência de alterações nas regras e dados.
- [ ] Confirmar projeto right-way-online-app, equipe lilnomad01s-projects e variáveis do preview.
- [ ] Publicar branch de teste, verificar deploy e rotas, entregar URL e limites. Não fazer merge nem promover produção.

## Validation checkpoint — 2026-11-15
- Clean temporary installation from the unchanged lockfile: Next production build and TypeScript passed; 36 tests passed.
- Targeted ESLint passed with zero errors and three existing AdminPanel warnings (unused declarations and image optimization).
- Browser checked at 320, 375, 390, 430 and 1440 px without document overflow. Lesson, practice and exam resume destinations, module selection, collapsed state, empty course, zero progress and dark theme were checked using isolated in-memory fixtures.
- Next exposed an existing AdminPanel typing error. Lesson editing now passes only its editable fields, rather than derived boolean readiness flags; the API's accepted fields are unchanged.
- Existing workspace dependencies are damaged (`node_modules/next/package.json` is empty); validation ran in `/tmp` without replacing them.
- Vercel preview environment is empty. Supabase server secret remains unavailable; authenticated end-to-end verification and a functional preview remain pending.
