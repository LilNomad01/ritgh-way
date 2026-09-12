import { getD1 } from "../../../../../db";
import { computeAcademicState, type LessonAcademicState } from "../../../../lib/academic";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  const payload = await request.json() as { positionSeconds?: number; durationSeconds?: number; ended?: boolean; videoId?: number };
  const db = getD1();
  const [lesson, academic] = await Promise.all([
    db.prepare("SELECT id, video_key AS videoKey FROM lessons WHERE id = ? AND status = 'Publicado' LIMIT 1").bind(lessonId).first<{ id: number; videoKey?: string }>(),
    computeAcademicState(auth.sub),
  ]);
  const currentState = (academic.lessonStates as LessonAcademicState[]).find((item: LessonAcademicState) => item.lessonId === lessonId);
  if (!lesson?.videoKey || !currentState?.unlocked) return Response.json({ error: "Vídeo indisponível para esta aula." }, { status: 403 });
  if (!Number.isFinite(payload.durationSeconds) || !Number.isFinite(payload.positionSeconds) || Number(payload.durationSeconds) <= 0) return Response.json({ error: "Posição inválida." }, { status: 400 });
  const duration = Math.max(0, Math.round(Number(payload.durationSeconds) || 0));
  const position = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, Math.round(Number(payload.positionSeconds) || 0)));
  const percentage = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
  const completed = Boolean(payload.ended) || percentage >= 90;
  const status = completed ? "completed" : position > 0 ? "watching" : "not_started";
  const now = new Date().toISOString();
  const videoId = Number(payload.videoId || 0);
  if (videoId) {
    if (!await db.prepare("SELECT id FROM lesson_videos WHERE id = ? AND lesson_id = ?").bind(videoId, lessonId).first()) return Response.json({ error: "Vídeo inválido." }, { status: 400 });
    await db.prepare("INSERT INTO video_item_progress (user_id, video_id, position_seconds, duration_seconds, completed, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, video_id) DO UPDATE SET position_seconds = excluded.position_seconds, duration_seconds = excluded.duration_seconds, completed = MAX(completed, excluded.completed), updated_at = excluded.updated_at").bind(auth.sub, videoId, position, duration, completed ? 1 : 0, now).run();
  }
  await db.prepare(`INSERT INTO video_progress (user_id, lesson_id, position_seconds, duration_seconds, progress_percent, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      position_seconds = excluded.position_seconds,
      duration_seconds = MAX(duration_seconds, excluded.duration_seconds),
      progress_percent = MAX(progress_percent, excluded.progress_percent),
      status = CASE WHEN status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
      updated_at = excluded.updated_at`).bind(auth.sub, lessonId, position, duration, completed ? 100 : percentage, status, now).run();
  const updated = await computeAcademicState(auth.sub);
  return Response.json({ ok: true, state: updated.lessonStates.find((item) => item.lessonId === lessonId) });
}
