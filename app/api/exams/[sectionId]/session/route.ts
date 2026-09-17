import { normalizeAnswer } from "../../../../lib/exercise-answers";
import { getD1 } from "../../../../../db";
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
  const db = getD1();
  const [exam, academic] = await Promise.all([
    db.prepare("SELECT id, title, pass_score AS passScore FROM section_exams WHERE section_id = ? AND status = 'Publicado' LIMIT 1").bind(sectionId).first<{ id: number; title: string; passScore: number }>(),
    computeAcademicState(auth.sub),
  ]);
  const sectionState = (academic.sectionStates as SectionAcademicState[]).find((state: SectionAcademicState) => state.sectionId === sectionId);
  if (!exam || !sectionState?.examUnlocked) return Response.json({ error: "Conclua todas as aulas desta matéria para liberar a prova." }, { status: 403 });
  const result = await db.prepare("SELECT id, category, prompt, correct_answer AS correctAnswer, accepted_answers_json AS acceptedAnswersJson, explanation FROM section_exam_questions WHERE exam_id = ? AND status = 'Publicado' ORDER BY position, id").bind(exam.id).all<{ id: number; category: string; prompt: string; correctAnswer: string; acceptedAnswersJson?: string; explanation: string }>();
  const questions = result.results as { id: number; category: string; prompt: string; correctAnswer: string; acceptedAnswersJson?: string; explanation: string }[];
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
  await db.prepare("INSERT INTO section_exam_attempts (user_id, exam_id, score, total, percentage, passed, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(auth.sub, exam.id, score, total, percentage, passed ? 1 : 0, JSON.stringify({ answers, results }), now).run();
  const updated = await computeAcademicState(auth.sub);
  return Response.json({ result: { title: exam.title, score, total, percentage, passed, passScore, weakSkills, review }, academic: updated, nextStep: getNextLearningStep(updated) });
}
