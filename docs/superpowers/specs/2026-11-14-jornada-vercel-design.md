# Jornada e ambiente de teste Vercel

## Objetivo e escopo aprovado
Atualizar a versão atual (25ff707) no ambiente de teste Vercel e redesenhar /jornada conforme o pedido do proprietário de 13/11/2026. Não publicar no Sites, não alterar registros, regras acadêmicas, notas, autenticação ou desbloqueios.

## Abordagens
1. Mesclar PR #3 inteiro: rejeitada porque a interface ainda possui cortes de texto, progresso escondido no celular e expansão sem transição.
2. Reutilizar seletor de módulos e estrutura de matérias do PR, corrigindo apresentação, acessibilidade e estados: escolhida, preservando getNextLearningStep e os callbacks existentes.
3. Reescrever toda a aplicação: fora do escopo.

## Design
Título e subtítulo literais do pedido. Estatísticas compactas com dados reais. Um único próximo passo com CTA Continuar aprendendo. Seleção de um módulo por vez; cartões horizontais no desktop e trilho no celular. Matérias em acordeão acessível; aulas e provas claramente distintas. Nenhum acesso liberado pela interface quando o backend informa bloqueio ou preparação. Progresso visível em todas as larguras. Cores #071B43, #1749A0 e #D5162D; transições de 220 ms e redução de movimento.

## Runtime e segurança
Usar Next.js padrão no Vercel e process.env apenas no servidor. Não transferir segredos para arquivos, Git, navegador ou logs. Arquivos legados D1 permanecem inativos. Testes com fixtures não podem criar alunos ou progresso real. Vercel preview é a única publicação autorizada nesta etapa.

## Reversão
Nenhuma migração de dados. Branch separada, PR #3 não mesclado. Reverter a seleção do preview ou usar o commit anterior; manter Sites intocado. Variáveis do preview separadas de produção. Se faltarem segredos ou houver limite da plataforma, registrar o bloqueio sem afirmar deploy funcional.
