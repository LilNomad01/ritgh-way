# Supabase — Right Way Online

A migração para Vercel mantém a autenticação, as regras acadêmicas e os identificadores
da aplicação. Apenas a infraestrutura muda de Cloudflare D1/R2 para Supabase
Postgres/Storage.

## Variáveis de produção

Configure somente no servidor/Vercel:

- `DATABASE_URL` — use o transaction pooler do Supabase para runtime serverless.
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET=course-media`
- `AUTH_JWT_SECRET`
- `ROOT_ADMIN_EMAIL`
- `ROOT_ADMIN_PASSWORD_HASH`
- `ROOT_ADMIN_PASSWORD_SALT`

A aplicação também aceita `POSTGRES_URL`, `POSTGRES_PRISMA_URL`,
`NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` como aliases de
compatibilidade com integrações antigas. Nenhum segredo deve usar `NEXT_PUBLIC_`.

## Banco

`migrations/20260923_sync_right_way_d1_schema.sql` alinha o Supabase com o
schema D1 atual sem apagar tabelas, colunas ou linhas. A migração:

- cria tabelas/colunas que faltam;
- preserva as colunas antigas da primeira fundação Supabase;
- copia os valores legados para os nomes usados pelo app atual;
- mantém senhas, salts, sessões, progresso, provas, tentativas e IDs;
- cria os índices/uniques necessários aos `ON CONFLICT` existentes;
- mantém acesso REST público fechado com RLS/revokes;
- cria/garante o bucket privado `course-media`.

Ela é reexecutável. Depois de importar dados com IDs explícitos, execute-a novamente
para avançar as sequences até o maior ID importado.

## Storage

O bucket privado usa exatamente as mesmas chaves lógicas do R2 atual:

- `lessons/{lessonId}/{uuid}.mp4`
- `covers/module/{moduleId}/{desktop|mobile}/{uuid}.webp`
- `covers/section/{sectionId}/{desktop|mobile}/{uuid}.webp`
- `covers/lesson/{lessonId}/{desktop|mobile}/{uuid}.webp`
- `audio/{exerciseId}/{uuid}`

Vídeos e capas grandes usam TUS resumível com chunks de 6 MB. O navegador continua
falando somente com as rotas autenticadas da Right Way; a secret key nunca é
exposta ao cliente.

## Ordem de cutover

1. Fazer snapshot/export do D1 e inventário do R2 atuais.
2. Aplicar a migração de schema no projeto Supabase correto.
3. Importar as tabelas mantendo IDs e valores exatamente iguais.
4. Copiar todos os objetos do R2 para `course-media` preservando as chaves.
5. Reexecutar a migração para sincronizar sequences.
6. Comparar contagens por tabela e quantidade/tamanho dos objetos.
7. Configurar os envs no Preview do Vercel.
8. Validar login, painel admin, aulas, progresso, práticas, provas, capas, áudios e vídeos.
9. Somente após validação, promover para produção. O banco/hosting atuais ficam intactos
   até esse ponto.
