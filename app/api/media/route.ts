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
type ArtworkEntity = "module" | "section" | "lesson";
type ArtworkDevice = "desktop" | "mobile";

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const CHUNK_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function artworkConfiguration(entity: string, device: string = "desktop") {
  if (device !== "desktop" && device !== "mobile") return null;
  const typedDevice = device as ArtworkDevice;
  if (entity === "module") return { entity: entity as ArtworkEntity, device: typedDevice, table: "course_modules", column: typedDevice === "mobile" ? "cover_mobile_key" : "cover_key" };
  if (entity === "section") return { entity: entity as ArtworkEntity, device: typedDevice, table: "course_sections", column: typedDevice === "mobile" ? "cover_mobile_key" : "cover_key" };
  if (entity === "lesson") return { entity: entity as ArtworkEntity, device: typedDevice, table: "lessons", column: typedDevice === "mobile" ? "thumbnail_mobile_key" : "thumbnail_key" };
  return null;
}

function storage() {
  return env.VIDEOS as R2Bucket & {
    createMultipartUpload?: (key: string, options?: R2PutOptions) => Promise<MultipartUpload>;
    resumeMultipartUpload?: (key: string, uploadId: string) => MultipartUpload;
  };
}

async function replaceArtwork(entity: ArtworkEntity, device: ArtworkDevice, id: number, key: string) {
  const configuration = artworkConfiguration(entity, device);
  if (!configuration) throw new Error("Tipo de capa inválido.");
  const db = getD1();
  const previous = await db.prepare(`SELECT ${configuration.column} AS imageKey FROM ${configuration.table} WHERE id = ? LIMIT 1`).bind(id).first<{ imageKey?: string }>();
  if (!previous) throw new Error("Conteúdo não encontrado.");
  await db.prepare(`UPDATE ${configuration.table} SET ${configuration.column} = ? WHERE id = ?`).bind(key, id).run();
  if (previous.imageKey?.startsWith("covers/") && previous.imageKey !== key) {
    await storage().delete(previous.imageKey).catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const bucket = storage();

    if (action === "part") {
      const key = url.searchParams.get("key") ?? "";
      const uploadId = url.searchParams.get("uploadId") ?? "";
      const partNumber = Number(url.searchParams.get("partNumber"));
      const declaredSize = Number(request.headers.get("content-length") ?? 0);
      if (!key.startsWith("covers/") || !uploadId || !partNumber || partNumber > 4 || !request.body) return Response.json({ error: "Parte de imagem inválida." }, { status: 400 });
      if (declaredSize > CHUNK_SIZE) return Response.json({ error: "Parte da imagem acima do limite permitido." }, { status: 413 });
      const multipart = bucket.resumeMultipartUpload?.(key, uploadId);
      if (!multipart) return Response.json({ error: "Upload em partes indisponível neste ambiente." }, { status: 501 });
      const part = await multipart.uploadPart(partNumber, request.body);
      return Response.json({ part });
    }

    if (request.headers.get("content-type")?.includes("application/json")) {
      const payload = await request.json() as { action?: string; entity?: string; device?: string; id?: number; name?: string; type?: string; size?: number; key?: string; uploadId?: string; parts?: UploadedPart[] };

      if (payload.action === "init") {
        const configuration = artworkConfiguration(payload.entity ?? "", payload.device ?? "desktop");
        const id = Number(payload.id);
        const size = Number(payload.size);
        const contentType = payload.type ?? "";
        if (!configuration || !id || !size || size > MAX_IMAGE_SIZE) return Response.json({ error: "A imagem otimizada deve ter no máximo 12 MB." }, { status: 413 });
        if (!ALLOWED_IMAGE_TYPES.has(contentType)) return Response.json({ error: "Use uma imagem JPG, PNG, WebP ou AVIF." }, { status: 400 });
        const exists = await getD1().prepare(`SELECT id FROM ${configuration.table} WHERE id = ? LIMIT 1`).bind(id).first();
        if (!exists) return Response.json({ error: "Conteúdo não encontrado." }, { status: 404 });
        const key = `covers/${configuration.entity}/${id}/${configuration.device}/${crypto.randomUUID()}-${safeName(payload.name ?? "capa.webp")}`;
        const multipart = await bucket.createMultipartUpload?.(key, {
          httpMetadata: { contentType, cacheControl: "private, max-age=86400" },
          customMetadata: { originalName: safeName(payload.name ?? "capa.webp") },
        });
        if (!multipart) return Response.json({ error: "Upload em partes indisponível neste ambiente." }, { status: 501 });
        return Response.json({ key, uploadId: multipart.uploadId, chunkSize: CHUNK_SIZE });
      }

      if (payload.action === "complete") {
        const configuration = artworkConfiguration(payload.entity ?? "", payload.device ?? "desktop");
        const id = Number(payload.id);
        const key = payload.key ?? "";
        const uploadId = payload.uploadId ?? "";
        const parts = payload.parts ?? [];
        if (!configuration || !id || !key.startsWith(`covers/${configuration.entity}/${id}/${configuration.device}/`) || !uploadId || !parts.length || parts.length > 4) return Response.json({ error: "Upload de capa incompleto." }, { status: 400 });
        const multipart = bucket.resumeMultipartUpload?.(key, uploadId);
        if (!multipart) return Response.json({ error: "Upload em partes indisponível neste ambiente." }, { status: 501 });
        const object = await multipart.complete(parts.sort((left, right) => left.partNumber - right.partNumber));
        if (object.size > MAX_IMAGE_SIZE) {
          await bucket.delete(key);
          return Response.json({ error: "A imagem final ultrapassou 12 MB." }, { status: 413 });
        }
        await replaceArtwork(configuration.entity, configuration.device, id, key);
        return Response.json({ ok: true, key, size: object.size });
      }

      if (payload.action === "abort") {
        const key = payload.key ?? "";
        const uploadId = payload.uploadId ?? "";
        if (key.startsWith("covers/") && uploadId) await bucket.resumeMultipartUpload?.(key, uploadId)?.abort();
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Ação de upload inválida." }, { status: 400 });
    }

    return Response.json({ error: "Use o envio otimizado de imagens do painel." }, { status: 415 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a imagem." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith("covers/")) return new Response("Imagem inválida", { status: 400 });
  const object = await storage().get(key);
  if (!object) return new Response("Imagem não encontrada", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=86400");
  return new Response(object.body, { headers });
}
