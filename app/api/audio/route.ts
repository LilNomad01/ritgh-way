import { assertSupabase, getSupabase } from "../../../db/supabase";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";
import { removeObject, serveObject, uploadObject } from "../../lib/storage";

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
    const db = getSupabase();
    const exercise = assertSupabase(await db.from('lesson_exercises').select('id').eq('id', id).maybeSingle());
    if (!exercise) return Response.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'Arquivo vazio.' }, { status: 400 });
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > MAX_SIZE) { await reader.cancel(); return Response.json({ error: 'O áudio ultrapassa 4 MB.' }, { status: 413 }); } chunks.push(part.value); }
    if (!length) return Response.json({ error: 'Arquivo vazio.' }, { status: 400 });
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const key = `audio/${id}/${crypto.randomUUID()}`;
    const name = decodeURIComponent(request.headers.get('x-file-name') || 'Audio').slice(0, 200);
    await uploadObject(key, bytes, type);
    try { assertSupabase(await db.from('lesson_exercises').update({ audio_key: key, audio_name: name }).eq('id', id)); }
    catch (error) { await removeObject(key); throw error; }
    return Response.json({ key, name });
  } catch (error) { console.error('Audio upload failed', error); return Response.json({ error: 'Não foi possível salvar o áudio. Sua atividade foi preservada.' }, { status: 503 }); }
}
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const id = Number(new URL(request.url).searchParams.get('exerciseId'));
  const db = getSupabase();
  const exercise = assertSupabase(await db.from('lesson_exercises').select('audioKey:audio_key,lessonId:lesson_id,status').eq('id', id).maybeSingle()) as { audioKey: string | null; lessonId: number; status: string } | null;
  if (exercise && auth.role !== 'admin') {
    const lesson = assertSupabase(await db.from('lessons').select('sectionId:section_id,status').eq('id', exercise.lessonId).maybeSingle()) as { sectionId: number; status: string } | null;
    const section = lesson ? assertSupabase(await db.from('course_sections').select('moduleId:module_id,status').eq('id', lesson.sectionId).maybeSingle()) as { moduleId: number; status: string } | null : null;
    const courseModule = section ? assertSupabase(await db.from('course_modules').select('status').eq('id', section.moduleId).maybeSingle()) as { status: string } | null : null;
    if (exercise.status !== 'Publicado' || lesson?.status !== 'Publicado' || section?.status !== 'Publicado' || courseModule?.status !== 'Publicado') return new Response('Áudio não disponível', { status: 404 });
  }
  if (!exercise?.audioKey) return new Response('Áudio não disponível', { status: 404 });
  return await serveObject(request, exercise.audioKey, 'private, no-store') ?? new Response('Áudio não encontrado', { status: 404 });
}
