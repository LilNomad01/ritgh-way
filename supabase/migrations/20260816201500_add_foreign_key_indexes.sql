create index exercise_attempts_lesson_id_idx on public.exercise_attempts(lesson_id);
create index lesson_progress_lesson_id_idx on public.lesson_progress(lesson_id);
create index practice_sessions_lesson_id_idx on public.practice_sessions(lesson_id);
create index section_exam_attempts_exam_id_idx on public.section_exam_attempts(exam_id);
create index video_progress_lesson_id_idx on public.video_progress(lesson_id);
