# Conteúdo de demonstração — "Speaking na Prática"

Scripts para criar um módulo de apresentação focado em Speaking. Rode no
**SQL Editor do Supabase**, na ordem abaixo.

| Arquivo | O que faz |
| --- | --- |
| `demo-speaking.sql` | Cria o módulo "Speaking na Prática": 3 seções, 5 aulas e 25 exercícios (20 com Speaking). Fica no fim da Jornada. Rodar de novo não duplica nada. |
| `demo-speaking-account.sql` | Prepara uma conta de apresentação: começa no módulo de demonstração e com os vídeos das aulas já marcados como assistidos. Troque o e-mail no topo do arquivo. |
| `demo-speaking-remove.sql` | Apaga o módulo e tudo que depende dele. |

## Passo a passo

1. Rode `demo-speaking.sql`.
2. No painel admin, envie um vídeo para cada uma das 5 aulas. Uma aula sem vídeo
   fica bloqueada, porque o app exige vídeo e exercícios. Um vídeo curto basta.
3. Crie no app uma conta só para a apresentação e rode
   `demo-speaking-account.sql` com o e-mail dela.

## Aulas

- **Primeiras conversas:** Apresentando-se com confiança · Small talk sem travar
- **Situações do dia a dia:** Pedindo no café · Pedindo informações na rua
- **Viagem:** Check-in no hotel

Para alunos reais, o módulo aparece bloqueado no fim da Jornada, porque o nível
"Speaking" não corresponde ao nível de nenhum aluno.
