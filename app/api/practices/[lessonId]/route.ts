import { getD1 } from "../../../../db";
import { requireAuth } from "../../../lib/auth";
import { computeAcademicState, type LessonAcademicState } from "../../../lib/academic";

export const dynamic = "force-dynamic";

type ExerciseRow = { id: number; type: string; category: string; title: string; prompt: string; optionsJson?: string; correct: string; acceptedJson?: string; explanation: string; speech?: string; skillsJson?: string };
type PracticeRow = { id: number; sectionId: number; title: string; duration: string; lessonType: string; imageKey?: string; imageMobileKey?: string; imageFit?: string; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number; level: string; moduleTitle: string; sectionTitle: string };

function parseList(value?: string) {
  try { return JSON.parse(value ?? "[]") as string[]; } catch { return []; }
}

export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  if (!lessonId) return Response.json({ error: "Prática inválida." }, { status: 400 });
  const db = getD1();
  const practice = await db.prepare(`SELECT l.id, l.section_id AS sectionId, l.title, l.duration, l.lesson_type AS lessonType,
    l.thumbnail_key AS imageKey, l.thumbnail_mobile_key AS imageMobileKey, l.thumbnail_fit AS imageFit, l.thumbnail_zoom AS imageZoom,
    l.thumbnail_overlay AS imageOverlay, l.thumbnail_position_x AS imagePositionX, l.thumbnail_position_y AS imagePositionY,
    m.level, m.title AS moduleTitle, s.title AS sectionTitle
    FROM lessons l JOIN course_sections s ON s.id = l.section_id JOIN course_modules m ON m.id = s.module_id
    WHERE l.id = ? AND l.status = 'Publicado' AND m.status = 'Publicado' LIMIT 1`).bind(lessonId).first<PracticeRow>();
  if (!practice) return Response.json({ error: "Prática não encontrada." }, { status: 404 });
  const [exerciseRows, attempts, sessionRow, academic] = await Promise.all([
    db.prepare("SELECT id, exercise_type AS type, category, title, prompt, options_json AS optionsJson, correct_answer AS correct, accepted_answers_json AS acceptedJson, explanation, speech, skills_json AS skillsJson FROM lesson_exercises WHERE lesson_id = ? AND status = 'Publicado' ORDER BY position, id").bind(lessonId).all<ExerciseRow>(),
    db.prepare("SELECT score, total, created_at AS createdAt FROM exercise_attempts WHERE user_id = ? AND lesson_id = ? ORDER BY created_at DESC").bind(auth.sub, lessonId).all<{ score: number; total: number; createdAt: string }>(),
    db.prepare("SELECT current_index AS currentIndex, answers_json AS answersJson, score, total, status FROM practice_sessions WHERE user_id = ? AND lesson_id = ? LIMIT 1").bind(auth.sub, lessonId).first<{ currentIndex: number; answersJson: string; score: number; total: number; status: "active" | "completed" }>(),
    computeAcademicState(auth.sub),
  ]);
  const lessonState = (academic.lessonStates as LessonAcademicState[]).find((state: LessonAcademicState) => state.lessonId === lessonId);
  if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Conclua o vídeo da aula para liberar esta prática." }, { status: 403 });
  const typedExercises = exerciseRows.results as ExerciseRow[];
  const typedAttempts = attempts.results as { score: number; total: number; createdAt: string }[];
  if (!typedExercises.length) return Response.json({ error: "Esta aula ainda não tem exercícios publicados." }, { status: 404 });
  const exercises = typedExercises.map((exercise) => ({ ...exercise, options: parseList(exercise.optionsJson), accepted: parseList(exercise.acceptedJson) }));
  const last = typedAttempts[0];
  const skills = Array.from(new Set(typedExercises.flatMap((exercise) => parseList(exercise.skillsJson))));
  const session = sessionRow ? { currentIndex: sessionRow.currentIndex, answers: parseList(sessionRow.answersJson), score: sessionRow.score, total: sessionRow.total, status: sessionRow.status } : undefined;
  return Response.json({ practice: { ...practice, exerciseCount: exercises.length, estimatedMinutes: Math.max(5, exercises.length * 2), skills, exercises, attemptsCount: typedAttempts.length, bestScore: typedAttempts.length ? Math.max(...typedAttempts.map((attempt) => attempt.score)) : undefined, lastScore: last?.score, lastTotal: last?.total, sessionStatus: session?.status, currentIndex: session?.currentIndex }, session }, { headers: { "cache-control": "private, no-store" } });
}
