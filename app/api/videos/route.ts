import { importLegacyVideo } from "../../lib/lesson-videos";
import { computeAcademicState } from "../../lib/academic";
import { assertSupabase, getStorageBucket, getStorageUploadEndpoint, getSupabase } from "../../../db/supabase";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";
import { objectInfo, removeObject, serveObject, uploadObject } from "../../lib/storage";

export const dynamic = "force-dynamic";

const MAX_DIRECT_UPLOAD = 80 * 1024 * 1024;

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 140);
}

function videoKey(lessonId: number, fileName: string) {
  return `lessons/${lessonId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

async function saveVideoMetadata(lessonId: number, key: string, size: number) {
  await importLegacyVideo(lessonId);
  const db = getSupabase();
  const row = assertSupabase(await db.from("lesson_videos").select("position").eq("lesson_id", lessonId).order("position", { ascending: false }).limit(1).maybeSingle()) as { position: number } | null;
  const position = (row?.position ?? -1) + 1;
  const title = `Vídeo ${position + 1}`;
  assertSupabase(await db.from("lesson_videos").insert({ lesson_id: lessonId, video_key: key, title, size, position }));
  const lesson = assertSupabase(await db.from("lessons").select("video_key,video_name,video_size").eq("id", lessonId).maybeSingle()) as { video_key: string | null; video_name: string | null; video_size: number | null } | null;
  assertSupabase(await db.from("lessons").update({ video_key: lesson?.video_key ?? key, video_name: lesson?.video_name ?? title, video_size: lesson?.video_size ?? size }).eq("id", lessonId));
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;

    if (request.headers.get("content-type")?.includes("application/json")) {
      const payload = await request.json() as { action?: string; lessonId?: number; name?: string; type?: string; size?: number; key?: string };
      if (payload.action === "init") {
        const lessonId = Number(payload.lessonId);
        const fileName = safeFileName(payload.name ?? "video.mp4");
        const contentType = payload.type?.startsWith("video/") ? payload.type : "video/mp4";
        const lesson = Number.isSafeInteger(lessonId) && lessonId > 0 ? assertSupabase(await getSupabase().from("lessons").select("id").eq("id", lessonId).maybeSingle()) : null;
        if (!lesson || !fileName) return Response.json({ error: "Selecione uma aula existente e um vídeo." }, { status: 400 });
        const key = videoKey(lessonId, fileName);
        const signed = assertSupabase(await getSupabase().storage.from(getStorageBucket()).createSignedUploadUrl(key));
        if (!signed) throw new Error("O Supabase não criou a autorização de upload.");
        return Response.json({ key, token: signed.token, endpoint: getStorageUploadEndpoint(), bucket: getStorageBucket(), contentType });
      }

      if (payload.action === "complete") {
        const lessonId = Number(payload.lessonId);
        const key = payload.key ?? "";
        if (!lessonId || !key.startsWith(`lessons/${lessonId}/`)) return Response.json({ error: "Upload incompleto." }, { status: 400 });
        const info = await objectInfo(key);
        if (!info) return Response.json({ error: "O vídeo não foi encontrado no Supabase Storage." }, { status: 409 });
        const size = Number(info.size) || Number(payload.size) || 0;
        await saveVideoMetadata(lessonId, key, size);
        return Response.json({ ok: true, key, name: payload.name, size });
      }

      if (payload.action === "abort") {
        const key = payload.key ?? "";
        if (key.startsWith("lessons/")) await removeObject(key).catch(() => undefined);
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const lessonId = Number(form.get("lessonId"));
    if (!(file instanceof File) || !lessonId) return Response.json({ error: "Selecione uma aula e um vídeo." }, { status: 400 });
    if (!file.type.startsWith("video/")) return Response.json({ error: "O arquivo precisa ser um vídeo." }, { status: 400 });
    if (file.size > MAX_DIRECT_UPLOAD) return Response.json({ error: "Arquivo grande demais para envio direto. Use o envio em partes da tela de vídeos." }, { status: 413 });
    const key = videoKey(lessonId, file.name);
    await uploadObject(key, file, file.type);
    try { await saveVideoMetadata(lessonId, key, file.size); }
    catch (error) { await removeObject(key); throw error; }
    return Response.json({ ok: true, key, name: file.name, size: file.size });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha no upload." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("lessons/")) return new Response("Arquivo inválido", { status: 400 });
  if (auth.role !== "admin") {
    const db = getSupabase();
    const [linkedVideos, linkedLessons] = await Promise.all([
      db.from("lesson_videos").select("lessonId:lesson_id").eq("video_key", key),
      db.from("lessons").select("lessonId:id").eq("video_key", key),
    ]);
    const linked = [...(assertSupabase(linkedVideos) ?? []), ...(assertSupabase(linkedLessons) ?? [])] as { lessonId: number }[];
    const academic = await computeAcademicState(auth.sub);
    const allowed = new Set(academic.lessonStates.filter(state => state.unlocked).map(state => state.lessonId));
    if (!linked.some((row: { lessonId: number }) => allowed.has(row.lessonId))) return new Response("Vídeo indisponível para sua conta", { status: 403 });
  }
  return await serveObject(request, key, "private, max-age=3600") ?? new Response("Vídeo não encontrado", { status: 404 });
}
