import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { getSupabase } from "../../../../db/supabase";
import { objectInfo, removeStorageObject, uploadObject } from "../../../lib/storage";

export const dynamic = "force-dynamic";

const CONFIRMATION = "DELETE_D1_R2_AFTER_SUPABASE_VERIFICATION";
const TABLES = [
  { name: "students", conflict: "id" },
  { name: "course_modules", conflict: "id" },
  { name: "course_sections", conflict: "id" },
  { name: "lessons", conflict: "id" },
  { name: "lesson_exercises", conflict: "id" },
  { name: "user_accounts", conflict: "id" },
  { name: "auth_sessions", conflict: "id" },
  { name: "login_attempts", conflict: "identifier" },
  { name: "placement_attempts", conflict: "id" },
  { name: "lesson_progress", conflict: "id" },
  { name: "exercise_attempts", conflict: "id" },
  { name: "practice_sessions", conflict: "id" },
  { name: "video_progress", conflict: "id" },
  { name: "section_exams", conflict: "id" },
  { name: "section_exam_questions", conflict: "id" },
  { name: "section_exam_attempts", conflict: "id" },
  { name: "lesson_videos", conflict: "id" },
  { name: "video_item_progress", conflict: "user_id,video_id" },
  { name: "speaking_attempts", conflict: "id" },
] as const;
const DELETE_ORDER = [...TABLES].reverse();

function authorized(request: Request) {
  const secret = (env as unknown as { MIGRATION_EXPORT_SECRET?: string }).MIGRATION_EXPORT_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function rowKey(row: Record<string, unknown>, conflict: string) {
  return conflict.split(",").map(column => String(row[column])).join("\u0000");
}

async function syncD1() {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const source = await getD1().prepare(`SELECT * FROM ${table.name}`).all<Record<string, unknown>>();
    const rows = source.results ?? [];
    if (rows.length) {
      const copied = await getSupabase().from(table.name).upsert(rows, { onConflict: table.conflict });
      if (copied.error) throw new Error(`${table.name}: ${copied.error.message}`);
    }
    const target = await getSupabase().from(table.name).select("*");
    if (target.error) throw new Error(`${table.name}: ${target.error.message}`);
    const keys = new Set((target.data as Record<string, unknown>[]).map(row => rowKey(row, table.conflict)));
    if (rows.some(row => !keys.has(rowKey(row, table.conflict)))) throw new Error(`${table.name}: verificação de chaves falhou.`);
    counts[table.name] = rows.length;
  }
  return counts;
}

async function syncR2() {
  const bucket = env.VIDEOS as R2Bucket;
  const objects: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor });
    objects.push(...page.objects.map(object => ({ key: object.key, size: object.size })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  for (const object of objects) {
    const existing = await objectInfo(object.key).catch(() => null);
    if (existing) {
      if (Number(existing.size) !== object.size) throw new Error(`${object.key}: tamanho diverge no Supabase.`);
      continue;
    }
    const legacy = await bucket.get(object.key);
    if (!legacy) throw new Error(`${object.key}: objeto desapareceu durante a cópia.`);
    await uploadObject(object.key, legacy.body, legacy.httpMetadata?.contentType || "application/octet-stream");
    const copied = await objectInfo(object.key);
    if (!copied || Number(copied.size) !== object.size) {
      await removeStorageObject(object.key);
      throw new Error(`${object.key}: cópia não passou na verificação de tamanho.`);
    }
  }
  return objects;
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404 });
  const body = await request.json().catch(() => null) as { confirm?: string } | null;
  if (body?.confirm !== CONFIRMATION) return Response.json({ error: "Confirmação inválida." }, { status: 400 });
  try {
    const tables = await syncD1();
    const objects = await syncR2();
    await getD1().batch(DELETE_ORDER.map(table => getD1().prepare(`DELETE FROM ${table.name}`)));
    if (objects.length) await (env.VIDEOS as R2Bucket).delete(objects.map(object => object.key));

    for (const table of TABLES) {
      const remaining = await getD1().prepare(`SELECT COUNT(*) AS count FROM ${table.name}`).first<{ count: number }>();
      if (Number(remaining?.count)) throw new Error(`${table.name}: dados antigos ainda presentes.`);
    }
    const remainingObjects = await (env.VIDEOS as R2Bucket).list({ limit: 1 });
    if (remainingObjects.objects.length) throw new Error("R2 antigo ainda contém arquivos.");
    return Response.json({ ok: true, deletedRows: Object.values(tables).reduce((sum, count) => sum + count, 0), deletedObjects: objects.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao remover o armazenamento antigo." }, { status: 500 });
  }
}
