import { env } from "cloudflare:workers";
import { getStorageBucket, getSupabase } from "../../../../db/supabase";
import { assertSameOrigin, requireAdmin } from "../../../lib/auth";
import { objectInfo, removeStorageObject, uploadObject } from "../../../lib/storage";

export const dynamic = "force-dynamic";

async function referencedKeys() {
  const db = getSupabase();
  const results = await Promise.all([
    db.from("course_modules").select("cover_key,cover_mobile_key"),
    db.from("course_sections").select("cover_key,cover_mobile_key"),
    db.from("lessons").select("thumbnail_key,thumbnail_mobile_key,video_key"),
    db.from("lesson_videos").select("video_key"),
    db.from("lesson_exercises").select("audio_key"),
  ]);
  const keys = new Set<string>();
  for (const result of results) {
    if (result.error) throw new Error(`Supabase: ${result.error.message}`);
    for (const row of result.data as Record<string, string | null>[]) {
      for (const value of Object.values(row)) if (value) keys.add(value);
    }
  }
  return [...keys].sort();
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  const keys = await referencedKeys();
  const states = await Promise.all(keys.map(async key => ({ key, migrated: Boolean(await objectInfo(key).catch(() => null)) })));
  return Response.json({ bucket: getStorageBucket(), total: states.length, migrated: states.filter(state => state.migrated).length, pending: states.filter(state => !state.migrated).map(state => state.key) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const key = String((await request.json() as { key?: string }).key ?? "");
    if (!(await referencedKeys()).includes(key)) return Response.json({ error: "Arquivo não referenciado pelo curso." }, { status: 400 });
    const existing = await objectInfo(key).catch(() => null);
    if (existing) return Response.json({ ok: true, key, size: Number(existing.size) || 0, alreadyMigrated: true });
    const legacy = await (env.VIDEOS as R2Bucket).get(key);
    if (!legacy) return Response.json({ error: "Arquivo não encontrado no armazenamento antigo." }, { status: 404 });
    await uploadObject(key, legacy.body, legacy.httpMetadata?.contentType || "application/octet-stream");
    const copied = await objectInfo(key);
    if (!copied || Number(copied.size) !== legacy.size) {
      await removeStorageObject(key);
      return Response.json({ error: "A cópia não passou na verificação de tamanho. A origem foi preservada." }, { status: 502 });
    }
    return Response.json({ ok: true, key, size: legacy.size });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível migrar o arquivo. A origem foi preservada." }, { status: 500 });
  }
}
