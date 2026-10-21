import { assertSupabase, getSupabase } from "../../../db/supabase";
import { requireAuth } from "../../lib/auth";
import { computeAcademicState, type LessonAcademicState } from "../../lib/academic";

export const dynamic = "force-dynamic";

type PracticeRow = { id: number; sectionId: number; title: string; duration: string; lessonType: string; smartRotation: number | boolean; imageKey?: string; imageMobileKey?: string; imageFit?: string; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number; level: string; moduleTitle: string; sectionTitle: string; exerciseCount: number; skillsJson?: string };
type AttemptRow = { lessonId?: number; lessonSlug: string; score: number; total: number; createdAt: string };
type SessionRow = { lessonId: number; currentIndex: number; status: "active" | "completed" };

function stringList(value?: string) {
  try { return JSON.parse(value ?? "[]") as string[]; } catch { return []; }
}

function lessonSlug(title: string) {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const db = getSupabase();
  const [moduleResult, sectionResult, lessonResult, exerciseResult, attemptResult, sessionResult, academic] = await Promise.all([
    db.from("course_modules").select("id,title,level,description,status,position,imageKey:cover_key,imageMobileKey:cover_mobile_key,imageFit:cover_fit,imageZoom:cover_zoom,imageOverlay:cover_overlay,imagePositionX:cover_position_x,imagePositionY:cover_position_y").eq("status", "Publicado").order("position").order("id"),
    db.from("course_sections").select("id,moduleId:module_id,title,position,imageKey:cover_key,imageMobileKey:cover_mobile_key,imageFit:cover_fit,imageZoom:cover_zoom,imageOverlay:cover_overlay,imagePositionX:cover_position_x,imagePositionY:cover_position_y").eq("status", "Publicado").order("module_id").order("position").order("id"),
    db.from("lessons").select("id,sectionId:section_id,title,duration,lessonType:lesson_type,smartRotation:smart_rotation,imageKey:thumbnail_key,imageMobileKey:thumbnail_mobile_key,imageFit:thumbnail_fit,imageZoom:thumbnail_zoom,imageOverlay:thumbnail_overlay,imagePositionX:thumbnail_position_x,imagePositionY:thumbnail_position_y,position").eq("status", "Publicado").order("position").order("id"),
    db.from("lesson_exercises").select("lessonId:lesson_id,skillsJson:skills_json").eq("status", "Publicado"),
    db.from("exercise_attempts").select("lessonId:lesson_id,lessonSlug:lesson_slug,score,total,createdAt:created_at").eq("user_id", auth.sub).order("created_at", { ascending: false }),
    db.from("practice_sessions").select("lessonId:lesson_id,currentIndex:current_index,status").eq("user_id", auth.sub),
    computeAcademicState(auth.sub),
  ]);
  const modules = assertSupabase(moduleResult) ?? [];
  const sections = assertSupabase(sectionResult) ?? [];
  const sectionById = new Map((sections as { id: number; moduleId: number; title: string }[]).map(section => [section.id, section]));
  const moduleById = new Map((modules as { id: number; title: string; level: string }[]).map(module => [module.id, module]));
  const exercisesByLesson = new Map<number, { skillsJson?: string }[]>();
  for (const exercise of (assertSupabase(exerciseResult) ?? []) as { lessonId: number; skillsJson?: string }[]) exercisesByLesson.set(exercise.lessonId, [...(exercisesByLesson.get(exercise.lessonId) ?? []), exercise]);
  const practiceRows = ((assertSupabase(lessonResult) ?? []) as Omit<PracticeRow, "exerciseCount" | "skillsJson" | "level" | "moduleTitle" | "sectionTitle">[]).flatMap(lesson => {
    const section = sectionById.get(lesson.sectionId);
    const courseModule = section ? moduleById.get(section.moduleId) : undefined;
    const exercises = exercisesByLesson.get(lesson.id) ?? [];
    return section && courseModule && exercises.length ? [{ ...lesson, level: courseModule.level, moduleTitle: courseModule.title, sectionTitle: section.title, exerciseCount: exercises.length, skillsJson: exercises.map(item => item.skillsJson ?? "[]").join("||") }] : [];
  });
  const sessionByLesson = new Map(((assertSupabase(sessionResult) ?? []) as SessionRow[]).map((session) => [session.lessonId, session]));
  const attemptRows = (assertSupabase(attemptResult) ?? []) as AttemptRow[];
  const stateByLesson = new Map<number, LessonAcademicState>((academic.lessonStates as LessonAcademicState[]).map((state: LessonAcademicState) => [state.lessonId, state]));
  const practices = (practiceRows as PracticeRow[]).filter((row) => {
    const state = stateByLesson.get(row.id);
    return Boolean(state?.unlocked && state.videoStatus === "completed");
  }).map((row) => {
    const slug = lessonSlug(row.title);
    const lessonAttempts = attemptRows.filter((attempt) => attempt.lessonId === row.id || attempt.lessonSlug === slug || attempt.lessonSlug === `${slug}-practice` || attempt.lessonSlug === `lesson-${row.id}-practice`);
    const last = lessonAttempts[0];
    const session = sessionByLesson.get(row.id);
    const skills = Array.from(new Set((row.skillsJson ?? "").split("||").flatMap((value) => stringList(value))));
    return { ...row, smartRotation: Boolean(row.smartRotation), exerciseCount: Number(row.exerciseCount), estimatedMinutes: Math.max(5, Number(row.exerciseCount) * 2), skills, attemptsCount: lessonAttempts.length, bestScore: lessonAttempts.length ? Math.max(...lessonAttempts.map((attempt) => attempt.score)) : undefined, lastScore: last?.score, lastTotal: last?.total, currentIndex: session?.currentIndex, sessionStatus: session?.status };
  });
  return Response.json({ modules, sections, practices }, { headers: { "cache-control": "private, no-store" } });
}
