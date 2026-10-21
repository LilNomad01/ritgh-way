import { assertSupabase, getSupabase } from "../../../../../db/supabase";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";
import { computeAcademicState, getNextLearningStep, type LessonAcademicState } from "../../../../lib/academic";
import { assessAnswer } from "../../../../lib/exercise-answers";
import { buildPracticePlan, parsePracticePlan, type PracticeExerciseSource } from "../../../../lib/practice-rotation";
import { getWeakSkills, masteryReached, scorePercentage } from "../../../../lib/learning-progress";

export const dynamic = "force-dynamic";

function parseAnswers(value?: string) {
  try { const parsed: unknown = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function parseSpeakingAttempts(value?: string) {
  try { const parsed: unknown = JSON.parse(value ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number> : {}; } catch { return {}; }
}

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { lessonId: rawLessonId } = await params;
  const lessonId = Number(rawLessonId);
  const payload = await request.json() as { action?: "start" | "progress" | "complete"; reset?: boolean; answers?: string[]; speakingAttemptIds?: Record<string, number>; score?: number; total?: number; currentIndex?: number };
  const db = getSupabase();
  const lesson = assertSupabase(await db.from("lessons").select("id,title,smartRotation:smart_rotation").eq("id", lessonId).eq("status", "Publicado").maybeSingle()) as { id: number; title: string; smartRotation: number | boolean } | null;
  if (!lesson) return Response.json({ error: "Prática inválida ou sem exercícios publicados." }, { status: 404 });
  const academic = await computeAcademicState(auth.sub);
  const lessonState = academic.lessonStates.find((state: LessonAcademicState) => state.lessonId === lessonId);
  if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Conclua o vídeo da aula antes de iniciar os exercícios." }, { status: 403 });
  const now = new Date().toISOString();
  const [exerciseResult, currentResult] = await Promise.all([
    db.from("lesson_exercises").select("id,type:exercise_type,category,title,prompt,optionsJson:options_json,correct:correct_answer,acceptedJson:accepted_answers_json,explanation,speech,audioKey:audio_key,skillsJson:skills_json,rotationVariantsJson:rotation_variants_json").eq("lesson_id", lessonId).eq("status", "Publicado").order("position").order("id"),
    db.from("practice_sessions").select("id,currentIndex:current_index,answersJson:answers_json,score,total,status,exercisePlanJson:exercise_plan_json,speakingAttemptIdsJson:speaking_attempt_ids_json").eq("user_id", auth.sub).eq("lesson_id", lessonId).maybeSingle(),
  ]);
  const sources = (assertSupabase(exerciseResult) ?? []) as PracticeExerciseSource[];
  const current = assertSupabase(currentResult) as { id: number; currentIndex: number; answersJson: string; score: number; total: number; status: "active" | "completed"; exercisePlanJson?: string; speakingAttemptIdsJson?: string } | null;
  if (!sources.length) return Response.json({ error: "Prática inválida ou sem exercícios publicados." }, { status: 404 });
  const previousPlan = parsePracticePlan(current?.exercisePlanJson);
  if (payload.action === "start") {
    if (current?.status === "active" && !payload.reset && !previousPlan.length) {
      const plan = buildPracticePlan(sources, false);
      assertSupabase(await db.from("practice_sessions").update({ exercise_plan_json: JSON.stringify(plan), total: plan.length, updated_at: now }).eq("user_id", auth.sub).eq("lesson_id", lessonId));
      return Response.json({ session: { currentIndex: current.currentIndex, answers: parseAnswers(current.answersJson), speakingAttemptIds: parseSpeakingAttempts(current.speakingAttemptIdsJson), score: current.score, total: plan.length, status: current.status } });
    }
    if (!current || payload.reset || current.status === "completed") {
      const plan = buildPracticePlan(sources, Boolean(lesson.smartRotation), previousPlan);
      assertSupabase(await db.from("practice_sessions").upsert({ user_id: auth.sub, lesson_id: lessonId, current_index: 0, answers_json: "[]", score: 0, total: plan.length, status: "active", exercise_plan_json: JSON.stringify(plan), speaking_attempt_ids_json: "{}", created_at: now, updated_at: now }, { onConflict: "user_id,lesson_id" }));
      return Response.json({ session: { currentIndex: 0, answers: [], speakingAttemptIds: {}, score: 0, total: plan.length, status: "active" } });
    }
    return Response.json({ session: { currentIndex: current.currentIndex, answers: parseAnswers(current.answersJson), speakingAttemptIds: parseSpeakingAttempts(current.speakingAttemptIdsJson), score: current.score, total: current.total, status: current.status } });
  }
  if (payload.action !== "progress" && payload.action !== "complete") return Response.json({ error: "Ação inválida." }, { status: 400 });
  const questionRows = previousPlan.length ? previousPlan : buildPracticePlan(sources, false);
  const total = questionRows.length;
  const answers = Array.isArray(payload.answers) ? payload.answers.slice(0, total).map((answer) => String(answer).slice(0, 1000)) : [];
  if (answers.some(answer => !answer.trim()) || !answers.length || (payload.action === "complete" && answers.length !== total)) return Response.json({ error: "Responda todos os exercícios antes de concluir." }, { status: 400 });
  const currentIndex = answers.length;
  const speakingAttemptIds = Object.fromEntries(Object.entries(payload.speakingAttemptIds ?? {}).filter(([key, value]) => Number(key) > 0 && Number(value) > 0).map(([key, value]) => [key, Number(value)]));
  type SpeakingRow = { id: number; exerciseId: number; conceptualStatus: string; resultJson: string };
  const speakingByExercise = new Map<number, SpeakingRow>();
  for (let index = 0; index < answers.length; index += 1) {
    const question = questionRows[index];
    if (!question || !["speaking", "choice_speaking"].includes(question.type)) continue;
    const attemptId = speakingAttemptIds[String(question.id)];
    const attempt = attemptId && current?.id ? assertSupabase(await db.from("speaking_attempts").select("id,exerciseId:exercise_id,conceptualStatus:conceptual_status,resultJson:result_json").eq("id", attemptId).eq("user_id", auth.sub).eq("exercise_id", question.id).eq("practice_session_id", current.id).eq("status", "completed").maybeSingle()) as SpeakingRow | null : null;
    if (!attempt) return Response.json({ error: "Confirme a gravação de speaking antes de continuar." }, { status: 400 });
    speakingByExercise.set(question.id, attempt);
  }
  const score = questionRows.reduce((sum, question, index) => {
    const correct = question.type === "speaking"
      ? speakingByExercise.get(question.id)?.conceptualStatus === "correct"
      : assessAnswer(answers[index] ?? "", question.correct, question.accepted).status === "correct";
    return sum + (correct ? 1 : 0);
  }, 0);
  if (payload.action === "progress") {
    assertSupabase(await db.from("practice_sessions").upsert({ user_id: auth.sub, lesson_id: lessonId, current_index: currentIndex, answers_json: JSON.stringify(answers), score, total, status: "active", exercise_plan_json: JSON.stringify(questionRows), speaking_attempt_ids_json: JSON.stringify(speakingAttemptIds), created_at: current ? undefined : now, updated_at: now }, { onConflict: "user_id,lesson_id" }));
    return Response.json({ ok: true, session: { currentIndex, answers, score, total, status: "active" } });
  }
  if (payload.action === "complete") {
    if (current?.status !== "active" || current.currentIndex < total || JSON.stringify(parseAnswers(current.answersJson)) !== JSON.stringify(answers)) {
      return Response.json({ error: "Esta tentativa já foi concluída ou ainda tem respostas pendentes." }, { status: 409 });
    }
    const lessonSlug = `lesson-${lessonId}-practice`;
    const results = questionRows.flatMap((question, index) => [{
      exerciseId: question.id,
      tags: question.skills?.length ? question.skills : [question.category],
      correct: question.type === "speaking" ? speakingByExercise.get(question.id)?.conceptualStatus === "correct" : assessAnswer(answers[index], question.correct, question.accepted).status === "correct",
      lessonId,
      prompt: question.prompt,
      answer: answers[index],
      correctAnswer: question.correct,
      explanation: question.explanation,
      dimension: "conceptual",
    }, ...(["speaking", "choice_speaking"].includes(question.type) && speakingByExercise.has(question.id) ? [{ exerciseId: question.id, tags: ["speaking", ...(question.skills ?? [])], correct: speakingByExercise.get(question.id)?.conceptualStatus === "correct", lessonId, dimension: "speaking", speakingAttemptId: speakingByExercise.get(question.id)?.id }] : [])]);
    const percentage = scorePercentage(score, total);
    const previousProgress = assertSupabase(await db.from("lesson_progress").select("best_score,attempts_count").eq("user_id", auth.sub).eq("lesson_slug", lessonSlug).maybeSingle()) as { best_score: number; attempts_count: number } | null;
    const attemptWrite = await db.from("exercise_attempts").insert({ user_id: auth.sub, lesson_id: lessonId, lesson_slug: lessonSlug, score, total, answers_json: JSON.stringify({ answers, results }), created_at: now });
    assertSupabase(attemptWrite);
    const progressWrite = await db.from("lesson_progress").upsert({ user_id: auth.sub, lesson_id: lessonId, lesson_slug: lessonSlug, progress_percent: 100, best_score: Math.max(previousProgress?.best_score ?? 0, score), attempts_count: (previousProgress?.attempts_count ?? 0) + 1, completed_at: now, updated_at: now }, { onConflict: "user_id,lesson_slug" });
    assertSupabase(progressWrite);
    const sessionWrite = await db.from("practice_sessions").upsert({ user_id: auth.sub, lesson_id: lessonId, current_index: total, answers_json: JSON.stringify(answers), score, total, status: "completed", exercise_plan_json: JSON.stringify(questionRows), speaking_attempt_ids_json: JSON.stringify(speakingAttemptIds), created_at: current ? undefined : now, updated_at: now }, { onConflict: "user_id,lesson_id" });
    assertSupabase(sessionWrite);
    const updated = await computeAcademicState(auth.sub);
    return Response.json({ ok: true, percentage, masteryReached: masteryReached(percentage), weakSkills: getWeakSkills(results), nextStep: getNextLearningStep(updated), session: { currentIndex: total, answers, score, total, status: "completed" } });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
