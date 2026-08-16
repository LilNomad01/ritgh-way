# Supabase — Right Way Online

O projeto usa o PostgreSQL do Supabase para dados relacionais e um bucket privado
do Supabase Storage para capas, thumbnails e videoaulas.

## Variáveis de produção

Configure somente no ambiente do servidor:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET=course-media`

`SUPABASE_SECRET_KEY` nunca deve usar o prefixo `NEXT_PUBLIC_`, entrar no Git ou
ser embutida no aplicativo Android. O navegador e o APK conversam apenas com as
rotas autenticadas da Right Way.

## Organização dos arquivos

O PostgreSQL armazena somente os caminhos:

- `lessons/{lessonId}/{uuid}.mp4`
- `covers/module/{moduleId}/{desktop|mobile}/{uuid}.webp`
- `covers/section/{sectionId}/{desktop|mobile}/{uuid}.webp`
- `covers/lesson/{lessonId}/{desktop|mobile}/{uuid}.webp`

O bucket `course-media` deve ser privado. Vídeos grandes devem usar upload
retomável (TUS); o servidor autoriza o envio e nunca coloca o MP4 no banco.

## Migrações

`migrations/20260816194240_create_right_way_core_schema.sql` contém a estrutura
aplicada ao projeto Supabase. Dados e credenciais não fazem parte dos arquivos de
migração versionados.
