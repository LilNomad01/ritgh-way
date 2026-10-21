import { assertSupabase, getSupabase } from "../../../db/supabase";
import { assertSameOrigin, hashPassword, passwordPolicyError, randomSecret, requireAdmin } from "../../lib/auth";
import { exerciseTypes, isChoice, isListening, normalizeAnswer } from "../../lib/exercise-answers";
import { MASTERY_THRESHOLD } from "../../lib/learning-progress";

export const dynamic = "force-dynamic";

type Entity = "student" | "module" | "section" | "lesson" | "exercise" | "exam" | "examQuestion";
type ReorderEntity = "section" | "lesson" | "exercise" | "examQuestion";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function exerciseError(payload: Record<string, unknown>) {
  const type = clean(payload.exerciseType);
  if (!(type in exerciseTypes) && type !== "listening") return "Tipo de exercício inválido.";
  if (!clean(payload.title) || !clean(payload.prompt) || !clean(payload.correctAnswer) || !clean(payload.explanation)) return "Preencha título, enunciado, resposta e explicação.";
  if (clean(payload.correctAnswer).length > 1000) return "A resposta deve ter no máximo 1000 caracteres.";
  if (isListening(type)) {
    if (!clean(payload.speech)) return "Informe o texto que o aluno vai ouvir.";
    if (normalizeAnswer(clean(payload.speech)) !== normalizeAnswer(clean(payload.correctAnswer))) return "Na transcrição, a resposta correta deve corresponder ao texto do áudio.";
  }
  if (isChoice(type)) {
    const options = JSON.parse(jsonArray(payload.optionsJson, "Opções")) as string[];
    if (options.length < 2 || new Set(options).size !== options.length || !options.includes(clean(payload.correctAnswer))) return "Cadastre ao menos duas opções diferentes, incluindo a resposta correta.";
  }
  return null;
}

function examQuestionError(payload: Record<string, unknown>) {
  if (isListening(clean(payload.questionType))) return "Use os formatos de escrita, correção ou contexto nesta prova.";
  return exerciseError({ ...payload, exerciseType: payload.questionType, title: "Questão da prova" });
}

function jsonArray(value: unknown, field: string) {
  const source = clean(value) || "[]";
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`${field} precisa ser uma lista JSON de textos.`);
  return JSON.stringify(parsed.map((item) => item.trim()).filter(Boolean));
}

function rotationVariants(value: unknown, type: string) {
  if (isListening(type)) return "[]";
  const source = clean(value) || "[]";
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed) || parsed.length > 20) throw new Error("Cadastre no máximo 20 variações por exercício.");
  const normalized = parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`A variação ${index + 1} está incompleta.`);
    const row = item as Record<string, unknown>;
    const prompt = clean(row.prompt);
    const correct = clean(row.correct);
    const title = clean(row.title);
    const explanation = clean(row.explanation);
    if (!prompt || !correct) throw new Error(`Preencha o enunciado e a resposta da variação ${index + 1}.`);
    const accepted = Array.isArray(row.accepted) ? row.accepted.map(clean).filter(Boolean) : [];
    const options = Array.isArray(row.options) ? row.options.map(clean).filter(Boolean) : [];
    if (isChoice(type) && (options.length < 2 || new Set(options).size !== options.length || !options.includes(correct))) throw new Error(`A variação ${index + 1} precisa ter alternativas diferentes e incluir a correta.`);
    return { title, prompt, correct, explanation, accepted, options: isChoice(type) ? options : [] };
  });
  return JSON.stringify(normalized);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const db = getSupabase();
    const [studentResult, accountResult, moduleResult, sectionResult, lessonResult, exerciseResult, examResult, questionResult] = await Promise.all([
      db.from("students").select("id,fullName:full_name,email,level,placementScore:placement_score,status,createdAt:created_at").order("id", { ascending: false }),
      db.from("user_accounts").select("id,email,mustChangePassword:must_change_password,lastLoginAt:last_login_at").eq("role", "student"),
      db.from("course_modules").select("id,title,level,description,status,position,imageKey:cover_key,imageMobileKey:cover_mobile_key,imageFit:cover_fit,imageZoom:cover_zoom,imageOverlay:cover_overlay,imagePositionX:cover_position_x,imagePositionY:cover_position_y").order("position").order("id"),
      db.from("course_sections").select("id,moduleId:module_id,title,description,status,position,imageKey:cover_key,imageMobileKey:cover_mobile_key,imageFit:cover_fit,imageZoom:cover_zoom,imageOverlay:cover_overlay,imagePositionX:cover_position_x,imagePositionY:cover_position_y").order("module_id").order("position").order("id"),
      db.from("lessons").select("id,sectionId:section_id,title,description,duration,lessonType:lesson_type,status,position,smartRotation:smart_rotation,videoKey:video_key,videoName:video_name,videoSize:video_size,imageKey:thumbnail_key,imageMobileKey:thumbnail_mobile_key,imageFit:thumbnail_fit,imageZoom:thumbnail_zoom,imageOverlay:thumbnail_overlay,imagePositionX:thumbnail_position_x,imagePositionY:thumbnail_position_y").order("section_id").order("position").order("id"),
      db.from("lesson_exercises").select("id,lessonId:lesson_id,exerciseType:exercise_type,category,title,prompt,optionsJson:options_json,correctAnswer:correct_answer,acceptedAnswersJson:accepted_answers_json,explanation,speech,audioKey:audio_key,audioName:audio_name,skillsJson:skills_json,rotationVariantsJson:rotation_variants_json,status,position").order("lesson_id").order("position").order("id"),
      db.from("section_exams").select("id,sectionId:section_id,title,description,status,passScore:pass_score,position").order("section_id").order("position").order("id"),
      db.from("section_exam_questions").select("id,examId:exam_id,questionType:question_type,category,prompt,optionsJson:options_json,correctAnswer:correct_answer,acceptedAnswersJson:accepted_answers_json,explanation,status,position").order("exam_id").order("position").order("id"),
    ]);
    const accounts = (assertSupabase(accountResult) ?? []) as { id: number; email: string; mustChangePassword: number; lastLoginAt: string | null }[];
    const accountByEmail = new Map(accounts.map(account => [account.email, account]));
    const students = ((assertSupabase(studentResult) ?? []) as { id: number; fullName: string; email: string; level: string; placementScore: number; status: string; createdAt: string }[]).map(student => { const account = accountByEmail.get(student.email); return { ...student, hasAccount: account ? 1 : 0, mustChangePassword: account?.mustChangePassword ?? 0, lastLoginAt: account?.lastLoginAt ?? null }; });
    return Response.json({ students, modules: assertSupabase(moduleResult) ?? [], sections: assertSupabase(sectionResult) ?? [], lessons: assertSupabase(lessonResult) ?? [], exercises: assertSupabase(exerciseResult) ?? [], exams: assertSupabase(examResult) ?? [], examQuestions: assertSupabase(questionResult) ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os dados." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const payload = await request.json() as Record<string, unknown> & { entity?: Entity };
    const db = getSupabase();
    let id: number | undefined;
    if (payload.entity === "student") {
      const name = clean(payload.fullName);
      const email = clean(payload.email).toLowerCase();
      const password = typeof payload.password === "string" ? payload.password : "";
      if (!name || !email) return Response.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
      const passwordError = passwordPolicyError(password);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      const [studentLookup, accountLookup] = await Promise.all([
        db.from("students").select("id").eq("email", email).maybeSingle(),
        db.from("user_accounts").select("id").eq("email", email).maybeSingle(),
      ]);
      const existingStudent = assertSupabase(studentLookup);
      const existingAccount = assertSupabase(accountLookup);
      if (existingStudent || existingAccount) return Response.json({ error: "Já existe um cadastro com esse e-mail." }, { status: 409 });
      const level = clean(payload.level) || "Básico";
      const status = clean(payload.status) || "Ativo";
      const score = Number(payload.placementScore) || 0;
      const salt = randomSecret(24);
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();
      const student = assertSupabase(await db.from("students").insert({ full_name: name, email, level, placement_score: score, status, created_at: now }).select("id").single()) as { id: number } | null;
      if (!student) throw new Error("O Supabase não retornou o aluno criado.");
      const account = await db.from("user_accounts").insert({ email, full_name: name, password_hash: passwordHash, password_salt: salt, role: "student", status: status === "Pausado" ? "paused" : "active", level, placement_score: score, daily_minutes: 10, token_version: 1, must_change_password: 1, created_at: now, updated_at: now });
      if (account.error) { await db.from("students").delete().eq("id", student.id); throw new Error(`Supabase: ${account.error.message}`); }
      id = student.id;
    } else if (payload.entity === "module") {
      const row = assertSupabase(await db.from("course_modules").insert({ title: clean(payload.title), level: clean(payload.level), description: clean(payload.description), status: clean(payload.status) || "Rascunho", position: Number(payload.position) || 0 }).select("id").single()) as { id: number } | null; id = row?.id;
    } else if (payload.entity === "section") {
      const row = assertSupabase(await db.from("course_sections").insert({ module_id: Number(payload.moduleId), title: clean(payload.title), description: clean(payload.description), status: clean(payload.status) || "Rascunho", position: Number(payload.position) || 0 }).select("id").single()) as { id: number } | null; id = row?.id;
    } else if (payload.entity === "lesson") {
      const row = assertSupabase(await db.from("lessons").insert({ section_id: Number(payload.sectionId), title: clean(payload.title), description: clean(payload.description), duration: clean(payload.duration) || "10 min", lesson_type: clean(payload.lessonType) || "Vídeo + prática", status: clean(payload.status) || "Rascunho", position: Number(payload.position) || 0, smart_rotation: payload.smartRotation ? 1 : 0 }).select("id").single()) as { id: number } | null; id = row?.id;
    } else if (payload.entity === "exercise") {
      if (isListening(clean(payload.exerciseType)) && payload.status === "Publicado") return Response.json({ error: "Salve como rascunho, envie a gravação e depois publique." }, { status: 400 });
      const validationError = exerciseError(payload);
      if (validationError) return Response.json({ error: validationError }, { status: 400 });
      const optionsJson = isChoice(clean(payload.exerciseType)) ? jsonArray(payload.optionsJson, "Opções") : "[]";
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      const skillsJson = jsonArray(payload.skillsJson, "Habilidades");
      const variantsJson = rotationVariants(payload.rotationVariantsJson, clean(payload.exerciseType));
      const row = assertSupabase(await db.from("lesson_exercises").insert({ lesson_id: Number(payload.lessonId), exercise_type: clean(payload.exerciseType) || "choice", category: clean(payload.category) || "Compreensão", title: clean(payload.title), prompt: clean(payload.prompt), options_json: optionsJson, correct_answer: clean(payload.correctAnswer), accepted_answers_json: acceptedAnswersJson, explanation: clean(payload.explanation), speech: clean(payload.speech) || null, skills_json: skillsJson, rotation_variants_json: variantsJson, status: clean(payload.status) || "Rascunho", position: Number(payload.position) || 0 }).select("id").single()) as { id: number } | null; id = row?.id;
    } else if (payload.entity === "exam") {
      const row = assertSupabase(await db.from("section_exams").insert({ section_id: Number(payload.sectionId), title: clean(payload.title), description: clean(payload.description), status: clean(payload.status) || "Rascunho", pass_score: Math.min(100, Math.max(MASTERY_THRESHOLD, Number(payload.passScore) || MASTERY_THRESHOLD)), position: Number(payload.position) || 1 }).select("id").single()) as { id: number } | null; id = row?.id;
    } else if (payload.entity === "examQuestion") {
      const error = examQuestionError(payload);
      if (error) return Response.json({ error }, { status: 400 });
      const optionsJson = payload.questionType === "choice" ? jsonArray(payload.optionsJson, "Opções") : "[]";
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      const row = assertSupabase(await db.from("section_exam_questions").insert({ exam_id: Number(payload.examId), question_type: clean(payload.questionType) || "choice", category: clean(payload.category) || "Avaliação", prompt: clean(payload.prompt), options_json: optionsJson, correct_answer: clean(payload.correctAnswer), accepted_answers_json: acceptedAnswersJson, explanation: clean(payload.explanation), status: clean(payload.status) || "Rascunho", position: Number(payload.position) || 0 }).select("id").single()) as { id: number } | null; id = row?.id;
    } else {
      return Response.json({ error: "Entidade inválida." }, { status: 400 });
    }
    if (!id) throw new Error("O Supabase não retornou o registro criado.");
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const payload = await request.json() as Record<string, unknown> & { entity?: Entity; id?: number };
    const db = getSupabase();
    const id = Number(payload.id);
    if (!id) return Response.json({ error: "ID inválido." }, { status: 400 });
    if (payload.entity === "student") {
      const existing = assertSupabase(await db.from("students").select("email").eq("id", id).maybeSingle()) as { email: string } | null;
      const email = clean(payload.email).toLowerCase();
      assertSupabase(await db.from("students").update({ full_name: clean(payload.fullName), email, level: clean(payload.level), status: clean(payload.status) }).eq("id", id));
      const account = assertSupabase(await db.from("user_accounts").select("id,token_version").eq("email", existing?.email ?? email).eq("role", "student").maybeSingle()) as { id: number; token_version: number } | null;
      if (account) assertSupabase(await db.from("user_accounts").update({ full_name: clean(payload.fullName), email, level: clean(payload.level), status: clean(payload.status) === "Pausado" ? "paused" : "active", token_version: account.token_version + 1, updated_at: new Date().toISOString() }).eq("id", account.id));
    } else if (payload.entity === "module") {
      assertSupabase(await db.from("course_modules").update({ title: clean(payload.title), level: clean(payload.level), description: clean(payload.description), status: clean(payload.status), position: Number(payload.position) || 0 }).eq("id", id));
    } else if (payload.entity === "section") {
      assertSupabase(await db.from("course_sections").update({ module_id: Number(payload.moduleId), title: clean(payload.title), description: clean(payload.description), status: clean(payload.status), position: Number(payload.position) || 0 }).eq("id", id));
    } else if (payload.entity === "lesson") {
      assertSupabase(await db.from("lessons").update({ section_id: Number(payload.sectionId), title: clean(payload.title), description: clean(payload.description), duration: clean(payload.duration), lesson_type: clean(payload.lessonType), status: clean(payload.status), position: Number(payload.position) || 0, smart_rotation: payload.smartRotation ? 1 : 0 }).eq("id", id));
    } else if (payload.entity === "exercise") {
      const validationError = exerciseError(payload);
      if (validationError) return Response.json({ error: validationError }, { status: 400 });
      const optionsJson = isChoice(clean(payload.exerciseType)) ? jsonArray(payload.optionsJson, "Opções") : "[]";
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      const skillsJson = jsonArray(payload.skillsJson, "Habilidades");
      const variantsJson = rotationVariants(payload.rotationVariantsJson, clean(payload.exerciseType));
      assertSupabase(await db.from("lesson_exercises").update({ lesson_id: Number(payload.lessonId), exercise_type: clean(payload.exerciseType), category: clean(payload.category), title: clean(payload.title), prompt: clean(payload.prompt), options_json: optionsJson, correct_answer: clean(payload.correctAnswer), accepted_answers_json: acceptedAnswersJson, explanation: clean(payload.explanation), speech: clean(payload.speech) || null, skills_json: skillsJson, rotation_variants_json: variantsJson, status: clean(payload.status), position: Number(payload.position) || 0 }).eq("id", id));
    } else if (payload.entity === "exam") {
      assertSupabase(await db.from("section_exams").update({ section_id: Number(payload.sectionId), title: clean(payload.title), description: clean(payload.description), status: clean(payload.status), pass_score: Math.min(100, Math.max(MASTERY_THRESHOLD, Number(payload.passScore) || MASTERY_THRESHOLD)), position: Number(payload.position) || 1 }).eq("id", id));
    } else if (payload.entity === "examQuestion") {
      const error = examQuestionError(payload);
      if (error) return Response.json({ error }, { status: 400 });
      const optionsJson = payload.questionType === "choice" ? jsonArray(payload.optionsJson, "Opções") : "[]";
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      assertSupabase(await db.from("section_exam_questions").update({ exam_id: Number(payload.examId), question_type: clean(payload.questionType), category: clean(payload.category), prompt: clean(payload.prompt), options_json: optionsJson, correct_answer: clean(payload.correctAnswer), accepted_answers_json: acceptedAnswersJson, explanation: clean(payload.explanation), status: clean(payload.status), position: Number(payload.position) || 0 }).eq("id", id));
    } else {
      return Response.json({ error: "Entidade inválida." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const payload = await request.json() as { action?: string; entity?: ReorderEntity | "module"; orderedIds?: number[]; id?: number; password?: string; imageFit?: string; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number };
    const db = getSupabase();

    if (payload.action === "resetStudentPassword") {
      const studentId = Number(payload.id);
      const password = payload.password ?? "";
      if (!studentId) return Response.json({ error: "Aluno inválido." }, { status: 400 });
      const passwordError = passwordPolicyError(password);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      const student = assertSupabase(await db.from("students").select("fullName:full_name,email,level,placementScore:placement_score,status,createdAt:created_at").eq("id", studentId).maybeSingle()) as { fullName: string; email: string; level: string; placementScore: number; status: string; createdAt: string } | null;
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      const account = assertSupabase(await db.from("user_accounts").select("id,role,token_version").eq("email", student.email).maybeSingle()) as { id: number; role: string; token_version: number } | null;
      if (account && account.role !== "student") return Response.json({ error: "Esse e-mail pertence a uma conta administrativa." }, { status: 409 });
      const salt = randomSecret(24);
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();
      if (account) {
        assertSupabase(await db.from("user_accounts").update({ password_hash: passwordHash, password_salt: salt, token_version: account.token_version + 1, must_change_password: 1, status: student.status === "Pausado" ? "paused" : "active", updated_at: now }).eq("id", account.id));
        assertSupabase(await db.from("auth_sessions").update({ revoked_at: now }).eq("user_id", account.id).is("revoked_at", null));
      } else {
        assertSupabase(await db.from("user_accounts").insert({ email: student.email, full_name: student.fullName, password_hash: passwordHash, password_salt: salt, role: "student", status: student.status === "Pausado" ? "paused" : "active", level: student.level, placement_score: student.placementScore, daily_minutes: 10, token_version: 1, must_change_password: 1, created_at: student.createdAt || now, updated_at: now }));
      }
      return Response.json({ ok: true, message: `A nova senha de ${student.fullName} foi salva com segurança.` });
    }

    if (payload.action === "reorder" && payload.entity && Array.isArray(payload.orderedIds)) {
      const table = payload.entity === "lesson" ? "lessons" : payload.entity === "exercise" ? "lesson_exercises" : payload.entity === "examQuestion" ? "section_exam_questions" : "course_sections";
      await Promise.all(payload.orderedIds.map(async (rowId, index) => { assertSupabase(await db.from(table).update({ position: index + 1 }).eq("id", Number(rowId))); }));
      return Response.json({ ok: true });
    }

    if (payload.action === "duplicateLesson") {
      const lesson = assertSupabase(await db.from("lessons").select("sectionId:section_id,title,description,duration,lessonType:lesson_type,status,position,smartRotation:smart_rotation").eq("id", Number(payload.id)).maybeSingle()) as { sectionId: number; title: string; description: string; duration: string; lessonType: string; status: string; position: number; smartRotation: number } | null;
      if (!lesson) return Response.json({ error: "Aula não encontrada." }, { status: 404 });
      const last = assertSupabase(await db.from("lessons").select("position").eq("section_id", lesson.sectionId).order("position", { ascending: false }).limit(1).maybeSingle()) as { position: number } | null;
      const created = assertSupabase(await db.from("lessons").insert({ section_id: lesson.sectionId, title: `${lesson.title} (cópia)`, description: lesson.description, duration: lesson.duration, lesson_type: lesson.lessonType, status: "Rascunho", position: (last?.position ?? 0) + 1, smart_rotation: lesson.smartRotation ? 1 : 0 }).select("id").single()) as { id: number } | null;
      if (!created) throw new Error("O Supabase não retornou a aula duplicada.");
      return Response.json({ ok: true, id: created.id });
    }

    if (payload.action === "updateArtwork" && payload.entity && payload.id) {
      const configuration = [
        ["module", "course_modules", "cover"],
        ["section", "course_sections", "cover"],
        ["lesson", "lessons", "thumbnail"],
      ].find(([entity]) => entity === payload.entity);
      if (!configuration) return Response.json({ error: "Tipo de capa inválido." }, { status: 400 });
      const [, table, prefix] = configuration;
      const fit = ["cover", "contain", "fill"].includes(payload.imageFit ?? "") ? payload.imageFit : "cover";
      const clamp = (value: number | undefined, min: number, max: number) => Math.min(max, Math.max(min, Number(value) || min));
      assertSupabase(await db.from(table).update({ [`${prefix}_fit`]: fit, [`${prefix}_zoom`]: clamp(payload.imageZoom, 100, 180), [`${prefix}_overlay`]: clamp(payload.imageOverlay, 0, 75), [`${prefix}_position_x`]: clamp(payload.imagePositionX, 0, 100), [`${prefix}_position_y`]: clamp(payload.imagePositionY, 0, 100) }).eq("id", Number(payload.id)));
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a ordem." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity") as Entity | null;
    const id = Number(url.searchParams.get("id"));
    const db = getSupabase();
    const tables: Record<Entity, string> = { student: "students", module: "course_modules", section: "course_sections", lesson: "lessons", exercise: "lesson_exercises", exam: "section_exams", examQuestion: "section_exam_questions" };
    if (!entity || !tables[entity] || !id) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    if (entity === "student") {
      const student = assertSupabase(await db.from("students").select("email").eq("id", id).maybeSingle()) as { email: string } | null;
      if (student) {
        const account = assertSupabase(await db.from("user_accounts").select("id,token_version").eq("email", student.email).eq("role", "student").maybeSingle()) as { id: number; token_version: number } | null;
        const now = new Date().toISOString();
        assertSupabase(await db.from("students").delete().eq("id", id));
        if (account) {
          assertSupabase(await db.from("user_accounts").update({ status: "deleted", token_version: account.token_version + 1, updated_at: now }).eq("id", account.id));
          assertSupabase(await db.from("auth_sessions").update({ revoked_at: now }).eq("user_id", account.id).is("revoked_at", null));
        }
      }
    } else {
      assertSupabase(await db.from(tables[entity]).delete().eq("id", id));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: 500 });
  }
}
