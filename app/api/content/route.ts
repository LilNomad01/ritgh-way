import { ensureAuthSchema, requireAuth } from "../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const db = await ensureAuthSchema();
  const [modules, sections, lessons] = await Promise.all([
    db.prepare("SELECT id, title, level, description, status, position FROM course_modules WHERE status = 'Publicado' ORDER BY position, id").all(),
    db.prepare("SELECT id, module_id AS moduleId, title, position FROM course_sections ORDER BY module_id, position, id").all(),
    db.prepare("SELECT id, section_id AS sectionId, title, duration, lesson_type AS lessonType, status, position, video_key AS videoKey FROM lessons WHERE status = 'Publicado' ORDER BY section_id, position, id").all(),
  ]);
  return Response.json({ modules: modules.results, sections: sections.results, lessons: lessons.results }, { headers: { "cache-control": "private, max-age=60" } });
}
