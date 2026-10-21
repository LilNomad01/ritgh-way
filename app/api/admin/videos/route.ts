import { assertSupabase, getSupabase } from '../../../../db/supabase';
import { requireAdmin, assertSameOrigin } from '../../../lib/auth';
import { importLegacyVideo } from '../../../lib/lesson-videos';
export async function GET(request: Request) {
  const auth = await requireAdmin(request); if (auth instanceof Response) return auth;
  const db = getSupabase();
  const [videoResult, lessonResult] = await Promise.all([
    db.from('lesson_videos').select('id,lessonId:lesson_id,videoKey:video_key,title,size,position,startSeconds:start_seconds,endSeconds:end_seconds').order('lesson_id').order('position').order('id'),
    db.from('lessons').select('id,title,videoKey:video_key,videoName:video_name,videoSize:video_size').not('video_key', 'is', null),
  ]);
  const videos = (assertSupabase(videoResult) ?? []) as { id: number; lessonId: number; videoKey: string; title: string; size: number; position: number; startSeconds: number; endSeconds: number | null }[];
  const lessons = (assertSupabase(lessonResult) ?? []) as { id: number; title: string; videoKey: string; videoName: string | null; videoSize: number | null }[];
  const linkedLessons = new Set(videos.map(video => video.lessonId));
  const legacy = lessons.filter(lesson => !linkedLessons.has(lesson.id)).map(lesson => ({ id: -lesson.id, lessonId: lesson.id, videoKey: lesson.videoKey, title: lesson.videoName || lesson.title, size: lesson.videoSize || 0, position: 0, startSeconds: 0, endSeconds: null }));
  return Response.json({ videos: [...videos, ...legacy].sort((a, b) => a.lessonId - b.lessonId || a.position - b.position || a.id - b.id) }, { headers: { 'cache-control': 'private, no-store' } });
}
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: 'Origem não autorizada.' }, { status: 403 });
  const auth = await requireAdmin(request); if (auth instanceof Response) return auth;
  const body = await request.json() as { id: number; action: string; lessonId: number; title: string; position: number; startSeconds: number; endSeconds?: number | null };
  const db = getSupabase(); let id = Number(body.id);
  if (id < 0) { await importLegacyVideo(-id); const row = assertSupabase(await db.from('lesson_videos').select('id').eq('lesson_id', -id).order('position').order('id').limit(1).maybeSingle()) as { id: number } | null; id = row?.id ?? 0; }
  const video = assertSupabase(await db.from('lesson_videos').select('lesson_id,video_key,size,start_seconds,end_seconds').eq('id', id).maybeSingle()) as { lesson_id: number; video_key: string; size: number; start_seconds: number; end_seconds: number | null } | null;
  if (!video) return Response.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
  if (body.action === 'delete') {
    assertSupabase(await db.from('lesson_videos').delete().eq('id', id));
  } else {
    const lessonId = Number(body.lessonId), start = Number(body.startSeconds), end = body.endSeconds === null || body.endSeconds === undefined ? null : Number(body.endSeconds);
    if (!body.title?.trim() || !Number.isSafeInteger(lessonId) || !Number.isFinite(start) || start < 0 || (end !== null && (!Number.isFinite(end) || end <= start)) || !Number.isFinite(Number(body.position))) return Response.json({ error: 'Confira título, aula e intervalo do vídeo.' }, { status: 400 });
    if (!assertSupabase(await db.from('lessons').select('id').eq('id', lessonId).maybeSingle())) return Response.json({ error: 'Aula não encontrada.' }, { status: 404 });
    await importLegacyVideo(lessonId);
    if (body.action === 'copy') assertSupabase(await db.from('lesson_videos').insert({ lesson_id: lessonId, video_key: video.video_key, title: body.title.trim().slice(0,200), size: video.size, position: body.position, start_seconds: start, end_seconds: end }));
    else if (body.action === 'edit') assertSupabase(await db.from('lesson_videos').update({ lesson_id: lessonId, title: body.title.trim().slice(0,200), position: body.position, start_seconds: start, end_seconds: end }).eq('id', id));
    else return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    if (body.action === 'edit' && (video.start_seconds !== start || video.end_seconds !== end)) assertSupabase(await db.from('video_item_progress').delete().eq('video_id', id));
    await syncPrimary(lessonId);
  }
  await syncPrimary(video.lesson_id);
  return Response.json({ ok: true, note: body.action === 'delete' ? 'Vínculo removido. O arquivo original foi preservado para recuperação e outros trechos.' : 'Vídeo salvo.' });
}
async function syncPrimary(lessonId: number) {
  const db = getSupabase();
  const primary = assertSupabase(await db.from('lesson_videos').select('video_key,title,size').eq('lesson_id', lessonId).order('position').order('id').limit(1).maybeSingle()) as { video_key: string; title: string; size: number } | null;
  if (!primary) assertSupabase(await db.from('video_progress').delete().eq('lesson_id', lessonId));
  assertSupabase(await db.from('lessons').update({ video_key: primary?.video_key ?? null, video_name: primary?.title ?? null, video_size: primary?.size ?? null }).eq('id', lessonId));
}
