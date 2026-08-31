import { getD1 } from "../../../db";
import { requireAuth } from "../../lib/auth";
import { computeAcademicState } from "../../lib/academic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const db = getD1();
  const [content, academic] = await Promise.all([
    db.batch([
      db.prepare("SELECT id, title, level, description, status, position, cover_key AS imageKey, cover_mobile_key AS imageMobileKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_modules WHERE status = 'Publicado' ORDER BY position, id"),
      db.prepare("SELECT id, module_id AS moduleId, title, description, status, position, cover_key AS imageKey, cover_mobile_key AS imageMobileKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_sections WHERE status = 'Publicado' ORDER BY module_id, position, id"),
      db.prepare("SELECT id, section_id AS sectionId, title, description, duration, lesson_type AS lessonType, status, position, video_key AS videoKey, thumbnail_key AS imageKey, thumbnail_mobile_key AS imageMobileKey, thumbnail_fit AS imageFit, thumbnail_zoom AS imageZoom, thumbnail_overlay AS imageOverlay, thumbnail_position_x AS imagePositionX, thumbnail_position_y AS imagePositionY FROM lessons WHERE status = 'Publicado' ORDER BY section_id, position, id"),
    ]),
    computeAcademicState(auth.sub),
  ]);
  const [modules, sections, lessons] = content;
  return Response.json({ modules: modules.results, sections: sections.results, lessons: lessons.results, academic }, { headers: { "cache-control": "private, no-store" } });
}
