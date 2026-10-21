import { getD1 } from "../../../../db";
import { getSupabase } from "../../../../db/supabase";
import { hasMigrationAccess } from "../../../lib/migration-auth";

export const dynamic = "force-dynamic";

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

type Table = (typeof TABLES)[number];

function sourceKey(row: Record<string, unknown>, conflict: string) {
  return conflict.split(",").map(column => String(row[column])).join("\u0000");
}

async function copyTable(table: Table) {
  const source = await getD1().prepare(`SELECT * FROM ${table.name}`).all<Record<string, unknown>>();
  const rows = source.results ?? [];
  if (rows.length) {
    const result = await getSupabase().from(table.name).upsert(rows, { onConflict: table.conflict });
    if (result.error) throw new Error(`${table.name}: ${result.error.message}`);
  }

  const target = await getSupabase().from(table.name).select("*");
  if (target.error) throw new Error(`${table.name}: ${target.error.message}`);
  const copied = new Set((target.data as Record<string, unknown>[]).map(row => sourceKey(row, table.conflict)));
  const missing = rows.filter(row => !copied.has(sourceKey(row, table.conflict))).length;
  if (missing) throw new Error(`${table.name}: ${missing} registro(s) não foram confirmados no Supabase.`);
  return { source: rows.length, verified: rows.length };
}

export async function POST(request: Request) {
  if (!hasMigrationAccess(request)) return new Response("Not found", { status: 404 });
  try {
    const results: Record<string, { source: number; verified: number }> = {};
    for (const table of TABLES) results[table.name] = await copyTable(table);
    return Response.json({ ok: true, tables: results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao migrar o D1." }, { status: 500 });
  }
}
