import { assertSupabase, getSupabase } from "../../../../db/supabase";
import { computeAcademicState, type SectionAcademicState } from "../../../lib/academic";
import { requireAuth } from "../../../lib/auth";
import { rotateExamQuestions } from "../../../lib/learning-progress";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { sectionId: rawSectionId } = await params;
  const sectionId = Number(rawSectionId);
  const db = getSupabase();
  const [examResult, sectionResult, academic] = await Promise.all([
    db.from("section_exams").select("id,sectionId:section_id,title,description,passScore:pass_score").eq("section_id", sectionId).eq("status", "Publicado").maybeSingle(),
    db.from("course_sections").select("id,moduleId:module_id,title").eq("id", sectionId).eq("status", "Publicado").maybeSingle(),
    computeAcademicState(auth.sub),
  ]);
  const examRow = assertSupabase(examResult) as { id: number; sectionId: number; title: string; description: string; passScore: number } | null;
  const section = assertSupabase(sectionResult) as { id: number; moduleId: number; title: string } | null;
  if (!examRow || !section) return Response.json({ error: "Prova não encontrada." }, { status: 404 });
  const moduleResult = await db.from("course_modules").select("id,title,level").eq("id", section.moduleId).eq("status", "Publicado").maybeSingle();
  const courseModule = assertSupabase(moduleResult) as { id: number; title: string; level: string } | null;
  if (!courseModule) return Response.json({ error: "Prova não encontrada." }, { status: 404 });
  const exam = { ...examRow, sectionTitle: section.title, moduleTitle: courseModule.title, level: courseModule.level };
  const state = (academic.sectionStates as SectionAcademicState[]).find((item: SectionAcademicState) => item.sectionId === sectionId);
  if (!state) return Response.json({ error: "Matéria indisponível." }, { status: 404 });
  const [questionResult, firstLessonResult] = await Promise.all([
    db.from("section_exam_questions").select("id,type:question_type,category,prompt,optionsJson:options_json,position").eq("exam_id", exam.id).eq("status", "Publicado").order("position").order("id"),
    db.from("lessons").select("id").eq("section_id", sectionId).eq("status", "Publicado").order("position").order("id").limit(1).maybeSingle(),
  ]);
  const parsed = ((assertSupabase(questionResult) ?? []) as { id: number; type: string; category: string; prompt: string; optionsJson?: string; position: number }[]).map((question) => {
    let options: string[] = [];
    try { options = JSON.parse(question.optionsJson ?? "[]") as string[]; } catch { options = []; }
    return { id: question.id, type: question.type, category: question.category, prompt: question.prompt, options, position: question.position };
  });
  const firstLesson = assertSupabase(firstLessonResult) as { id: number } | null;
  return Response.json({ exam: { ...exam, passScore: state.examPassScore, questionCount: parsed.length, firstLessonId: firstLesson?.id }, questions: state.examUnlocked ? rotateExamQuestions(parsed, auth.sub, exam.id, state.examAttempts) : [], state }, { headers: { "cache-control": "private, no-store" } });
}
