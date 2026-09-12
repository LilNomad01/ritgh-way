import { getD1 } from '../../../../db';
import { requireAdmin, assertSameOrigin } from '../../../lib/auth';
import { importLegacyVideo } from '../../../lib/lesson-videos';
export async function GET(request: Request) {
  const auth = await requireAdmin(request); if (auth instanceof Response) return auth;
  const db = getD1();
  const videos = await db.prepare("SELECT v.id, v.lesson_id AS lessonId, v.video_key AS videoKey, v.title, v.size, v.position, v.start_seconds AS startSeconds, v.end_seconds AS endSeconds FROM lesson_videos v UNION ALL SELECT -l.id, l.id, l.video_key, COALESCE(l.video_name, l.title), COALESCE(l.video_size, 0), 0, 0, NULL FROM lessons l WHERE l.video_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_videos v WHERE v.lesson_id = l.id) ORDER BY lessonId, position, id").all();
  return Response.json({ videos: videos.results }, { headers: { 'cache-control': 'private, no-store' } });
}
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: 'Origem não autorizada.' }, { status: 403 });
  const auth = await requireAdmin(request); if (auth instanceof Response) return auth;
  const body = await request.json() as { id: number; action: string; lessonId: number; title: string; position: number; startSeconds: number; endSeconds?: number | null };
  const db = getD1(); let id = Number(body.id);
  if (id < 0) { await importLegacyVideo(-id); const row = await db.prepare('SELECT id FROM lesson_videos WHERE lesson_id = ? ORDER BY position, id LIMIT 1').bind(-id).first<{ id: number }>(); id = row?.id ?? 0; }
  const video = await db.prepare('SELECT * FROM lesson_videos WHERE id = ?').bind(id).first<{ lesson_id: number; video_key: string; size: number; start_seconds: number; end_seconds: number | null }>();
  if (!video) return Response.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
  if (body.action === 'delete') {
    await db.batch([db.prepare('DELETE FROM video_item_progress WHERE video_id = ?').bind(id), db.prepare('DELETE FROM lesson_videos WHERE id = ?').bind(id)]);
  } else {
    const lessonId = Number(body.lessonId), start = Number(body.startSeconds), end = body.endSeconds === null || body.endSeconds === undefined ? null : Number(body.endSeconds);
    if (!body.title?.trim() || !Number.isSafeInteger(lessonId) || !Number.isFinite(start) || start < 0 || (end !== null && (!Number.isFinite(end) || end <= start)) || !Number.isFinite(Number(body.position))) return Response.json({ error: 'Confira título, aula e intervalo do vídeo.' }, { status: 400 });
    if (!await db.prepare('SELECT id FROM lessons WHERE id = ?').bind(lessonId).first()) return Response.json({ error: 'Aula não encontrada.' }, { status: 404 });
    await importLegacyVideo(lessonId);
    if (body.action === 'copy') await db.prepare('INSERT INTO lesson_videos (lesson_id, video_key, title, size, position, start_seconds, end_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(lessonId, video.video_key, body.title.trim().slice(0,200), video.size, body.position, start, end).run();
    else if (body.action === 'edit') await db.prepare('UPDATE lesson_videos SET lesson_id = ?, title = ?, position = ?, start_seconds = ?, end_seconds = ? WHERE id = ?').bind(lessonId, body.title.trim().slice(0,200), body.position, start, end, id).run();
    else return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    if (body.action === 'edit' && (video.start_seconds !== start || video.end_seconds !== end)) await db.prepare('DELETE FROM video_item_progress WHERE video_id = ?').bind(id).run();
    await syncPrimary(lessonId);
  }
  await syncPrimary(video.lesson_id);
  return Response.json({ ok: true, note: body.action === 'delete' ? 'Vínculo removido. O arquivo original foi preservado para recuperação e outros trechos.' : 'Vídeo salvo.' });
}
async function syncPrimary(lessonId: number) {
  const db = getD1();
  await db.prepare('DELETE FROM video_progress WHERE lesson_id = ? AND NOT EXISTS (SELECT 1 FROM lesson_videos WHERE lesson_id = ?)').bind(lessonId, lessonId).run();
  await db.prepare('UPDATE lessons SET video_key = (SELECT video_key FROM lesson_videos WHERE lesson_id = ? ORDER BY position, id LIMIT 1), video_name = (SELECT title FROM lesson_videos WHERE lesson_id = ? ORDER BY position, id LIMIT 1), video_size = (SELECT size FROM lesson_videos WHERE lesson_id = ? ORDER BY position, id LIMIT 1) WHERE id = ?').bind(lessonId, lessonId, lessonId, lessonId).run();
}
