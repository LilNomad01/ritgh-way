import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { assertSameOrigin, requireAdmin, requireAuth } from "../../lib/auth";

export const dynamic = "force-dynamic";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function storage() {
  return env.VIDEOS as R2Bucket;
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const form = await request.formData();
    const file = form.get("file");
    const entity = String(form.get("entity") ?? "");
    const id = Number(form.get("id"));
    if (!(file instanceof File) || !id || !["module", "section", "lesson"].includes(entity)) return Response.json({ error: "Selecione uma imagem válida." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "O arquivo precisa ser uma imagem." }, { status: 400 });
    if (file.size > MAX_IMAGE_SIZE) return Response.json({ error: "A imagem deve ter no máximo 10 MB." }, { status: 413 });

    const key = `covers/${entity}/${id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    await storage().put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "private, max-age=86400" } });
    const mapping = entity === "module" ? ["course_modules", "cover_key"] : entity === "section" ? ["course_sections", "cover_key"] : ["lessons", "thumbnail_key"];
    await getD1().prepare(`UPDATE ${mapping[0]} SET ${mapping[1]} = ? WHERE id = ?`).bind(key, id).run();
    return Response.json({ ok: true, key });
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
