import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const lessonId = Number(form.get("lessonId"));
    if (!(file instanceof File) || !lessonId) return Response.json({ error: "Selecione uma aula e um vídeo." }, { status: 400 });
    if (!file.type.startsWith("video/")) return Response.json({ error: "O arquivo precisa ser um vídeo." }, { status: 400 });
    const bucket = env.VIDEOS as R2Bucket;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const key = `lessons/${lessonId}/${crypto.randomUUID()}-${safeName}`;
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await getD1().prepare("UPDATE lessons SET video_key = ?, video_name = ?, video_size = ? WHERE id = ?").bind(key, file.name, file.size, lessonId).run();
    return Response.json({ ok: true, key, name: file.name, size: file.size });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha no upload." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("lessons/")) return new Response("Arquivo inválido", { status: 400 });
  const object = await (env.VIDEOS as R2Bucket).get(key);
  if (!object) return new Response("Vídeo não encontrado", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}
