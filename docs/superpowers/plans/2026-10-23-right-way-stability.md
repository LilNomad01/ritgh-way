# Right Way Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir login, progresso personalizado, carregamentos, vídeo obrigatório, interface da aula e speaking real sem números fictícios.

**Architecture:** Manter o backend Next/Vinext e Supabase atuais. Extrair apenas regras puras compartilhadas, corrigir a computação acadêmica na origem e reutilizar cache privado no cliente. Aplicar mudanças externas somente depois de testes, backup e verificação local.

**Tech Stack:** Next 16, React 19, TypeScript, Vinext, Supabase PostgreSQL/Storage, Node test runner.

**Spec:** `docs/right-way-stability-plan-2026-10.md`

## Global Constraints

- O nivelamento escolhe o módulo inicial e começa em 0%.
- Módulos anteriores ficam disponíveis para revisão e fora do progresso obrigatório.
- Aula sem vídeo ou sem exercício publicado fica `Em preparação`.
- Primeira reprodução do vídeo bloqueia avanço; revisão posterior libera busca.
- Dados privados continuam `no-store` e nunca são compartilhados entre usuários.
- Senha exige 10 caracteres, sem combinação obrigatória de classes.
- Não inventar nota acústica de pronúncia.
- Não adicionar dependências.
- Fazer backup verificável antes de corrigir dados do Felipe.

## Review Focus

- Conta recém-criada de qualquer nível deve mostrar 0%, sem aproveitar progresso de outro usuário.
- Conteúdo incompleto deve ficar fora do denominador e não desbloquear conteúdo seguinte.
- Logout e novo login no mesmo navegador não podem reutilizar cache do usuário anterior.
- Vídeo não concluído deve rejeitar salto no navegador e na API, inclusive `ended` forjado.
- Falha ou ausência do provedor de speaking deve gerar mensagem clara, sem resultado fictício.

---

### Task 1: Test runner e política única de senha

**Files:**
- Create: `app/lib/password-policy.ts`
- Modify: `app/lib/auth.ts`
- Modify: `app/components/Onboarding.tsx`
- Modify: `app/components/PasswordChange.tsx`
- Modify: `app/components/AdminPanel.tsx`
- Modify: `app/api/auth/login/route.ts`
- Modify: `package.json`
- Test: `tests/auth-policy.test.mjs`

**Interfaces:**
- Produces: `passwordPolicyError(password: string): string | null` em módulo seguro para cliente e servidor.
- Produces: `npm test` executa `tests/*.test.mjs` depois do build.

- [ ] **Step 1: Escrever testes de senha e erro público de login**

O teste deve importar a função real e afirmar: `english123` é válido; `short123` é inválido. Uma falha interna `JWT issued at future` deve produzir resposta pública `Não foi possível entrar. Tente novamente.` sem copiar a mensagem técnica.

- [ ] **Step 2: Executar o teste e observar RED**

Run: `node --test tests/auth-policy.test.mjs`
Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Criar a função e trocar todos os validadores duplicados**

Atualizar placeholder, `minLength`, mensagens e botões desabilitados. Preservar PBKDF2 e invalidação de sessões. O login deve registrar o erro técnico no servidor e retornar somente mensagem pública genérica.

- [ ] **Step 4: Fazer `npm test` executar toda a suíte**

Run: `npm test`
Expected: PASS com todos os arquivos `tests/*.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/password-policy.ts app/lib/auth.ts app/components/Onboarding.tsx app/components/PasswordChange.tsx app/components/AdminPanel.tsx app/api/auth/login/route.ts package.json tests/auth-policy.test.mjs
git commit -m "fix: simplify shared password policy"
```

### Task 2: Progresso por nivelamento e conteúdo pronto

**Files:**
- Modify: `app/lib/academic.ts`
- Modify: `app/lib/course.ts`
- Modify: `app/api/content/route.ts`
- Modify: `app/api/dashboard/route.ts`
- Modify: `app/components/LessonsLibrary.tsx`
- Modify: `app/components/JourneyView.tsx`
- Modify: `app/api/admin/route.ts`
- Modify: `app/components/AdminPanel.tsx`
- Test: `tests/learning-progress.test.mjs`

**Interfaces:**
- Produces: `LessonAcademicState.ready: boolean`.
- Produces: `ModuleAcademicState.reviewOnly: boolean`.
- Consumes: nível persistido em `students.level`.

- [ ] **Step 1: Trocar o teste de aula vazia e adicionar conta nova por nível**

Testar literalmente: aula sem vídeo ou exercício não completa; aluno intermediário inicia módulo 2 em 0%; módulo 1 fica revisão; outro usuário continua em 0%.

- [ ] **Step 2: Executar testes e observar RED**

Run: `node --test tests/learning-progress.test.mjs`
Expected: FAIL na conclusão da aula vazia e no módulo inicial.

- [ ] **Step 3: Consultar nível e calcular somente aulas prontas**

Adicionar uma consulta de `students.level`. Aula pronta exige vídeo legado ou item de vídeo e pelo menos um exercício publicado. Aula não pronta recebe `ready: false`, não conclui e não entra no percentual obrigatório.

- [ ] **Step 4: Aplicar início por nível sem criar conclusão artificial**

Normalizar o nível do aluno e escolher o primeiro módulo publicado com nível correspondente; usar o primeiro módulo como fallback. Módulos anteriores recebem `reviewOnly: true` e permanecem acessíveis.

- [ ] **Step 5: Atualizar UI para `Em preparação` e progresso real**

Não exibir aulas incompletas como concluídas. Contar somente aulas prontas no dashboard.

No painel, exibir o conteúdo faltante e impedir nova publicação de aula sem vídeo e exercício. Conteúdo legado incompleto permanece visível como `Em preparação` até o administrador completar ou despublicar.

- [ ] **Step 6: Verificar**

Run: `node --test tests/learning-progress.test.mjs && npm test`
Expected: PASS, sem conclusão automática.

- [ ] **Step 7: Commit**

```bash
git add app/lib/academic.ts app/lib/course.ts app/api/content/route.ts app/api/dashboard/route.ts app/components/LessonsLibrary.tsx app/components/JourneyView.tsx app/api/admin/route.ts app/components/AdminPanel.tsx tests/learning-progress.test.mjs
git commit -m "fix: personalize real academic progress"
```

### Task 3: Sessão e cache privado de navegação

**Files:**
- Create: `app/lib/client-data.ts`
- Modify: `app/page.tsx`
- Modify: `app/components/LessonsLibrary.tsx`
- Modify: `app/components/JourneyView.tsx`
- Modify: `app/components/StudentDashboard.tsx`
- Test: `tests/client-data.test.mjs`

**Interfaces:**
- Produces: `loadSessionProfile()`, `loadCourseData()`, `loadDashboardData()` e `clearPrivateClientCache()`.
- Consumes: endpoints existentes com `credentials: "same-origin"` e `cache: "no-store"`.

- [ ] **Step 1: Escrever testes de deduplicação e limpeza por logout**

Testar duas leituras simultâneas com uma chamada real ao `fetch` fornecido; após limpeza, uma nova leitura deve chamar `fetch` novamente.

- [ ] **Step 2: Executar e observar RED**

Run: `node --test tests/client-data.test.mjs`
Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar cache de promessas privado e invalidável**

Não persistir em `localStorage`. Remover `demoProfile`. Limpar no logout e após login/cadastro.

- [ ] **Step 4: Trocar consumidores e preservar dados durante revalidação**

Evitar spinner de tela cheia quando já houver sessão em memória. Reutilizar conteúdo e dashboard entre Aulas e Jornada.

- [ ] **Step 5: Verificar**

Run: `node --test tests/client-data.test.mjs && npm test`
Expected: PASS e uma chamada por recurso durante a mesma sessão.

- [ ] **Step 6: Commit**

```bash
git add app/lib/client-data.ts app/page.tsx app/components/LessonsLibrary.tsx app/components/JourneyView.tsx app/components/StudentDashboard.tsx tests/client-data.test.mjs
git commit -m "perf: reuse private session data across routes"
```

### Task 4: Vídeo obrigatório e interface da aula

**Files:**
- Create: `app/lib/video-progress.ts`
- Modify: `app/api/lessons/[lessonId]/route.ts`
- Modify: `app/api/lessons/[lessonId]/video-progress/route.ts`
- Modify: `app/components/LessonsLibrary.tsx`
- Modify: `app/globals.css`
- Test: `tests/video-progress.test.mjs`

**Interfaces:**
- Produces: `validateVideoProgress(previous, event, now): ValidatedVideoProgress`.
- Produces: detalhe da aula com `position`.
- Consumes: `position_seconds`, `duration_seconds`, `completed`, `updated_at` existentes.

- [ ] **Step 1: Escrever testes para reprodução contínua, salto e conclusão**

Testar avanço normal de 5 segundos; salto de 50 segundos limitado; `ended` inicial não conclui; término contínuo conclui; item já concluído permite qualquer posição.

- [ ] **Step 2: Executar e observar RED**

Run: `node --test tests/video-progress.test.mjs`
Expected: FAIL porque o validador ainda não existe.

- [ ] **Step 3: Implementar validador puro e aplicar na API**

Usar posição máxima validada. Limitar cada avanço ao tempo transcorrido mais tolerância curta e teto por evento. Exigir registro anterior antes de aceitar conclusão.

- [ ] **Step 4: Bloquear busca antecipada no player**

Atualizar limite durante reprodução contínua, permitir retrocesso e restaurar limite quando o usuário tenta saltar. Liberar controles após `completed`.

- [ ] **Step 5: Corrigir apresentação**

Retornar `position`; mostrar título real; ocultar playlist única; compactar lista múltipla; remover `AULA undefined`.

- [ ] **Step 6: Verificar**

Run: `node --test tests/video-progress.test.mjs && npm test`
Expected: PASS nos cinco cenários e build completo.

- [ ] **Step 7: Commit**

```bash
git add app/lib/video-progress.ts app/api/lessons/[lessonId]/route.ts app/api/lessons/[lessonId]/video-progress/route.ts app/components/LessonsLibrary.tsx app/globals.css tests/video-progress.test.mjs
git commit -m "fix: require continuous video playback"
```

### Task 5: Speaking e comparação visual real

**Files:**
- Create: `app/components/SpeakingFeedback.tsx`
- Modify: `app/components/SpeakingRecorder.tsx`
- Modify: `app/components/AnswerComparison.tsx`
- Modify: `app/api/speaking/route.ts`
- Modify: `app/lib/speech.ts`
- Modify: `app/globals.css`
- Test: `tests/exercise-answers.test.mjs`

**Interfaces:**
- Consumes: `speaking` e `choice_speaking` existentes.
- Produces: `SpeakingFeedback({ evaluation, targetText })`, com comparação por palavra e sem nota acústica falsa.

- [ ] **Step 1: Adicionar teste de comparação falada**

Renderizar `SpeakingFeedback` com `nice to meet iu` contra `nice to meet you`: três palavras corretas, `iu` divergente e `you` esperado.

- [ ] **Step 2: Executar e observar RED**

Run: `node --test tests/exercise-answers.test.mjs`
Expected: FAIL até o resultado expor a comparação esperada.

- [ ] **Step 3: Reutilizar comparação no resultado de speaking**

Extrair o resultado para `SpeakingFeedback`. Mostrar reconhecido e esperado com cores sem chamar erro textual de erro acústico. Manter vocabulário e gramática retornados pelo servidor.

- [ ] **Step 4: Melhorar erro de configuração**

Retornar código estável e mensagem administrativa quando faltar provedor. Não expor segredo ou resposta bruta externa.

- [ ] **Step 5: Verificar**

Run: `node --test tests/exercise-answers.test.mjs && npm test`
Expected: PASS; speaking configurado usa o fluxo existente e ausência de chave não cria resultado.

- [ ] **Step 6: Commit**

```bash
git add app/components/SpeakingFeedback.tsx app/components/SpeakingRecorder.tsx app/components/AnswerComparison.tsx app/api/speaking/route.ts app/lib/speech.ts app/globals.css tests/exercise-answers.test.mjs
git commit -m "feat: clarify real speaking feedback"
```

### Task 6: Produção, dados e verificação final

**Files:**
- Modify only if needed: `.openai/hosting.json`
- Create outside Git: backup JSON in the plan workspace.

**Interfaces:**
- Consumes: código verificado das Tasks 1–5.
- Produces: backup do Felipe, dado corrigido, chave de produção atualizada e deploy testado.

- [ ] **Step 1: Consultar documentação atual, logs e advisors**

Confirmar formato `sb_secret_`, erros de login, segurança e desempenho antes da mudança externa.

- [ ] **Step 2: Exportar backup do Felipe**

Salvar no workspace ignorado as linhas de `video_progress`, `video_item_progress`, `exercise_attempts`, `practice_sessions` e provas. Registrar contagens e identificadores.

- [ ] **Step 3: Corrigir somente o registro comprovadamente incorreto**

Executar transação com alvo por `user_id` e chave do registro. Consultar novamente e confirmar 0% sem criar linhas substitutas.

- [ ] **Step 4: Atualizar segredo de produção**

Usar `sb_secret_...` sem expor o valor em logs, commits ou chat. Se a plataforma não permitir transferência segura, parar e solicitar a ação manual do proprietário.

- [ ] **Step 5: Verificação completa local**

Run: `npm test`
Expected: build concluído; todos os testes passam.

Run: `./node_modules/.bin/eslint app db tests`
Expected: exit 0. Se continuar travando, registrar diagnóstico e não afirmar lint limpo.

- [ ] **Step 6: Deploy e smoke test**

Validar login, conta nova 0%, aulas, Jornada, bloqueio de vídeo, logout/cache e mensagem de speaking na URL publicada.

- [ ] **Step 7: Commit de configuração, se existir alteração versionada**

```bash
git add .openai/hosting.json
git commit -m "chore: align production configuration"
```
