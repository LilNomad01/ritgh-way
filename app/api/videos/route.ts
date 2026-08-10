import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";

export const dynamic = "force-dynamic";

type UploadedPart = { partNumber: number; etag: string };
type MultipartUpload = {
  uploadId: string;
  uploadPart: (partNumber: number, value: ReadableStream | ArrayBuffer | Blob) => Promise<UploadedPart>;
  complete: (parts: UploadedPart[]) => Promise<R2Object>;
  abort: () => Promise<void>;
};

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_DIRECT_UPLOAD = 80 * 1024 * 1024;

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 140);
}

function videoKey(lessonId: number, fileName: string) {
  return `lessons/${lessonId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

function bucket() {
  return env.VIDEOS as R2Bucket & {
    createMultipartUpload?: (key: string, options?: R2PutOptions) => Promise<MultipartUpload>;
    resumeMultipartUpload?: (key: string, uploadId: string) => MultipartUpload;
  };
}

async function saveVideoMetadata(lessonId: number, key: string, name: string, size: number) {
  await getD1().prepare("UPDATE lessons SET video_key = ?, video_name = ?, video_size = ? WHERE id = ?").bind(key, name, size, lessonId).run();
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const storage = bucket();

    if (action === "part") {
      const key = url.searchParams.get("key") ?? "";
      const uploadId = url.searchParams.get("uploadId") ?? "";
      const partNumber = Number(url.searchParams.get("partNumber"));
      if (!key.startsWith("lessons/") || !uploadId || !partNumber || !request.body) return Response.json({ error: "Parte de vídeo inválida." }, { status: 400 });
      const multipart = storage.resumeMultipartUpload?.(key, uploadId);
      if (!multipart) return Response.json({ error: "Upload em partes indisponível neste ambiente." }, { status: 501 });
      const part = await multipart.uploadPart(partNumber, request.body);
      return Response.json({ part });
    }

    if (request.headers.get("content-type")?.includes("application/json")) {
      const payload = await request.json() as { action?: string; lessonId?: number; name?: string; type?: string; size?: number; key?: string; uploadId?: string; parts?: UploadedPart[] };
      if (payload.action === "init") {
        const lessonId = Number(payload.lessonId);
        const fileName = safeFileName(payload.name ?? "video.mp4");
        const contentType = payload.type?.startsWith("video/") ? payload.type : "video/mp4";
        if (!lessonId || !fileName) return Response.json({ error: "Selecione uma aula e um vídeo." }, { status: 400 });
        const key = videoKey(lessonId, fileName);
        const multipart = await storage.createMultipartUpload?.(key, { httpMetadata: { contentType } });
        if (!multipart) return Response.json({ error: "Upload em partes indisponível neste ambiente." }, { status: 501 });
        return Response.json({ key, uploadId: multipart.uploadId, chunkSize: CHUNK_SIZE });
      }

      if (payload.action === "complete") {
        const lessonId = Number(payload.lessonId);
        const key = payload.key ?? "";
        const uploadId = payload.uploadId ?? "";
        const parts = payload.parts ?? [];
        if (!lessonId || !key.startsWith("lessons/") || !uploadId || !parts.length) return Response.json({ error: "Upload incompleto." }, { status: 400 });
        const multipart = storage.resumeMultipartUpload?.(key, uploadId);
        if (!multipart) return Response.json({ error: "Upload em partes indisponível neste ambiente." }, { status: 501 });
        await multipart.complete(parts.sort((left, right) => left.partNumber - right.partNumber));
        await saveVideoMetadata(lessonId, key, payload.name ?? "video.mp4", Number(payload.size) || 0);
        return Response.json({ ok: true, key, name: payload.name, size: payload.size });
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
    await storage.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await saveVideoMetadata(lessonId, key, file.name, file.size);
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
  const object = await bucket().get(key);
  if (!object) return new Response("Vídeo não encontrado", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}
