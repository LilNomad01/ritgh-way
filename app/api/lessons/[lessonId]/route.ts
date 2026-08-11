import { ensureData } from "../../admin/route";
import { computeAcademicState, type LessonAcademicState } from "../../../lib/academic";
import { requireAuth } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  if (!lessonId) return Response.json({ error: "Aula inválida." }, { status: 400 });
  const db = await ensureData();
  const [lesson, academic] = await Promise.all([
    db.prepare(`SELECT l.id, l.section_id AS sectionId, l.title, l.description, l.duration, l.lesson_type AS lessonType,
      l.video_key AS videoKey, l.video_name AS videoName, l.video_size AS videoSize,
      l.thumbnail_key AS imageKey, l.thumbnail_mobile_key AS imageMobileKey, l.thumbnail_fit AS imageFit, l.thumbnail_zoom AS imageZoom,
      l.thumbnail_overlay AS imageOverlay, l.thumbnail_position_x AS imagePositionX, l.thumbnail_position_y AS imagePositionY,
      s.title AS sectionTitle, s.description AS sectionDescription, m.id AS moduleId, m.title AS moduleTitle, m.level
      FROM lessons l JOIN course_sections s ON s.id = l.section_id JOIN course_modules m ON m.id = s.module_id
      WHERE l.id = ? AND l.status = 'Publicado' AND s.status = 'Publicado' AND m.status = 'Publicado' LIMIT 1`).bind(lessonId).first(),
    computeAcademicState(auth.sub),
  ]);
  if (!lesson) return Response.json({ error: "Aula não encontrada." }, { status: 404 });
  const state = (academic.lessonStates as LessonAcademicState[]).find((item: LessonAcademicState) => item.lessonId === lessonId);
  if (!state) return Response.json({ error: "Aula indisponível." }, { status: 404 });
  return Response.json({ lesson, state }, { headers: { "cache-control": "private, no-store" } });
}
