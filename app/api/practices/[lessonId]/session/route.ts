import { ensureData } from "../../../admin/route";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";
import { computeAcademicState, type LessonAcademicState } from "../../../../lib/academic";

export const dynamic = "force-dynamic";

function parseAnswers(value?: string) {
  try { return JSON.parse(value ?? "[]") as string[]; } catch { return []; }
}

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  const payload = await request.json() as { action?: "start" | "progress" | "complete"; reset?: boolean; answers?: string[]; score?: number; total?: number; currentIndex?: number };
  const db = await ensureData();
  const lesson = await db.prepare("SELECT l.id, l.title, COUNT(e.id) AS exerciseCount FROM lessons l JOIN lesson_exercises e ON e.lesson_id = l.id AND e.status = 'Publicado' WHERE l.id = ? AND l.status = 'Publicado' GROUP BY l.id LIMIT 1").bind(lessonId).first<{ id: number; title: string; exerciseCount: number }>();
  if (!lesson) return Response.json({ error: "Prática inválida ou sem exercícios publicados." }, { status: 404 });
  const academic = await computeAcademicState(auth.sub);
  const lessonState = academic.lessonStates.find((state: LessonAcademicState) => state.lessonId === lessonId);
  if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Conclua o vídeo da aula antes de iniciar os exercícios." }, { status: 403 });
  const now = new Date().toISOString();
  const current = await db.prepare("SELECT current_index AS currentIndex, answers_json AS answersJson, score, total, status FROM practice_sessions WHERE user_id = ? AND lesson_id = ? LIMIT 1").bind(auth.sub, lessonId).first<{ currentIndex: number; answersJson: string; score: number; total: number; status: "active" | "completed" }>();
  if (payload.action === "start") {
    if (!current || payload.reset || current.status === "completed") {
      await db.prepare("INSERT INTO practice_sessions (user_id, lesson_id, current_index, answers_json, score, total, status, created_at, updated_at) VALUES (?, ?, 0, '[]', 0, ?, 'active', ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_index = 0, answers_json = '[]', score = 0, total = excluded.total, status = 'active', created_at = excluded.created_at, updated_at = excluded.updated_at").bind(auth.sub, lessonId, Number(lesson.exerciseCount), now, now).run();
      return Response.json({ session: { currentIndex: 0, answers: [], score: 0, total: Number(lesson.exerciseCount), status: "active" } });
    }
    return Response.json({ session: { currentIndex: current.currentIndex, answers: parseAnswers(current.answersJson), score: current.score, total: current.total, status: current.status } });
  }
  const total = Math.max(1, Math.min(Number(lesson.exerciseCount), Number(payload.total) || Number(lesson.exerciseCount)));
  const score = Math.max(0, Math.min(total, Number(payload.score) || 0));
  const answers = Array.isArray(payload.answers) ? payload.answers.slice(0, total).map((answer) => String(answer).slice(0, 1000)) : [];
  const currentIndex = Math.max(0, Math.min(total, Number(payload.currentIndex) || 0));
  if (payload.action === "progress") {
    await db.prepare("INSERT INTO practice_sessions (user_id, lesson_id, current_index, answers_json, score, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_index = excluded.current_index, answers_json = excluded.answers_json, score = excluded.score, total = excluded.total, status = 'active', updated_at = excluded.updated_at").bind(auth.sub, lessonId, currentIndex, JSON.stringify(answers), score, total, now, now).run();
    return Response.json({ ok: true, session: { currentIndex, answers, score, total, status: "active" } });
  }
  if (payload.action === "complete") {
    const lessonSlug = `lesson-${lessonId}-practice`;
    await db.batch([
      db.prepare("INSERT INTO exercise_attempts (user_id, lesson_id, lesson_slug, score, total, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(auth.sub, lessonId, lessonSlug, score, total, JSON.stringify(answers), now),
      db.prepare("INSERT INTO lesson_progress (user_id, lesson_id, lesson_slug, progress_percent, best_score, attempts_count, completed_at, updated_at) VALUES (?, ?, ?, 100, ?, 1, ?, ?) ON CONFLICT(user_id, lesson_slug) DO UPDATE SET lesson_id = excluded.lesson_id, progress_percent = 100, best_score = MAX(best_score, excluded.best_score), attempts_count = attempts_count + 1, completed_at = excluded.completed_at, updated_at = excluded.updated_at").bind(auth.sub, lessonId, lessonSlug, score, now, now),
      db.prepare("INSERT INTO practice_sessions (user_id, lesson_id, current_index, answers_json, score, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_index = excluded.current_index, answers_json = excluded.answers_json, score = excluded.score, total = excluded.total, status = 'completed', updated_at = excluded.updated_at").bind(auth.sub, lessonId, total, JSON.stringify(answers), score, total, now, now),
    ]);
    return Response.json({ ok: true, percentage: Math.round((score / total) * 100), session: { currentIndex: total, answers, score, total, status: "completed" } });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
