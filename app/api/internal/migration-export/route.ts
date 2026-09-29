import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";

export const dynamic = "force-dynamic";

const TABLES = new Set([
  "auth_sessions",
  "course_modules",
  "course_sections",
  "exercise_attempts",
  "lesson_exercises",
  "lesson_progress",
  "lesson_videos",
  "lessons",
  "login_attempts",
  "placement_attempts",
  "practice_sessions",
  "section_exam_attempts",
  "section_exam_questions",
  "section_exams",
  "students",
  "user_accounts",
  "video_item_progress",
  "video_progress",
]);

function authorized(request: Request) {
  const secret = (env as unknown as { MIGRATION_EXPORT_SECRET?: string }).MIGRATION_EXPORT_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const table = url.searchParams.get("table");
  const key = url.searchParams.get("key");

  if (table) {
    if (!TABLES.has(table)) return Response.json({ error: "Invalid table" }, { status: 400 });
    const rows = await getD1().prepare(`SELECT * FROM ${table}`).all();
    return Response.json({ table, rows: rows.results }, { headers: { "cache-control": "no-store" } });
  }

  if (key) {
    if (!/^(covers|lessons|audio)\//.test(key)) return new Response("Invalid key", { status: 400 });
    const object = await (env.VIDEOS as R2Bucket).get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers({ "cache-control": "no-store" });
    object.writeHttpMetadata(headers);
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  }

  return Response.json({ error: "Select a table or key" }, { status: 400 });
}
