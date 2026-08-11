import { ensureData } from "../admin/route";
import { requireAuth } from "../../lib/auth";

export const dynamic = "force-dynamic";

type PracticeRow = { id: number; sectionId: number; title: string; duration: string; lessonType: string; imageKey?: string; imageFit?: string; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number; level: string; moduleTitle: string; sectionTitle: string; exerciseCount: number; skillsJson?: string };
type AttemptRow = { lessonId: number; score: number; total: number; createdAt: string };
type SessionRow = { lessonId: number; currentIndex: number; status: "active" | "completed" };

function stringList(value?: string) {
  try { return JSON.parse(value ?? "[]") as string[]; } catch { return []; }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const db = await ensureData();
  const [modules, sections, practiceRows, attempts, sessions] = await Promise.all([
    db.prepare("SELECT id, title, level, description, status, position, cover_key AS imageKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_modules WHERE status = 'Publicado' ORDER BY position, id").all(),
    db.prepare("SELECT s.id, s.module_id AS moduleId, s.title, s.position, s.cover_key AS imageKey, s.cover_fit AS imageFit, s.cover_zoom AS imageZoom, s.cover_overlay AS imageOverlay, s.cover_position_x AS imagePositionX, s.cover_position_y AS imagePositionY FROM course_sections s JOIN course_modules m ON m.id = s.module_id WHERE m.status = 'Publicado' ORDER BY s.module_id, s.position, s.id").all(),
    db.prepare(`SELECT l.id, l.section_id AS sectionId, l.title, l.duration, l.lesson_type AS lessonType,
      l.thumbnail_key AS imageKey, l.thumbnail_fit AS imageFit, l.thumbnail_zoom AS imageZoom,
      l.thumbnail_overlay AS imageOverlay, l.thumbnail_position_x AS imagePositionX, l.thumbnail_position_y AS imagePositionY,
      m.level, m.title AS moduleTitle, s.title AS sectionTitle, COUNT(e.id) AS exerciseCount,
      GROUP_CONCAT(e.skills_json, '||') AS skillsJson
      FROM lessons l JOIN course_sections s ON s.id = l.section_id JOIN course_modules m ON m.id = s.module_id
      JOIN lesson_exercises e ON e.lesson_id = l.id AND e.status = 'Publicado'
      WHERE l.status = 'Publicado' AND m.status = 'Publicado'
      GROUP BY l.id ORDER BY m.position, s.position, l.position, l.id`).all<PracticeRow>(),
    db.prepare("SELECT lesson_id AS lessonId, score, total, created_at AS createdAt FROM exercise_attempts WHERE user_id = ? AND lesson_id IS NOT NULL ORDER BY created_at DESC").bind(auth.sub).all<AttemptRow>(),
    db.prepare("SELECT lesson_id AS lessonId, current_index AS currentIndex, status FROM practice_sessions WHERE user_id = ?").bind(auth.sub).all<SessionRow>(),
  ]);
  const sessionByLesson = new Map((sessions.results as SessionRow[]).map((session) => [session.lessonId, session]));
  const attemptsByLesson = new Map<number, AttemptRow[]>();
  for (const attempt of attempts.results as AttemptRow[]) attemptsByLesson.set(attempt.lessonId, [...(attemptsByLesson.get(attempt.lessonId) ?? []), attempt]);
  const practices = (practiceRows.results as PracticeRow[]).map((row) => {
    const lessonAttempts = attemptsByLesson.get(row.id) ?? [];
    const last = lessonAttempts[0];
    const session = sessionByLesson.get(row.id);
    const skills = Array.from(new Set((row.skillsJson ?? "").split("||").flatMap((value) => stringList(value))));
    return { ...row, exerciseCount: Number(row.exerciseCount), estimatedMinutes: Math.max(5, Number(row.exerciseCount) * 2), skills, attemptsCount: lessonAttempts.length, bestScore: lessonAttempts.length ? Math.max(...lessonAttempts.map((attempt) => attempt.score)) : undefined, lastScore: last?.score, lastTotal: last?.total, currentIndex: session?.currentIndex, sessionStatus: session?.status };
  });
  return Response.json({ modules: modules.results, sections: sections.results, practices }, { headers: { "cache-control": "private, no-store" } });
}
