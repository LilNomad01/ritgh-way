import { normalizeAnswer } from "../../../../lib/exercise-answers";
import { assertSupabase, getSupabase } from "../../../../../db/supabase";
import { computeAcademicState, getNextLearningStep, type SectionAcademicState } from "../../../../lib/academic";
import { assertSameOrigin, requireAuth } from "../../../../lib/auth";
import { getWeakSkills, MASTERY_THRESHOLD } from "../../../../lib/learning-progress";

export const dynamic = "force-dynamic";

function normalize(value: string) {
  return normalizeAnswer(value);
}

function acceptedAnswers(correct: string, json?: string) {
  try { return [correct, ...(JSON.parse(json ?? "[]") as string[])].map(normalize); } catch { return [normalize(correct)]; }
}

export async function POST(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { sectionId: rawSectionId } = await params;
  const sectionId = Number(rawSectionId);
  const payload = await request.json() as { answers?: Record<string, string> };
  const db = getSupabase();
  const [examResult, academic] = await Promise.all([
    db.from("section_exams").select("id,title,passScore:pass_score").eq("section_id", sectionId).eq("status", "Publicado").maybeSingle(),
    computeAcademicState(auth.sub),
  ]);
  const exam = assertSupabase(examResult) as { id: number; title: string; passScore: number } | null;
  const sectionState = (academic.sectionStates as SectionAcademicState[]).find((state: SectionAcademicState) => state.sectionId === sectionId);
  if (!exam || !sectionState?.examUnlocked) return Response.json({ error: "Conclua todas as aulas desta matéria para liberar a prova." }, { status: 403 });
  const questionResult = await db.from("section_exam_questions").select("id,category,prompt,correctAnswer:correct_answer,acceptedAnswersJson:accepted_answers_json,explanation").eq("exam_id", exam.id).eq("status", "Publicado").order("position").order("id");
  const questions = (assertSupabase(questionResult) ?? []) as { id: number; category: string; prompt: string; correctAnswer: string; acceptedAnswersJson?: string; explanation: string }[];
  if (!questions.length) return Response.json({ error: "Esta prova ainda não tem questões publicadas." }, { status: 400 });
  const answers = payload.answers ?? {};
  if (questions.some((question) => !String(answers[String(question.id)] ?? "").trim())) return Response.json({ error: "Responda todas as questões antes de finalizar." }, { status: 400 });
  const review = questions.map((question) => {
    const answer = String(answers[String(question.id)] ?? "").slice(0, 1000);
    const correct = acceptedAnswers(question.correctAnswer, question.acceptedAnswersJson).includes(normalize(answer));
    return { questionId: question.id, prompt: question.prompt, answer, correctAnswer: question.correctAnswer, explanation: question.explanation, correct };
  });
  const score = review.filter((item) => item.correct).length;
  const total = questions.length;
  const percentage = Math.round((score / total) * 100);
  const passScore = Math.max(MASTERY_THRESHOLD, exam.passScore);
  const passed = percentage >= passScore;
  const results = review.map((item) => ({ questionId: item.questionId, tags: [questions.find((question) => question.id === item.questionId)?.category ?? "Avaliação"], correct: item.correct }));
  const weakSkills = getWeakSkills(results);
  const now = new Date().toISOString();
  assertSupabase(await db.from("section_exam_attempts").insert({ user_id: auth.sub, exam_id: exam.id, score, total, percentage, passed: passed ? 1 : 0, answers_json: JSON.stringify({ answers, results }), created_at: now }));
  const updated = await computeAcademicState(auth.sub);
  return Response.json({ result: { title: exam.title, score, total, percentage, passed, passScore, weakSkills, review }, academic: updated, nextStep: getNextLearningStep(updated) });
}
