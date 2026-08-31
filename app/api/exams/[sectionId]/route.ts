import { getD1 } from "../../../../db";
import { computeAcademicState, type SectionAcademicState } from "../../../lib/academic";
import { requireAuth } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { sectionId: rawSectionId } = await params;
  const sectionId = Number(rawSectionId);
  const db = getD1();
  const [exam, academic] = await Promise.all([
    db.prepare(`SELECT e.id, e.section_id AS sectionId, e.title, e.description, e.pass_score AS passScore,
      s.title AS sectionTitle, m.title AS moduleTitle, m.level
      FROM section_exams e JOIN course_sections s ON s.id = e.section_id JOIN course_modules m ON m.id = s.module_id
      WHERE e.section_id = ? AND e.status = 'Publicado' LIMIT 1`).bind(sectionId).first<{ id: number; sectionId: number; title: string; description: string; passScore: number; sectionTitle: string; moduleTitle: string; level: string }>(),
    computeAcademicState(auth.sub),
  ]);
  if (!exam) return Response.json({ error: "Prova não encontrada." }, { status: 404 });
  const state = (academic.sectionStates as SectionAcademicState[]).find((item: SectionAcademicState) => item.sectionId === sectionId);
  if (!state) return Response.json({ error: "Matéria indisponível." }, { status: 404 });
  const questions = await db.prepare("SELECT id, question_type AS type, category, prompt, options_json AS optionsJson, position FROM section_exam_questions WHERE exam_id = ? AND status = 'Publicado' ORDER BY position, id").bind(exam.id).all<{ id: number; type: string; category: string; prompt: string; optionsJson?: string; position: number }>();
  const parsed = (questions.results as { id: number; type: string; category: string; prompt: string; optionsJson?: string; position: number }[]).map((question) => {
    let options: string[] = [];
    try { options = JSON.parse(question.optionsJson ?? "[]") as string[]; } catch { options = []; }
    return { id: question.id, type: question.type, category: question.category, prompt: question.prompt, options, position: question.position };
  });
  return Response.json({ exam: { ...exam, questionCount: parsed.length }, questions: parsed, state }, { headers: { "cache-control": "private, no-store" } });
}
