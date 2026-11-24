-- Prepara UMA conta de apresentação para o módulo "Speaking na Prática".
-- Rode depois de demo-speaking.sql e depois de enviar os vídeos das aulas no painel admin.
--
-- 1. Troque o e-mail abaixo pelo e-mail da conta de demonstração (não use a conta de um aluno real).
-- 2. O script:
--    - define o nível da conta como "Speaking", para que o módulo de demonstração seja o ponto de partida;
--    - marca os vídeos das aulas de demonstração como assistidos, para os exercícios abrirem direto.
--
-- Para desfazer o nível depois: update public.user_accounts set level = 'Básico' where email = '...';

do $demo$
declare
  v_email text := 'demo@exemplo.com';  -- <- troque aqui
  v_user bigint;
begin
  select id into v_user from public.user_accounts where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'Conta % não encontrada. Crie a conta no aplicativo primeiro.', v_email;
  end if;

  update public.user_accounts set level = 'Speaking' where id = v_user;

  -- Aulas com vídeos na lista de vídeos da aula (envio atual do painel)
  insert into public.video_item_progress (user_id, video_id, position_seconds, duration_seconds, completed, updated_at)
  select v_user, v.id, 0, 0, 1, now()
  from public.lesson_videos v
  join public.lessons l on l.id = v.lesson_id
  join public.course_sections s on s.id = l.section_id
  join public.course_modules m on m.id = s.module_id
  where m.title = 'Speaking na Prática'
  on conflict (user_id, video_id) do update set completed = 1, updated_at = now();

  -- Aulas com vídeo único (formato anterior)
  insert into public.video_progress (user_id, lesson_id, position_seconds, duration_seconds, progress_percent, status, updated_at)
  select v_user, l.id, 0, 0, 100, 'completed', now()
  from public.lessons l
  join public.course_sections s on s.id = l.section_id
  join public.course_modules m on m.id = s.module_id
  where m.title = 'Speaking na Prática'
  on conflict (user_id, lesson_id) do update set status = 'completed', progress_percent = 100, updated_at = now();

  raise notice 'Conta % pronta para a apresentação.', v_email;
end
$demo$;
