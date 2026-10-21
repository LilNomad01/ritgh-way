import { assertSupabase, getSupabase } from "../../../../db/supabase";
import { requireAuth } from "../../../lib/auth";
import { computeAcademicState, type LessonAcademicState } from "../../../lib/academic";
import { parsePracticePlan, parseStringList, type PracticeExerciseSource } from "../../../lib/practice-rotation";

export const dynamic = "force-dynamic";

type ExerciseRow = PracticeExerciseSource;
type PracticeRow = { id: number; sectionId: number; title: string; duration: string; lessonType: string; smartRotation: number | boolean; imageKey?: string; imageMobileKey?: string; imageFit?: string; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number; level: string; moduleTitle: string; sectionTitle: string };

function parseList(value?: string) {
  try { return JSON.parse(value ?? "[]") as string[]; } catch { return []; }
}

function parseSpeakingAttempts(value?: string) {
  try { const parsed: unknown = JSON.parse(value ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number> : {}; } catch { return {}; }
}

function lessonSlug(title: string) {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  if (!lessonId) return Response.json({ error: "Prática inválida." }, { status: 400 });
  const db = getSupabase();
  const lessonResult = await db.from("lessons").select("id,sectionId:section_id,title,duration,lessonType:lesson_type,smartRotation:smart_rotation,imageKey:thumbnail_key,imageMobileKey:thumbnail_mobile_key,imageFit:thumbnail_fit,imageZoom:thumbnail_zoom,imageOverlay:thumbnail_overlay,imagePositionX:thumbnail_position_x,imagePositionY:thumbnail_position_y").eq("id", lessonId).eq("status", "Publicado").maybeSingle();
  const lesson = assertSupabase(lessonResult) as Omit<PracticeRow, "level" | "moduleTitle" | "sectionTitle"> | null;
  if (!lesson) return Response.json({ error: "Prática não encontrada." }, { status: 404 });
  const [sectionResult, exerciseResult, attemptResult, sessionResult, academic] = await Promise.all([
    db.from("course_sections").select("id,moduleId:module_id,title").eq("id", lesson.sectionId).eq("status", "Publicado").maybeSingle(),
    db.from("lesson_exercises").select("id,type:exercise_type,category,title,prompt,optionsJson:options_json,correct:correct_answer,acceptedJson:accepted_answers_json,explanation,speech,audioKey:audio_key,skillsJson:skills_json,rotationVariantsJson:rotation_variants_json").eq("lesson_id", lessonId).eq("status", "Publicado").order("position").order("id"),
    db.from("exercise_attempts").select("lessonId:lesson_id,lessonSlug:lesson_slug,score,total,createdAt:created_at").eq("user_id", auth.sub).order("created_at", { ascending: false }),
    db.from("practice_sessions").select("currentIndex:current_index,answersJson:answers_json,score,total,status,exercisePlanJson:exercise_plan_json,speakingAttemptIdsJson:speaking_attempt_ids_json").eq("user_id", auth.sub).eq("lesson_id", lessonId).maybeSingle(),
    computeAcademicState(auth.sub),
  ]);
  const section = assertSupabase(sectionResult) as { id: number; moduleId: number; title: string } | null;
  const moduleResult = section ? await db.from("course_modules").select("id,title,level").eq("id", section.moduleId).eq("status", "Publicado").maybeSingle() : { data: null, error: null };
  const courseModule = assertSupabase(moduleResult) as { id: number; title: string; level: string } | null;
  if (!section || !courseModule) return Response.json({ error: "Prática não encontrada." }, { status: 404 });
  const practice: PracticeRow = { ...lesson, level: courseModule.level, moduleTitle: courseModule.title, sectionTitle: section.title };
  const lessonState = (academic.lessonStates as LessonAcademicState[]).find((state: LessonAcademicState) => state.lessonId === lessonId);
  if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Conclua o vídeo da aula para liberar esta prática." }, { status: 403 });
  const typedExercises = (assertSupabase(exerciseResult) ?? []) as ExerciseRow[];
  const slug = lessonSlug(practice.title);
  const typedAttempts = ((assertSupabase(attemptResult) ?? []) as { lessonId?: number; lessonSlug: string; score: number; total: number; createdAt: string }[]).filter(attempt => attempt.lessonId === lessonId || attempt.lessonSlug === slug || attempt.lessonSlug === `${slug}-practice` || attempt.lessonSlug === `lesson-${lessonId}-practice`);
  const sessionRow = assertSupabase(sessionResult) as { currentIndex: number; answersJson: string; score: number; total: number; status: "active" | "completed"; exercisePlanJson?: string; speakingAttemptIdsJson?: string } | null;
  if (!typedExercises.length) return Response.json({ error: "Esta aula ainda não tem exercícios publicados." }, { status: 404 });
  const storedPlan = parsePracticePlan(sessionRow?.exercisePlanJson);
  const exercises = storedPlan.length ? storedPlan : typedExercises.map((exercise) => ({ ...exercise, options: parseStringList(exercise.optionsJson), accepted: parseStringList(exercise.acceptedJson), skills: parseStringList(exercise.skillsJson), variantKey: -1 }));
  const last = typedAttempts[0];
  const skills = Array.from(new Set(exercises.flatMap((exercise) => exercise.skills ?? [])));
  const session = sessionRow ? { currentIndex: sessionRow.currentIndex, answers: parseList(sessionRow.answersJson), speakingAttemptIds: parseSpeakingAttempts(sessionRow.speakingAttemptIdsJson), score: sessionRow.score, total: sessionRow.total, status: sessionRow.status } : undefined;
  return Response.json({ practice: { ...practice, smartRotation: Boolean(practice.smartRotation), exerciseCount: exercises.length, estimatedMinutes: Math.max(5, exercises.length * 2), skills, exercises, attemptsCount: typedAttempts.length, bestScore: typedAttempts.length ? Math.max(...typedAttempts.map((attempt) => attempt.score)) : undefined, lastScore: last?.score, lastTotal: last?.total, sessionStatus: session?.status, currentIndex: session?.currentIndex }, session }, { headers: { "cache-control": "private, no-store" } });
}
