import { assertSupabase, getSupabase } from "../../../db/supabase";
import { requireAuth } from "../../lib/auth";
import { computeAcademicState } from "../../lib/academic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const db = getSupabase();
  const [moduleResult, sectionResult, lessonResult, academic] = await Promise.all([
    db.from("course_modules").select("id,title,level,description,status,position,cover_key,cover_mobile_key,cover_fit,cover_zoom,cover_overlay,cover_position_x,cover_position_y").eq("status", "Publicado").order("position").order("id"),
    db.from("course_sections").select("id,module_id,title,description,status,position,cover_key,cover_mobile_key,cover_fit,cover_zoom,cover_overlay,cover_position_x,cover_position_y").eq("status", "Publicado").order("module_id").order("position").order("id"),
    db.from("lessons").select("id,section_id,title,description,duration,lesson_type,status,position,video_key,thumbnail_key,thumbnail_mobile_key,thumbnail_fit,thumbnail_zoom,thumbnail_overlay,thumbnail_position_x,thumbnail_position_y").eq("status", "Publicado").order("section_id").order("position").order("id"),
    computeAcademicState(auth.sub),
  ]);
  const modules = (assertSupabase(moduleResult) ?? []).map(row => ({ ...row, imageKey: row.cover_key, imageMobileKey: row.cover_mobile_key, imageFit: row.cover_fit, imageZoom: row.cover_zoom, imageOverlay: row.cover_overlay, imagePositionX: row.cover_position_x, imagePositionY: row.cover_position_y }));
  const sections = (assertSupabase(sectionResult) ?? []).map(row => ({ ...row, moduleId: row.module_id, imageKey: row.cover_key, imageMobileKey: row.cover_mobile_key, imageFit: row.cover_fit, imageZoom: row.cover_zoom, imageOverlay: row.cover_overlay, imagePositionX: row.cover_position_x, imagePositionY: row.cover_position_y }));
  const lessons = (assertSupabase(lessonResult) ?? []).map(row => ({ ...row, sectionId: row.section_id, lessonType: row.lesson_type, videoKey: row.video_key, imageKey: row.thumbnail_key, imageMobileKey: row.thumbnail_mobile_key, imageFit: row.thumbnail_fit, imageZoom: row.thumbnail_zoom, imageOverlay: row.thumbnail_overlay, imagePositionX: row.thumbnail_position_x, imagePositionY: row.thumbnail_position_y }));
  return Response.json({ modules, sections, lessons, academic }, { headers: { "cache-control": "private, no-store" } });
}
