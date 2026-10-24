import { assertSupabase, getSupabase } from "../../../../../db/supabase";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState } from "../../../../lib/academic";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";
import { validateVideoProgress, type ValidatedVideoProgress } from "../../../../lib/video-progress";

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
  const now = new Date().toISOString();
  const videoId = Number(payload.videoId || 0);
  let progress: ValidatedVideoProgress;
  if (videoId) {
    const video = assertSupabase(await db.from("lesson_videos").select("id").eq("id", videoId).eq("lesson_id", lessonId).maybeSingle());
    if (!video) return Response.json({ error: "Vídeo inválido." }, { status: 400 });
    const previousItem = assertSupabase(await db.from("video_item_progress").select("position_seconds,duration_seconds,completed,updated_at").eq("user_id", auth.sub).eq("video_id", videoId).maybeSingle()) as { position_seconds: number; duration_seconds: number; completed: number; updated_at: string } | null;
    progress = validateVideoProgress(previousItem ? { positionSeconds: previousItem.position_seconds, durationSeconds: previousItem.duration_seconds, completed: previousItem.completed === 1, updatedAt: previousItem.updated_at } : null, { positionSeconds: Number(payload.positionSeconds), durationSeconds: Number(payload.durationSeconds), ended: payload.ended }, now);
    assertSupabase(await db.from("video_item_progress").upsert({ user_id: auth.sub, video_id: videoId, position_seconds: progress.positionSeconds, duration_seconds: progress.durationSeconds, completed: progress.completed ? 1 : 0, updated_at: now }, { onConflict: "user_id,video_id" }));
  } else if (!lesson.videoKey) {
    return Response.json({ error: "Vídeo inválido." }, { status: 400 });
  } else {
    const previous = assertSupabase(await db.from("video_progress").select("position_seconds,duration_seconds,status,updated_at").eq("user_id", auth.sub).eq("lesson_id", lessonId).maybeSingle()) as { position_seconds: number; duration_seconds: number; status: string; updated_at: string } | null;
    progress = validateVideoProgress(previous ? { positionSeconds: previous.position_seconds, durationSeconds: previous.duration_seconds, completed: previous.status === "completed", updatedAt: previous.updated_at } : null, { positionSeconds: Number(payload.positionSeconds), durationSeconds: Number(payload.durationSeconds), ended: payload.ended }, now);
  }
  const previousLesson = assertSupabase(await db.from("video_progress").select("progress_percent,status").eq("user_id", auth.sub).eq("lesson_id", lessonId).maybeSingle()) as { progress_percent: number; status: string } | null;
  assertSupabase(await db.from("video_progress").upsert({ user_id: auth.sub, lesson_id: lessonId, position_seconds: progress.positionSeconds, duration_seconds: progress.durationSeconds, progress_percent: Math.max(previousLesson?.progress_percent ?? 0, progress.percentage), status: previousLesson?.status === "completed" || progress.completed ? "completed" : progress.status, updated_at: now }, { onConflict: "user_id,lesson_id" }));
  const updated = await computeAcademicState(auth.sub);
  const state = updated.lessonStates.find((item) => item.lessonId === lessonId);
  return Response.json({ ok: true, progress, state, nextStep: state?.completed ? getNextLearningStep(updated) : null });
}
