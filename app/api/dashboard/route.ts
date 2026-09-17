import { getD1 } from "../../../db";
import { requireAuth } from "../../lib/auth";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState, type ModuleAcademicState, type SectionAcademicState } from "../../lib/academic";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const db = getD1();
    const [academic, rows] = await Promise.all([computeAcademicState(auth.sub), db.batch([
      db.prepare("SELECT COUNT(*) AS attempts, SUM(score) AS correct, SUM(total) AS total FROM exercise_attempts WHERE user_id = ?").bind(auth.sub),
      db.prepare("SELECT COUNT(*) AS attempts, AVG(percentage) AS average FROM section_exam_attempts WHERE user_id = ?").bind(auth.sub),
      db.prepare("SELECT p.lesson_id AS lessonId, p.current_index AS currentIndex, p.total, p.updated_at AS updatedAt, 'practice' AS kind FROM practice_sessions p WHERE p.user_id = ? AND p.status = 'active' UNION ALL SELECT v.lesson_id, v.position_seconds, v.duration_seconds, v.updated_at, 'video' FROM video_progress v WHERE v.user_id = ? AND v.status != 'not_started' ORDER BY updatedAt DESC LIMIT 20").bind(auth.sub, auth.sub),
      db.prepare("SELECT l.id, l.section_id AS sectionId, l.title, l.description, l.duration, s.title AS sectionTitle, m.title AS moduleTitle, m.level, COALESCE(l.thumbnail_key, m.cover_key) AS imageKey, COALESCE(l.thumbnail_mobile_key, m.cover_mobile_key) AS imageMobileKey FROM lessons l JOIN course_sections s ON s.id = l.section_id JOIN course_modules m ON m.id = s.module_id WHERE l.status = 'Publicado' AND s.status = 'Publicado' AND m.status = 'Publicado' ORDER BY m.position, s.position, l.position, l.id"),
      db.prepare("SELECT id, title, level, description, cover_key AS imageKey, cover_mobile_key AS imageMobileKey FROM course_modules WHERE status = 'Publicado' ORDER BY position, id"),
    ])]);
    const practice = rows[0].results[0] as { attempts: number; correct: number; total: number };
    const exams = rows[1].results[0] as { attempts: number; average: number | null };
    const lessons = rows[3].results as { id: number; sectionId: number; title: string; description: string; duration: string; sectionTitle: string; moduleTitle: string; level: string; imageKey: string | null; imageMobileKey: string | null }[];
    const modules = (rows[4].results as { id: number; title: string; level: string; description: string; imageKey: string | null; imageMobileKey: string | null }[]).map(module => ({ ...module, state: academic.moduleStates.find((item: ModuleAcademicState) => item.moduleId === module.id) }));
    const states: LessonAcademicState[] = academic.lessonStates;
    const step = getNextLearningStep(academic);
    const lesson = lessons.find(item => item.id === step?.lessonId);
    const section = academic.sectionStates.find((item: SectionAcademicState) => item.sectionId === step?.sectionId);
    const sectionLesson = lessons.find(item => item.sectionId === step?.sectionId);
    const recent = (rows[2].results as { lessonId: number; currentIndex: number; total: number; kind: string }[]).find(row => row.lessonId === step?.lessonId && row.kind === step.kind);
    const resume = lesson && step
      ? { ...lesson, started: Boolean(recent), kind: step.kind, position: recent?.currentIndex ?? 0, total: recent?.total ?? 0, href: step.href }
      : step && sectionLesson
        ? { title: section?.examTitle || sectionLesson.sectionTitle, description: step.kind === 'review' ? 'Revise os pontos em que teve mais dificuldade antes de uma nova tentativa.' : step.kind === 'exam' ? 'As aulas desta matéria terminaram. Agora aplique o que aprendeu.' : 'A avaliação desta matéria está em preparação.', duration: null, sectionTitle: sectionLesson.sectionTitle, moduleTitle: sectionLesson.moduleTitle, imageKey: sectionLesson.imageKey, imageMobileKey: sectionLesson.imageMobileKey, started: false, kind: step.kind, position: 0, total: section?.examQuestionCount ?? 0, href: step.href }
        : step?.kind === 'complete' ? { title: 'Curso concluído', description: 'Você finalizou todas as matérias e avaliações disponíveis.', duration: null, sectionTitle: '', moduleTitle: '', imageKey: null, imageMobileKey: null, started: false, kind: 'complete', position: 0, total: 0, href: step.href } : null;
    return Response.json({ completedLessons: states.filter(item => item.completed).length, totalLessons: states.length, practiceAttempts: Number(practice.attempts ?? 0), accuracy: practice.total ? Math.round(100 * practice.correct / practice.total) : null, examAttempts: Number(exams.attempts ?? 0), examAverage: exams.average === null ? null : Math.round(exams.average), modules, resume }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    console.error('Dashboard unavailable', error);
    return Response.json({ error: 'Não foi possível carregar seu progresso. Tente novamente.' }, { status: 503 });
  }
}
