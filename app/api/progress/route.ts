import { assertSameOrigin, requireAuth } from "../../lib/auth";
import { assertSupabase, getSupabase } from "../../../db/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const rows = assertSupabase(await getSupabase().from("lesson_progress").select("lesson_id,lesson_slug,progress_percent,best_score,attempts_count,completed_at").eq("user_id", auth.sub).order("updated_at", { ascending: false }));
  return Response.json({ progress: (rows ?? []).map(row => ({ lessonId: row.lesson_id, lessonSlug: row.lesson_slug, progressPercent: row.progress_percent, bestScore: row.best_score, attemptsCount: row.attempts_count, completedAt: row.completed_at })) });
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
  const db = getSupabase();
  const previous = assertSupabase(await db.from("lesson_progress").select("best_score,attempts_count").eq("user_id", auth.sub).eq("lesson_slug", lessonSlug).maybeSingle());
  const [attempt, progress] = await Promise.all([
    db.from("exercise_attempts").insert({ user_id: auth.sub, lesson_slug: lessonSlug, score, total, answers_json: JSON.stringify(payload.answers ?? []), created_at: now }),
    db.from("lesson_progress").upsert({ user_id: auth.sub, lesson_slug: lessonSlug, progress_percent: 100, best_score: Math.max(previous?.best_score ?? 0, percentage), attempts_count: (previous?.attempts_count ?? 0) + 1, completed_at: now, updated_at: now }, { onConflict: "user_id,lesson_slug" }),
  ]);
  assertSupabase(attempt); assertSupabase(progress);
  return Response.json({ ok: true, percentage });
}
