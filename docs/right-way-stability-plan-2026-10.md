# Right Way — estabilidade, progresso e speaking

Data: 2026-10-23

## Objetivo

Corrigir autenticação, progressão acadêmica, reprodução obrigatória de vídeo, carregamentos repetidos e apresentação da aula. Ativar os formatos de speaking já existentes sem exibir métricas fictícias.

## Decisões aprovadas

- O teste de nivelamento define o módulo inicial do aluno.
- O módulo inicial começa em 0%.
- Módulos anteriores ficam disponíveis para revisão, mas não contam como concluídos.
- Nenhuma aula pode ser concluída automaticamente por estar sem conteúdo.
- O progresso incorreto da conta do Felipe pode ser corrigido após backup verificável.
- O layout atual da Jornada deve ser preservado.
- A primeira reprodução do vídeo não permite avanço. Depois da conclusão, avanço e retrocesso ficam liberados.

## Diagnóstico confirmado

### Autenticação

- Produção retorna `Supabase: JWT issued at future` no login.
- O erro ocorre antes da emissão do token próprio do aplicativo.
- O ambiente de produção usa `SUPABASE_SECRET_KEY`; a chave implantada deve ser substituída por uma chave atual `sb_secret_...`.
- Banco principal é Supabase PostgreSQL. Arquivos ficam em Supabase Storage.

### Progresso

- Consultas de progresso filtram corretamente por `user_id`.
- `computeAcademicState` considera vídeo inexistente como concluído.
- A mesma função considera zero exercícios como exercícios concluídos.
- A combinação marca aulas vazias como concluídas para qualquer aluno.
- O teste atual registra esse comportamento incorreto como esperado.
- Existem nove aulas publicadas; somente parte delas possui vídeo e exercícios completos.
- A conta do Felipe possui um registro legado de progresso que precisa de correção controlada.

### Interface e desempenho

- Cada rota monta `RightWayApp` novamente e consulta a sessão novamente.
- A biblioteca, a jornada e o painel fazem consultas independentes para dados relacionados.
- Existe um perfil demonstrativo dentro do fluxo autenticado.
- A API de detalhe da aula não retorna `position`; a interface mostra `AULA undefined`.
- A função de rótulo troca nomes de arquivo por `Vídeo N`, removendo informação útil.

### Vídeo

- O navegador permite buscar qualquer posição antes da conclusão.
- A API aceita posição e `ended` enviados pelo cliente sem validar reprodução contínua.
- Um cliente alterado consegue marcar o vídeo como concluído sem assistir.

### Speaking

- Os tipos `speaking` e `choice_speaking` já existem.
- Gravação, envio, transcrição, avaliação semântica e vínculo com a tentativa já existem.
- Produção não possui as variáveis necessárias para chamar o provedor de fala.
- Transcrição permite avaliar conteúdo, vocabulário e gramática.
- Transcrição isolada não permite pontuar pronúncia acústica com confiança.

## Implementação

### 1. Login e sessão

- Substituir a chave antiga de produção por `sb_secret_...`.
- Manter tokens próprios, cookies HTTP-only e renovação existentes.
- Nunca enviar detalhes internos do Supabase para o usuário final.
- Manter o erro técnico apenas nos logs do servidor.
- Validar login, renovação, logout e troca obrigatória de senha.

### 2. Regra de senha

- Exigir no mínimo 10 caracteres.
- Não exigir maiúscula, minúscula, número e símbolo simultaneamente.
- Criar uma única função compartilhada entre API, cadastro, troca de senha e painel administrativo.
- Atualizar textos, placeholders, atributos HTML e validações duplicadas.
- Preservar PBKDF2, salt individual e invalidação de sessões após troca administrativa.

### 3. Trilha por nivelamento

- Mapear o nível do aluno para o primeiro módulo compatível.
- Tratar esse módulo como início acadêmico, sempre com 0% para conta nova.
- Deixar módulos anteriores acessíveis em modo de revisão.
- Excluir módulos anteriores do percentual obrigatório da trilha personalizada.
- Não criar tentativas ou conclusões artificiais para representar dispensa.

### 4. Disponibilidade de conteúdo

- Considerar pronta somente aula com pelo menos um vídeo e um exercício publicado.
- Aula incompleta aparece como `Em preparação` e não entra no denominador de progresso.
- Aula incompleta não desbloqueia a seguinte e não pode ser marcada como concluída.
- Painel administrativo deve indicar o conteúdo faltante antes da publicação.
- Aulas existentes não serão excluídas automaticamente.

### 5. Correção dos dados do Felipe

1. Exportar os registros atuais da conta nas tabelas de progresso para backup.
2. Registrar contagens e chaves antes da alteração.
3. Remover somente o registro comprovadamente incorreto de progresso legado.
4. Recalcular a resposta da API sem gravar conclusões substitutas.
5. Confirmar que a conta inicia no módulo determinado pelo nivelamento com 0%.

Rollback: restaurar exatamente o registro exportado, com as mesmas chaves e datas.

### 6. Sessão e carregamento

- Mover estado de sessão para um shell persistente no layout autenticado.
- Remover `demoProfile` do fluxo autenticado.
- Compartilhar resultado de conteúdo e dashboard durante a navegação.
- Preservar dados anteriores durante revalidação e usar indicadores locais.
- Evitar tela cheia de carregamento em mudanças internas de rota.
- Manter `no-store` para dados privados, sem cache compartilhado entre usuários.

### 7. Reprodução obrigatória

- Guardar a maior posição assistida continuamente.
- Impedir busca acima dessa posição enquanto o vídeo não estiver concluído.
- Permitir retrocesso durante a primeira reprodução.
- No servidor, limitar avanço pela posição anterior e tempo transcorrido.
- Ignorar `ended` quando a posição validada não chegou ao final.
- Marcar o item como concluído somente após reprodução contínua até o fim.
- Exigir conclusão de todos os vídeos da aula.
- Depois da conclusão, liberar busca total e revisão.

### 8. Interface da aula

- Retornar `position` na API de detalhe.
- Exibir número da aula corretamente.
- Usar título administrativo do vídeo; usar nome do arquivo apenas como fallback.
- Ocultar playlist quando existir apenas um vídeo.
- Para vários vídeos, usar lista compacta com estado e duração.
- Mostrar `Em preparação` quando faltar vídeo ou prática.
- Preservar acessibilidade dos controles e mensagens de erro.

### 9. Speaking

- Configurar as variáveis do provedor já suportado.
- Manter confirmação da gravação antes do envio.
- Manter limite de tamanho, duração, tipo e frequência.
- Ativar `speaking` e `choice_speaking` em produção.
- Comparar transcrição reconhecida e frase esperada por palavra.
- Exibir trechos corretos em verde, ausentes ou divergentes em vermelho.
- Exibir conteúdo, vocabulário e gramática separadamente.
- Não exibir nota de pronúncia ou fluência enquanto não houver provedor acústico.

### 10. Testes

- Fazer `npm test` executar todos os arquivos `tests/*.test.mjs`.
- Trocar o teste que considera aula vazia concluída.
- Adicionar testes para:
  - conta nova com 0%;
  - módulo inicial pelo nivelamento;
  - isolamento entre usuários;
  - aula incompleta em preparação;
  - múltiplos vídeos;
  - bloqueio de avanço;
  - liberação após conclusão;
  - política de senha compartilhada;
  - speaking e objetiva + speaking.
- Executar build e testes completos antes do deploy.
- Diagnosticar separadamente o lint, que atualmente não termina em tempo razoável.

## Ordem de entrega

1. Testes regressivos e regra acadêmica.
2. Login e política de senha.
3. Shell persistente e cache privado da sessão.
4. Vídeo e interface da aula.
5. Speaking operacional.
6. Backup e correção do Felipe.
7. Verificação local, commit, deploy e teste de produção.

## Critérios de aceite

- Login funciona em produção sem erro interno exposto.
- Conta nova mostra 0% e nenhuma conclusão anterior.
- Nivelamento abre o módulo correto.
- Dois usuários nunca compartilham progresso.
- Aula incompleta não gera percentual.
- `AULA undefined` e rótulos genéricos desaparecem.
- Avanço do vídeo fica bloqueado até a primeira conclusão válida.
- Repetição posterior permite busca total.
- Navegação interna não mostra tela cheia de sessão a cada rota.
- Speaking registra áudio, transcrição e feedback real quando configurado.
- Build e todos os testes passam.

## Fora do escopo

- Migração para Supabase Auth.
- Exclusão automática de aulas incompletas.
- Pontuação acústica de pronúncia sem provedor especializado.
- Remoção de índices somente porque ainda aparecem como não utilizados.
