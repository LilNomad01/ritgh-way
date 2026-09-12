import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";

export const dynamic = 'force-dynamic';
const MAX_SIZE = 4 * 1024 * 1024;
const TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']);
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: 'Origem não autorizada.' }, { status: 403 });
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  const id = Number(new URL(request.url).searchParams.get('exerciseId'));
  const type = (request.headers.get('content-type') || '').split(';')[0];
  if (!Number.isSafeInteger(id) || id < 1 || !TYPES.has(type)) return Response.json({ error: 'Selecione um exercício salvo e um arquivo MP3, M4A, WAV, OGG ou WebM.' }, { status: 400 });
  if (Number(request.headers.get('content-length')) > MAX_SIZE) return Response.json({ error: 'Use um áudio de até 4 MB. Para gravações maiores, exporte em MP3.' }, { status: 413 });
  try {
    const db = getD1();
    const exercise = await db.prepare('SELECT id FROM lesson_exercises WHERE id = ?').bind(id).first();
    if (!exercise) return Response.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'Arquivo vazio.' }, { status: 400 });
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > MAX_SIZE) { await reader.cancel(); return Response.json({ error: 'O áudio ultrapassa 4 MB.' }, { status: 413 }); } chunks.push(part.value); }
    if (!length) return Response.json({ error: 'Arquivo vazio.' }, { status: 400 });
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const key = `audio/${id}/${crypto.randomUUID()}`;
    const name = decodeURIComponent(request.headers.get('x-file-name') || 'Audio').slice(0, 200);
    const storage = env.VIDEOS as R2Bucket;
    await storage.put(key, bytes, { httpMetadata: { contentType: type } });
    try { await db.prepare('UPDATE lesson_exercises SET audio_key = ?, audio_name = ? WHERE id = ?').bind(key, name, id).run(); }
    catch (error) { await storage.delete(key); throw error; }
    return Response.json({ key, name });
  } catch (error) { console.error('Audio upload failed', error); return Response.json({ error: 'Não foi possível salvar o áudio. Sua atividade foi preservada.' }, { status: 503 }); }
}
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const id = Number(new URL(request.url).searchParams.get('exerciseId'));
  const exercise = await getD1().prepare("SELECT e.audio_key AS audioKey FROM lesson_exercises e JOIN lessons l ON l.id = e.lesson_id JOIN course_sections s ON s.id = l.section_id JOIN course_modules m ON m.id = s.module_id WHERE e.id = ? AND (? = 'admin' OR (e.status = 'Publicado' AND l.status = 'Publicado' AND s.status = 'Publicado' AND m.status = 'Publicado'))").bind(id, auth.role).first<{ audioKey: string | null }>();
  if (!exercise?.audioKey) return new Response('Áudio não disponível', { status: 404 });
  const object = await (env.VIDEOS as R2Bucket).get(exercise.audioKey, { range: request.headers });
  if (!object) return new Response('Áudio não encontrado', { status: 404 });
  const headers = new Headers({ 'cache-control': 'private, no-store', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' });
  object.writeHttpMetadata(headers);
  if (object.range && 'offset' in object.range) { const start = object.range.offset ?? 0; const length = object.range.length ?? object.size; headers.set('content-range', `bytes ${start}-${start + length - 1}/${object.size}`); headers.set('content-length', String(length)); return new Response(object.body, { status: 206, headers }); }
  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}
