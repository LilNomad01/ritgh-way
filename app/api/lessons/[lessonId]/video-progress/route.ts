import { ensureData } from "../../../admin/route";
import { computeAcademicState, type LessonAcademicState } from "../../../../lib/academic";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  const payload = await request.json() as { positionSeconds?: number; durationSeconds?: number; ended?: boolean };
  const db = await ensureData();
  const [lesson, academic] = await Promise.all([
    db.prepare("SELECT id, video_key AS videoKey FROM lessons WHERE id = ? AND status = 'Publicado' LIMIT 1").bind(lessonId).first<{ id: number; videoKey?: string }>(),
    computeAcademicState(auth.sub),
  ]);
  const currentState = (academic.lessonStates as LessonAcademicState[]).find((item: LessonAcademicState) => item.lessonId === lessonId);
  if (!lesson?.videoKey || !currentState?.unlocked) return Response.json({ error: "Vídeo indisponível para esta aula." }, { status: 403 });
  const duration = Math.max(0, Math.round(Number(payload.durationSeconds) || 0));
  const position = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, Math.round(Number(payload.positionSeconds) || 0)));
  const percentage = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
  const completed = Boolean(payload.ended) || percentage >= 90;
  const status = completed ? "completed" : position > 0 ? "watching" : "not_started";
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO video_progress (user_id, lesson_id, position_seconds, duration_seconds, progress_percent, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      position_seconds = MAX(position_seconds, excluded.position_seconds),
      duration_seconds = MAX(duration_seconds, excluded.duration_seconds),
      progress_percent = MAX(progress_percent, excluded.progress_percent),
      status = CASE WHEN status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
      updated_at = excluded.updated_at`).bind(auth.sub, lessonId, position, duration, completed ? 100 : percentage, status, now).run();
  const updated = await computeAcademicState(auth.sub);
  return Response.json({ ok: true, state: updated.lessonStates.find((item) => item.lessonId === lessonId) });
}
