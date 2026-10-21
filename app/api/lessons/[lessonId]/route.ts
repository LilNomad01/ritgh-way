import { lessonVideos } from "../../../lib/lesson-videos";
import { assertSupabase, getSupabase } from "../../../../db/supabase";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState } from "../../../lib/academic";
import { requireAuth } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  if (!lessonId) return Response.json({ error: "Aula inválida." }, { status: 400 });
  const db = getSupabase();
  const [lessonResult, academic] = await Promise.all([
    db.from("lessons").select("id,section_id,title,description,duration,lesson_type,video_key,video_name,video_size,thumbnail_key,thumbnail_mobile_key,thumbnail_fit,thumbnail_zoom,thumbnail_overlay,thumbnail_position_x,thumbnail_position_y,course_sections!inner(id,title,description,status,module_id,course_modules!inner(id,title,level,status))").eq("id", lessonId).eq("status", "Publicado").eq("course_sections.status", "Publicado").eq("course_sections.course_modules.status", "Publicado").maybeSingle(),
    computeAcademicState(auth.sub),
  ]);
  const rawLesson = assertSupabase(lessonResult);
  const section = rawLesson?.course_sections as unknown as { id: number; title: string; description: string; module_id: number; course_modules: { id: number; title: string; level: string } } | undefined;
  const lesson = rawLesson && section ? { id: rawLesson.id, sectionId: rawLesson.section_id, title: rawLesson.title, description: rawLesson.description, duration: rawLesson.duration, lessonType: rawLesson.lesson_type, videoKey: rawLesson.video_key, videoName: rawLesson.video_name, videoSize: rawLesson.video_size, imageKey: rawLesson.thumbnail_key, imageMobileKey: rawLesson.thumbnail_mobile_key, imageFit: rawLesson.thumbnail_fit, imageZoom: rawLesson.thumbnail_zoom, imageOverlay: rawLesson.thumbnail_overlay, imagePositionX: rawLesson.thumbnail_position_x, imagePositionY: rawLesson.thumbnail_position_y, sectionTitle: section.title, sectionDescription: section.description, moduleId: section.course_modules.id, moduleTitle: section.course_modules.title, level: section.course_modules.level } : null;
  if (!lesson) return Response.json({ error: "Aula não encontrada." }, { status: 404 });
  const state = (academic.lessonStates as LessonAcademicState[]).find((item: LessonAcademicState) => item.lessonId === lessonId);
  if (!state) return Response.json({ error: "Aula indisponível." }, { status: 404 });
  const [videos, lastAttempt] = await Promise.all([
    lessonVideos(lessonId, auth.sub),
    db.from("exercise_attempts").select("answers_json").eq("user_id", auth.sub).eq("lesson_id", lessonId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let review: { prompt: string; answer: string; correctAnswer: string; explanation: string }[] = [];
  try {
    const stored = JSON.parse(assertSupabase(lastAttempt)?.answers_json ?? "null") as { results?: { correct?: boolean; prompt?: string; answer?: string; correctAnswer?: string; explanation?: string }[] } | null;
    review = Array.isArray(stored?.results) ? stored.results.filter((item) => item.correct === false && item.prompt && item.correctAnswer).map((item) => ({ prompt: item.prompt ?? "", answer: item.answer ?? "", correctAnswer: item.correctAnswer ?? "", explanation: item.explanation ?? "" })) : [];
  } catch { /* Older attempts stored only an array of answers. */ }
  return Response.json({ lesson, state, videos, review, nextStep: state.completed ? getNextLearningStep(academic) : null }, { headers: { "cache-control": "private, no-store" } });
}
