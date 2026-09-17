import { getD1 } from "../../../../../db";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState } from "../../../../lib/academic";
import { assessAnswer } from "../../../../lib/exercise-answers";
import { buildPracticePlan, parsePracticePlan, type PracticeExerciseSource } from "../../../../lib/practice-rotation";
import { getWeakSkills, masteryReached, scorePercentage } from "../../../../lib/learning-progress";

export const dynamic = "force-dynamic";

function parseAnswers(value?: string) {
  try { const parsed: unknown = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  const payload = await request.json() as { action?: "start" | "progress" | "complete"; reset?: boolean; answers?: string[]; score?: number; total?: number; currentIndex?: number };
  const db = getD1();
  const lesson = await db.prepare("SELECT l.id, l.title, l.smart_rotation AS smartRotation FROM lessons l WHERE l.id = ? AND l.status = 'Publicado' LIMIT 1").bind(lessonId).first<{ id: number; title: string; smartRotation: number | boolean }>();
  if (!lesson) return Response.json({ error: "Prática inválida ou sem exercícios publicados." }, { status: 404 });
  const academic = await computeAcademicState(auth.sub);
  const lessonState = academic.lessonStates.find((state: LessonAcademicState) => state.lessonId === lessonId);
  if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Conclua o vídeo da aula antes de iniciar os exercícios." }, { status: 403 });
  const now = new Date().toISOString();
  const [exerciseResult, current] = await Promise.all([
    db.prepare("SELECT id, exercise_type AS type, category, title, prompt, options_json AS optionsJson, correct_answer AS correct, accepted_answers_json AS acceptedJson, explanation, speech, audio_key AS audioKey, skills_json AS skillsJson, rotation_variants_json AS rotationVariantsJson FROM lesson_exercises WHERE lesson_id = ? AND status = 'Publicado' ORDER BY position, id").bind(lessonId).all<PracticeExerciseSource>(),
    db.prepare("SELECT current_index AS currentIndex, answers_json AS answersJson, score, total, status, exercise_plan_json AS exercisePlanJson FROM practice_sessions WHERE user_id = ? AND lesson_id = ? LIMIT 1").bind(auth.sub, lessonId).first<{ currentIndex: number; answersJson: string; score: number; total: number; status: "active" | "completed"; exercisePlanJson?: string }>(),
  ]);
  const sources = exerciseResult.results as PracticeExerciseSource[];
  if (!sources.length) return Response.json({ error: "Prática inválida ou sem exercícios publicados." }, { status: 404 });
  const previousPlan = parsePracticePlan(current?.exercisePlanJson);
  if (payload.action === "start") {
    if (current?.status === "active" && !payload.reset && !previousPlan.length) {
      const plan = buildPracticePlan(sources, false);
      await db.prepare("UPDATE practice_sessions SET exercise_plan_json = ?, total = ?, updated_at = ? WHERE user_id = ? AND lesson_id = ?").bind(JSON.stringify(plan), plan.length, now, auth.sub, lessonId).run();
      return Response.json({ session: { currentIndex: current.currentIndex, answers: parseAnswers(current.answersJson), score: current.score, total: plan.length, status: current.status } });
    }
    if (!current || payload.reset || current.status === "completed") {
      const plan = buildPracticePlan(sources, Boolean(lesson.smartRotation), previousPlan);
      await db.prepare("INSERT INTO practice_sessions (user_id, lesson_id, current_index, answers_json, score, total, status, exercise_plan_json, created_at, updated_at) VALUES (?, ?, 0, '[]', 0, ?, 'active', ?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_index = 0, answers_json = '[]', score = 0, total = excluded.total, status = 'active', exercise_plan_json = excluded.exercise_plan_json, created_at = excluded.created_at, updated_at = excluded.updated_at").bind(auth.sub, lessonId, plan.length, JSON.stringify(plan), now, now).run();
      return Response.json({ session: { currentIndex: 0, answers: [], score: 0, total: plan.length, status: "active" } });
    }
    return Response.json({ session: { currentIndex: current.currentIndex, answers: parseAnswers(current.answersJson), score: current.score, total: current.total, status: current.status } });
  }
  if (payload.action !== "progress" && payload.action !== "complete") return Response.json({ error: "Ação inválida." }, { status: 400 });
  const questionRows = previousPlan.length ? previousPlan : buildPracticePlan(sources, false);
  const total = questionRows.length;
  const answers = Array.isArray(payload.answers) ? payload.answers.slice(0, total).map((answer) => String(answer).slice(0, 1000)) : [];
  if (answers.some(answer => !answer.trim()) || !answers.length || (payload.action === "complete" && answers.length !== total)) return Response.json({ error: "Responda todos os exercícios antes de concluir." }, { status: 400 });
  const score = questionRows.reduce((sum, question, index) => sum + (assessAnswer(answers[index] ?? "", question.correct, question.accepted).status === "correct" ? 1 : 0), 0);
  const currentIndex = answers.length;
  if (payload.action === "progress") {
    await db.prepare("INSERT INTO practice_sessions (user_id, lesson_id, current_index, answers_json, score, total, status, exercise_plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_index = excluded.current_index, answers_json = excluded.answers_json, score = excluded.score, total = excluded.total, status = 'active', exercise_plan_json = excluded.exercise_plan_json, updated_at = excluded.updated_at").bind(auth.sub, lessonId, currentIndex, JSON.stringify(answers), score, total, JSON.stringify(questionRows), now, now).run();
    return Response.json({ ok: true, session: { currentIndex, answers, score, total, status: "active" } });
  }
  if (payload.action === "complete") {
    if (current?.status !== "active" || current.currentIndex < total || JSON.stringify(parseAnswers(current.answersJson)) !== JSON.stringify(answers)) {
      return Response.json({ error: "Esta tentativa já foi concluída ou ainda tem respostas pendentes." }, { status: 409 });
    }
    const lessonSlug = `lesson-${lessonId}-practice`;
    const results = questionRows.map((question, index) => ({
      exerciseId: question.id,
      tags: question.skills?.length ? question.skills : [question.category],
      correct: assessAnswer(answers[index], question.correct, question.accepted).status === "correct",
      lessonId,
      prompt: question.prompt,
      answer: answers[index],
      correctAnswer: question.correct,
      explanation: question.explanation,
    }));
    const percentage = scorePercentage(score, total);
    await db.batch([
      db.prepare("INSERT INTO exercise_attempts (user_id, lesson_id, lesson_slug, score, total, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(auth.sub, lessonId, lessonSlug, score, total, JSON.stringify({ answers, results }), now),
      db.prepare("INSERT INTO lesson_progress (user_id, lesson_id, lesson_slug, progress_percent, best_score, attempts_count, completed_at, updated_at) VALUES (?, ?, ?, 100, ?, 1, ?, ?) ON CONFLICT(user_id, lesson_slug) DO UPDATE SET lesson_id = excluded.lesson_id, progress_percent = 100, best_score = MAX(best_score, excluded.best_score), attempts_count = attempts_count + 1, completed_at = excluded.completed_at, updated_at = excluded.updated_at").bind(auth.sub, lessonId, lessonSlug, score, now, now),
      db.prepare("INSERT INTO practice_sessions (user_id, lesson_id, current_index, answers_json, score, total, status, exercise_plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_index = excluded.current_index, answers_json = excluded.answers_json, score = excluded.score, total = excluded.total, status = 'completed', exercise_plan_json = excluded.exercise_plan_json, updated_at = excluded.updated_at").bind(auth.sub, lessonId, total, JSON.stringify(answers), score, total, JSON.stringify(questionRows), now, now),
    ]);
    const updated = await computeAcademicState(auth.sub);
    return Response.json({ ok: true, percentage, masteryReached: masteryReached(percentage), weakSkills: getWeakSkills(results), nextStep: getNextLearningStep(updated), session: { currentIndex: total, answers, score, total, status: "completed" } });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
