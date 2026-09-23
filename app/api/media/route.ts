import { getD1 } from "../../../db";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";
import {
  STORAGE_CHUNK_SIZE,
  abortResumableUpload,
  completeResumableUpload,
  createResumableUpload,
  deleteObject,
  fetchObject,
  uploadResumablePart,
} from "../../lib/storage";

export const dynamic = "force-dynamic";

type UploadedPart = { partNumber: number; etag: string };
type ArtworkEntity = "module" | "section" | "lesson";
type ArtworkDevice = "desktop" | "mobile";

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
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

async function replaceArtwork(entity: ArtworkEntity, device: ArtworkDevice, id: number, key: string) {
  const configuration = artworkConfiguration(entity, device);
  if (!configuration) throw new Error("Tipo de capa inválido.");
  const db = getD1();
  const previous = await db.prepare(`SELECT ${configuration.column} AS imageKey FROM ${configuration.table} WHERE id = ? LIMIT 1`).bind(id).first<{ imageKey?: string }>();
  if (!previous) throw new Error("Conteúdo não encontrado.");
  await db.prepare(`UPDATE ${configuration.table} SET ${configuration.column} = ? WHERE id = ?`).bind(key, id).run();
  if (previous.imageKey?.startsWith("covers/") && previous.imageKey !== key) {
    await deleteObject(previous.imageKey).catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "part") {
      const key = url.searchParams.get("key") ?? "";
      const uploadId = url.searchParams.get("uploadId") ?? "";
      const partNumber = Number(url.searchParams.get("partNumber"));
      const declaredSize = Number(request.headers.get("content-length") ?? 0);
      if (!key.startsWith("covers/") || !uploadId || !partNumber || !request.body) return Response.json({ error: "Parte de imagem inválida." }, { status: 400 });
      if (declaredSize > STORAGE_CHUNK_SIZE) return Response.json({ error: "Parte da imagem acima do limite permitido." }, { status: 413 });
      const part = await uploadResumablePart(uploadId, partNumber, request.body);
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
        const upload = await createResumableUpload(key, size, contentType, "31536000");
        return Response.json({ key, uploadId: upload.uploadId, chunkSize: STORAGE_CHUNK_SIZE });
      }

      if (payload.action === "complete") {
        const configuration = artworkConfiguration(payload.entity ?? "", payload.device ?? "desktop");
        const id = Number(payload.id);
        const key = payload.key ?? "";
        const uploadId = payload.uploadId ?? "";
        const parts = payload.parts ?? [];
        if (!configuration || !id || !key.startsWith(`covers/${configuration.entity}/${id}/${configuration.device}/`) || !uploadId || !parts.length) return Response.json({ error: "Upload de capa incompleto." }, { status: 400 });
        const object = await completeResumableUpload(uploadId);
        if (object.key !== key || object.size > MAX_IMAGE_SIZE) {
          if (object.key === key) await deleteObject(key).catch(() => undefined);
          return Response.json({ error: "A imagem final ultrapassou 12 MB ou não corresponde ao upload iniciado." }, { status: 413 });
        }
        await replaceArtwork(configuration.entity, configuration.device, id, key);
        return Response.json({ ok: true, key, size: object.size });
      }

      if (payload.action === "abort") {
        const key = payload.key ?? "";
        const uploadId = payload.uploadId ?? "";
        if (key.startsWith("covers/") && uploadId) await abortResumableUpload(uploadId).catch(() => undefined);
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

  const upstream = await fetchObject(key);
  if (!upstream.ok) return new Response("Imagem não encontrada", { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (request.headers.get("if-none-match") && request.headers.get("if-none-match") === headers.get("etag")) return new Response(null, { status: 304, headers });
  return new Response(upstream.body, { status: 200, headers });
}
