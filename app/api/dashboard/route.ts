import { getD1 } from "../../../db";
import { requireAuth } from "../../lib/auth";
import { computeAcademicState, type LessonAcademicState, type ModuleAcademicState } from "../../lib/academic";

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
      db.prepare("SELECT l.id, l.title, l.description, s.title AS sectionTitle, m.title AS moduleTitle, m.level, COALESCE(l.thumbnail_key, m.cover_key) AS imageKey, COALESCE(l.thumbnail_mobile_key, m.cover_mobile_key) AS imageMobileKey FROM lessons l JOIN course_sections s ON s.id = l.section_id JOIN course_modules m ON m.id = s.module_id WHERE l.status = 'Publicado' AND s.status = 'Publicado' AND m.status = 'Publicado' ORDER BY m.position, s.position, l.position, l.id"),
      db.prepare("SELECT id, title, level, description, cover_key AS imageKey, cover_mobile_key AS imageMobileKey FROM course_modules WHERE status = 'Publicado' ORDER BY position, id"),
    ])]);
    const practice = rows[0].results[0] as { attempts: number; correct: number; total: number };
    const exams = rows[1].results[0] as { attempts: number; average: number | null };
    const lessons = rows[3].results as { id: number; title: string; description: string; sectionTitle: string; moduleTitle: string; level: string; imageKey: string | null; imageMobileKey: string | null }[];
    const modules = (rows[4].results as { id: number; title: string; level: string; description: string; imageKey: string | null; imageMobileKey: string | null }[]).map(module => ({ ...module, state: academic.moduleStates.find((item: ModuleAcademicState) => item.moduleId === module.id) }));
    const states: LessonAcademicState[] = academic.lessonStates;
    const recent = (rows[2].results as { lessonId: number; currentIndex: number; total: number; kind: string }[]).find(row => states.some(state => state.lessonId === row.lessonId && state.unlocked && !state.completed && (row.kind !== 'practice' || state.videoStatus === 'completed')));
    const next = recent?.lessonId ?? states.find(state => state.unlocked && !state.completed)?.lessonId;
    const lesson = lessons.find(item => item.id === next);
    return Response.json({ completedLessons: states.filter(item => item.completed).length, totalLessons: states.length, practiceAttempts: Number(practice.attempts ?? 0), accuracy: practice.total ? Math.round(100 * practice.correct / practice.total) : null, examAttempts: Number(exams.attempts ?? 0), examAverage: exams.average === null ? null : Math.round(exams.average), modules, resume: lesson ? { ...lesson, started: Boolean(recent), kind: recent?.kind ?? 'video', position: recent?.currentIndex ?? 0, total: recent?.total ?? 0, href: recent?.kind === 'practice' ? `/praticar/${lesson.id}/sessao` : `/aulas/${lesson.id}` } : null }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    console.error('Dashboard unavailable', error);
    return Response.json({ error: 'Não foi possível carregar seu progresso. Tente novamente.' }, { status: 503 });
  }
}
