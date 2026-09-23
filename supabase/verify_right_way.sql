-- Read-only verification query for the Right Way cutover.
-- Run on the target Supabase after importing all D1 rows.

select *
from (
  values
    ('students', (select count(*)::bigint from public.students)),
    ('course_modules', (select count(*)::bigint from public.course_modules)),
    ('course_sections', (select count(*)::bigint from public.course_sections)),
    ('lessons', (select count(*)::bigint from public.lessons)),
    ('lesson_exercises', (select count(*)::bigint from public.lesson_exercises)),
    ('user_accounts', (select count(*)::bigint from public.user_accounts)),
    ('auth_sessions', (select count(*)::bigint from public.auth_sessions)),
    ('login_attempts', (select count(*)::bigint from public.login_attempts)),
    ('placement_attempts', (select count(*)::bigint from public.placement_attempts)),
    ('lesson_progress', (select count(*)::bigint from public.lesson_progress)),
    ('exercise_attempts', (select count(*)::bigint from public.exercise_attempts)),
    ('practice_sessions', (select count(*)::bigint from public.practice_sessions)),
    ('video_progress', (select count(*)::bigint from public.video_progress)),
    ('section_exams', (select count(*)::bigint from public.section_exams)),
    ('section_exam_questions', (select count(*)::bigint from public.section_exam_questions)),
    ('section_exam_attempts', (select count(*)::bigint from public.section_exam_attempts)),
    ('lesson_videos', (select count(*)::bigint from public.lesson_videos)),
    ('video_item_progress', (select count(*)::bigint from public.video_item_progress))
) as counts(table_name, row_count)
order by table_name;

select
  (select count(*) from public.lessons where video_key is not null) as lessons_with_video,
  (select count(*) from public.lesson_videos) as video_items,
  (select count(*) from public.lesson_exercises where audio_key is not null) as exercises_with_audio,
  (select count(*) from public.course_modules where cover_key is not null or cover_mobile_key is not null) as modules_with_artwork,
  (select count(*) from public.course_sections where cover_key is not null or cover_mobile_key is not null) as sections_with_artwork,
  (select count(*) from public.lessons where thumbnail_key is not null or thumbnail_mobile_key is not null) as lessons_with_artwork;

select
  count(*) filter (where email is null or password_hash is null or password_salt is null) as invalid_accounts,
  count(*) filter (where token_version is null) as accounts_without_token_version
from public.user_accounts;
