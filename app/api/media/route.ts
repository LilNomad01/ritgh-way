import { assertSupabase, getSupabase } from "../../../db/supabase";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";
import { removeObject, serveObject, uploadObject } from "../../lib/storage";

export const dynamic = "force-dynamic";

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
  const db = getSupabase();
  const previous = assertSupabase(await db.from(configuration.table).select(configuration.column).eq("id", id).maybeSingle()) as Record<string, string | null> | null;
  if (!previous) throw new Error("Conteúdo não encontrado.");
  assertSupabase(await db.from(configuration.table).update({ [configuration.column]: key }).eq("id", id));
  const previousKey = previous[configuration.column];
  if (previousKey?.startsWith("covers/") && previousKey !== key) {
    await removeObject(previousKey).catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const configuration = artworkConfiguration(url.searchParams.get("entity") ?? "", url.searchParams.get("device") ?? "desktop");
    const id = Number(url.searchParams.get("id"));
    const contentType = (request.headers.get("content-type") ?? "").split(";")[0];
    const declaredSize = Number(request.headers.get("content-length") ?? 0);
    if (!configuration || !Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Destino da capa inválido." }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return Response.json({ error: "Use uma imagem JPG, PNG, WebP ou AVIF." }, { status: 400 });
    if (declaredSize > MAX_IMAGE_SIZE) return Response.json({ error: "A imagem otimizada deve ter no máximo 12 MB." }, { status: 413 });
    const exists = assertSupabase(await getSupabase().from(configuration.table).select("id").eq("id", id).maybeSingle());
    if (!exists) return Response.json({ error: "Conteúdo não encontrado." }, { status: 404 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return Response.json({ error: "Arquivo vazio." }, { status: 400 });
    if (bytes.byteLength > MAX_IMAGE_SIZE) return Response.json({ error: "A imagem otimizada deve ter no máximo 12 MB." }, { status: 413 });
    const key = `covers/${configuration.entity}/${id}/${configuration.device}/${crypto.randomUUID()}-${safeName(decodeURIComponent(request.headers.get("x-file-name") ?? "capa.webp"))}`;
    await uploadObject(key, bytes, contentType);
    try {
      await replaceArtwork(configuration.entity, configuration.device, id, key);
    } catch (error) {
      await removeObject(key);
      throw error;
    }
    return Response.json({ ok: true, key, size: bytes.byteLength });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a imagem." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith("covers/")) return new Response("Imagem inválida", { status: 400 });
  return await serveObject(request, key, "private, max-age=31536000, immutable") ?? new Response("Imagem não encontrada", { status: 404 });
}
