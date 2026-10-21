import { assertSupabase, getSupabase } from "../../../db/supabase";
import { requireAuth } from "../../lib/auth";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState, type ModuleAcademicState, type SectionAcademicState } from "../../lib/academic";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const db = getSupabase();
    const [academic, practiceResult, examResult, sessionResult, videoResult, lessonResult, sectionResult, moduleResult] = await Promise.all([
      computeAcademicState(auth.sub),
      db.from("exercise_attempts").select("score,total").eq("user_id", auth.sub),
      db.from("section_exam_attempts").select("percentage").eq("user_id", auth.sub),
      db.from("practice_sessions").select("lessonId:lesson_id,currentIndex:current_index,total,updatedAt:updated_at").eq("user_id", auth.sub).eq("status", "active").order("updated_at", { ascending: false }).limit(20),
      db.from("video_progress").select("lessonId:lesson_id,currentIndex:position_seconds,total:duration_seconds,updatedAt:updated_at").eq("user_id", auth.sub).neq("status", "not_started").order("updated_at", { ascending: false }).limit(20),
      db.from("lessons").select("id,sectionId:section_id,title,description,duration,thumbnailKey:thumbnail_key,thumbnailMobileKey:thumbnail_mobile_key").eq("status", "Publicado").order("position").order("id"),
      db.from("course_sections").select("id,moduleId:module_id,title,position").eq("status", "Publicado").order("position").order("id"),
      db.from("course_modules").select("id,title,level,description,imageKey:cover_key,imageMobileKey:cover_mobile_key,position").eq("status", "Publicado").order("position").order("id"),
    ]);
    const practiceRows = (assertSupabase(practiceResult) ?? []) as { score: number; total: number }[];
    const examRows = (assertSupabase(examResult) ?? []) as { percentage: number }[];
    const sectionRows = (assertSupabase(sectionResult) ?? []) as { id: number; moduleId: number; title: string; position: number }[];
    const moduleRows = (assertSupabase(moduleResult) ?? []) as { id: number; title: string; level: string; description: string; imageKey: string | null; imageMobileKey: string | null; position: number }[];
    const sectionById = new Map(sectionRows.map(section => [section.id, section]));
    const moduleById = new Map(moduleRows.map(module => [module.id, module]));
    const lessons = ((assertSupabase(lessonResult) ?? []) as { id: number; sectionId: number; title: string; description: string; duration: string; thumbnailKey: string | null; thumbnailMobileKey: string | null }[]).flatMap(row => {
      const section = sectionById.get(row.sectionId);
      const courseModule = section ? moduleById.get(section.moduleId) : undefined;
      return section && courseModule ? [{ id: row.id, sectionId: row.sectionId, title: row.title, description: row.description, duration: row.duration, sectionTitle: section.title, moduleTitle: courseModule.title, level: courseModule.level, imageKey: row.thumbnailKey ?? courseModule.imageKey, imageMobileKey: row.thumbnailMobileKey ?? courseModule.imageMobileKey }] : [];
    });
    const modules = moduleRows.map(({ position: _position, ...module }) => ({ ...module, state: academic.moduleStates.find((item: ModuleAcademicState) => item.moduleId === module.id) }));
    const recentRows = [
      ...((assertSupabase(sessionResult) ?? []) as { lessonId: number; currentIndex: number; total: number; updatedAt: string }[]).map(row => ({ ...row, kind: "practice" })),
      ...((assertSupabase(videoResult) ?? []) as { lessonId: number; currentIndex: number; total: number; updatedAt: string }[]).map(row => ({ ...row, kind: "video" })),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const states: LessonAcademicState[] = academic.lessonStates;
    const step = getNextLearningStep(academic);
    const lesson = lessons.find(item => item.id === step?.lessonId);
    const section = academic.sectionStates.find((item: SectionAcademicState) => item.sectionId === step?.sectionId);
    const sectionLesson = lessons.find(item => item.sectionId === step?.sectionId);
    const recent = recentRows.find(row => row.lessonId === step?.lessonId && row.kind === step.kind);
    const resume = lesson && step
      ? { ...lesson, started: Boolean(recent), kind: step.kind, position: recent?.currentIndex ?? 0, total: recent?.total ?? 0, href: step.href }
      : step && sectionLesson
        ? { title: section?.examTitle || sectionLesson.sectionTitle, description: step.kind === 'review' ? 'Revise os pontos em que teve mais dificuldade antes de uma nova tentativa.' : step.kind === 'exam' ? 'As aulas desta matéria terminaram. Agora aplique o que aprendeu.' : 'A avaliação desta matéria está em preparação. Enquanto isso, você pode revisar as aulas já concluídas.', duration: null, sectionTitle: sectionLesson.sectionTitle, moduleTitle: sectionLesson.moduleTitle, imageKey: sectionLesson.imageKey, imageMobileKey: sectionLesson.imageMobileKey, started: false, kind: step.kind, position: 0, total: section?.examQuestionCount ?? 0, href: step.kind === 'pending' ? `/aulas/${sectionLesson.id}` : step.href }
        : step?.kind === 'complete' ? { title: 'Curso concluído', description: 'Você finalizou todas as matérias e avaliações disponíveis.', duration: null, sectionTitle: '', moduleTitle: '', imageKey: null, imageMobileKey: null, started: false, kind: 'complete', position: 0, total: 0, href: step.href } : null;
    const totalAnswers = practiceRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const correctAnswers = practiceRows.reduce((sum, row) => sum + Number(row.score || 0), 0);
    const examAverage = examRows.length ? Math.round(examRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / examRows.length) : null;
    return Response.json({ completedLessons: states.filter(item => item.completed).length, totalLessons: states.length, practiceAttempts: practiceRows.length, accuracy: totalAnswers ? Math.round(100 * correctAnswers / totalAnswers) : null, examAttempts: examRows.length, examAverage, modules, resume }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    console.error('Dashboard unavailable', error);
    return Response.json({ error: 'Não foi possível carregar seu progresso. Tente novamente.' }, { status: 503 });
  }
}
