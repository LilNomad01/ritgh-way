import { assertSupabase, getSupabase } from "../../../../../db/supabase";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState } from "../../../../lib/academic";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  const payload = await request.json() as { positionSeconds?: number; durationSeconds?: number; ended?: boolean; videoId?: number };
  const db = getSupabase();
  const [lessonResult, academic] = await Promise.all([
    db.from("lessons").select("id,videoKey:video_key").eq("id", lessonId).eq("status", "Publicado").maybeSingle(),
    computeAcademicState(auth.sub),
  ]);
  const lesson = assertSupabase(lessonResult) as { id: number; videoKey?: string } | null;
  const currentState = (academic.lessonStates as LessonAcademicState[]).find((item: LessonAcademicState) => item.lessonId === lessonId);
  if (!lesson || !currentState?.unlocked) return Response.json({ error: "Vídeo indisponível para esta aula." }, { status: 403 });
  if (!Number.isFinite(payload.durationSeconds) || !Number.isFinite(payload.positionSeconds) || Number(payload.durationSeconds) <= 0) return Response.json({ error: "Posição inválida." }, { status: 400 });
  const duration = Math.max(0, Math.round(Number(payload.durationSeconds) || 0));
  const position = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, Math.round(Number(payload.positionSeconds) || 0)));
  const percentage = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
  const completed = Boolean(payload.ended) || percentage >= 90;
  const status = completed ? "completed" : position > 0 ? "watching" : "not_started";
  const now = new Date().toISOString();
  const videoId = Number(payload.videoId || 0);
  if (videoId) {
    const video = assertSupabase(await db.from("lesson_videos").select("id").eq("id", videoId).eq("lesson_id", lessonId).maybeSingle());
    if (!video) return Response.json({ error: "Vídeo inválido." }, { status: 400 });
    const previousItem = assertSupabase(await db.from("video_item_progress").select("completed").eq("user_id", auth.sub).eq("video_id", videoId).maybeSingle()) as { completed: number } | null;
    assertSupabase(await db.from("video_item_progress").upsert({ user_id: auth.sub, video_id: videoId, position_seconds: position, duration_seconds: duration, completed: previousItem?.completed || completed ? 1 : 0, updated_at: now }, { onConflict: "user_id,video_id" }));
  } else if (!lesson.videoKey) {
    return Response.json({ error: "Vídeo inválido." }, { status: 400 });
  }
  const previous = assertSupabase(await db.from("video_progress").select("duration_seconds,progress_percent,status").eq("user_id", auth.sub).eq("lesson_id", lessonId).maybeSingle()) as { duration_seconds: number; progress_percent: number; status: string } | null;
  assertSupabase(await db.from("video_progress").upsert({ user_id: auth.sub, lesson_id: lessonId, position_seconds: position, duration_seconds: Math.max(previous?.duration_seconds ?? 0, duration), progress_percent: Math.max(previous?.progress_percent ?? 0, completed ? 100 : percentage), status: previous?.status === "completed" || status === "completed" ? "completed" : status, updated_at: now }, { onConflict: "user_id,lesson_id" }));
  const updated = await computeAcademicState(auth.sub);
  const state = updated.lessonStates.find((item) => item.lessonId === lessonId);
  return Response.json({ ok: true, state, nextStep: state?.completed ? getNextLearningStep(updated) : null });
}
