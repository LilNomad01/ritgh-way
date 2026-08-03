import { assertSameOrigin, ensureAuthSchema, requireAuth } from "../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const rows = await (await ensureAuthSchema()).prepare("SELECT lesson_slug AS lessonSlug, progress_percent AS progressPercent, best_score AS bestScore, attempts_count AS attemptsCount, completed_at AS completedAt FROM lesson_progress WHERE user_id = ? ORDER BY updated_at DESC").bind(auth.sub).all();
  return Response.json({ progress: rows.results });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const payload = await request.json() as { lessonSlug?: string; score?: number; total?: number; answers?: unknown[] };
  const lessonSlug = payload.lessonSlug?.trim() ?? "";
  const total = Math.max(1, Number(payload.total) || 1);
  const score = Math.min(total, Math.max(0, Number(payload.score) || 0));
  if (!lessonSlug) return Response.json({ error: "Aula inválida." }, { status: 400 });
  const percentage = Math.round((score / total) * 100);
  const now = new Date().toISOString();
  const db = await ensureAuthSchema();
  await db.batch([
    db.prepare("INSERT INTO exercise_attempts (user_id, lesson_slug, score, total, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(auth.sub, lessonSlug, score, total, JSON.stringify(payload.answers ?? []), now),
    db.prepare("INSERT INTO lesson_progress (user_id, lesson_slug, progress_percent, best_score, attempts_count, completed_at, updated_at) VALUES (?, ?, 100, ?, 1, ?, ?) ON CONFLICT(user_id, lesson_slug) DO UPDATE SET progress_percent = 100, best_score = MAX(best_score, excluded.best_score), attempts_count = attempts_count + 1, completed_at = excluded.completed_at, updated_at = excluded.updated_at").bind(auth.sub, lessonSlug, percentage, now, now),
  ]);
  return Response.json({ ok: true, percentage });
}
