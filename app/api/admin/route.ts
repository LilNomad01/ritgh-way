import { getD1 } from "../../../db";
import { assertSameOrigin, hashPassword, passwordPolicyError, randomSecret, requireAdmin } from "../../lib/auth";

export const dynamic = "force-dynamic";

type Entity = "student" | "module" | "section" | "lesson" | "exercise" | "exam" | "examQuestion";
type ReorderEntity = "section" | "lesson" | "exercise" | "examQuestion";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonArray(value: unknown, field: string) {
  const source = clean(value) || "[]";
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`${field} precisa ser uma lista JSON de textos.`);
  return JSON.stringify(parsed.map((item) => item.trim()).filter(Boolean));
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const db = getD1();
    const [students, modules, sections, lessons, exercises, exams, examQuestions] = await db.batch([
      db.prepare("SELECT students.id, students.full_name AS fullName, students.email, students.level, students.placement_score AS placementScore, students.status, students.created_at AS createdAt, CASE WHEN user_accounts.id IS NULL THEN 0 ELSE 1 END AS hasAccount, COALESCE(user_accounts.must_change_password, 0) AS mustChangePassword, user_accounts.last_login_at AS lastLoginAt FROM students LEFT JOIN user_accounts ON user_accounts.email = students.email AND user_accounts.role = 'student' ORDER BY students.id DESC"),
      db.prepare("SELECT id, title, level, description, status, position, cover_key AS imageKey, cover_mobile_key AS imageMobileKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_modules ORDER BY position, id"),
      db.prepare("SELECT id, module_id AS moduleId, title, description, status, position, cover_key AS imageKey, cover_mobile_key AS imageMobileKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_sections ORDER BY module_id, position, id"),
      db.prepare("SELECT id, section_id AS sectionId, title, description, duration, lesson_type AS lessonType, status, position, video_key AS videoKey, video_name AS videoName, video_size AS videoSize, thumbnail_key AS imageKey, thumbnail_mobile_key AS imageMobileKey, thumbnail_fit AS imageFit, thumbnail_zoom AS imageZoom, thumbnail_overlay AS imageOverlay, thumbnail_position_x AS imagePositionX, thumbnail_position_y AS imagePositionY FROM lessons ORDER BY section_id, position, id"),
      db.prepare("SELECT id, lesson_id AS lessonId, exercise_type AS exerciseType, category, title, prompt, options_json AS optionsJson, correct_answer AS correctAnswer, accepted_answers_json AS acceptedAnswersJson, explanation, speech, skills_json AS skillsJson, status, position FROM lesson_exercises ORDER BY lesson_id, position, id"),
      db.prepare("SELECT id, section_id AS sectionId, title, description, status, pass_score AS passScore, position FROM section_exams ORDER BY section_id, position, id"),
      db.prepare("SELECT id, exam_id AS examId, question_type AS questionType, category, prompt, options_json AS optionsJson, correct_answer AS correctAnswer, accepted_answers_json AS acceptedAnswersJson, explanation, status, position FROM section_exam_questions ORDER BY exam_id, position, id"),
    ]);
    return Response.json({ students: students.results, modules: modules.results, sections: sections.results, lessons: lessons.results, exercises: exercises.results, exams: exams.results, examQuestions: examQuestions.results });
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
    const db = getD1();
    let result;
    if (payload.entity === "student") {
      const name = clean(payload.fullName);
      const email = clean(payload.email).toLowerCase();
      const password = typeof payload.password === "string" ? payload.password : "";
      if (!name || !email) return Response.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
      const passwordError = passwordPolicyError(password);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      const existingStudent = await db.prepare("SELECT id FROM students WHERE email = ? LIMIT 1").bind(email).first();
      const existingAccount = await db.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first();
      if (existingStudent || existingAccount) return Response.json({ error: "Já existe um cadastro com esse e-mail." }, { status: 409 });
      const level = clean(payload.level) || "Básico";
      const status = clean(payload.status) || "Ativo";
      const score = Number(payload.placementScore) || 0;
      const salt = randomSecret(24);
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();
      const statements = await db.batch([
        db.prepare("INSERT INTO students (full_name, email, level, placement_score, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(name, email, level, score, status, now),
        db.prepare("INSERT INTO user_accounts (email, full_name, password_hash, password_salt, role, status, level, placement_score, daily_minutes, token_version, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 'student', ?, ?, ?, 10, 1, 1, ?, ?)").bind(email, name, passwordHash, salt, status === "Pausado" ? "paused" : "active", level, score, now, now),
      ]);
      result = statements[0];
    } else if (payload.entity === "module") {
      result = await db.prepare("INSERT INTO course_modules (title, level, description, status, position) VALUES (?, ?, ?, ?, ?)")
        .bind(clean(payload.title), clean(payload.level), clean(payload.description), clean(payload.status) || "Rascunho", Number(payload.position) || 0).run();
    } else if (payload.entity === "section") {
      result = await db.prepare("INSERT INTO course_sections (module_id, title, description, status, position) VALUES (?, ?, ?, ?, ?)")
        .bind(Number(payload.moduleId), clean(payload.title), clean(payload.description), clean(payload.status) || "Rascunho", Number(payload.position) || 0).run();
    } else if (payload.entity === "lesson") {
      result = await db.prepare("INSERT INTO lessons (section_id, title, description, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(Number(payload.sectionId), clean(payload.title), clean(payload.description), clean(payload.duration) || "10 min", clean(payload.lessonType) || "Vídeo + prática", clean(payload.status) || "Rascunho", Number(payload.position) || 0).run();
    } else if (payload.entity === "exercise") {
      const optionsJson = jsonArray(payload.optionsJson, "Opções");
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      const skillsJson = jsonArray(payload.skillsJson, "Habilidades");
      result = await db.prepare("INSERT INTO lesson_exercises (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, status, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Number(payload.lessonId), clean(payload.exerciseType) || "choice", clean(payload.category) || "Compreensão", clean(payload.title), clean(payload.prompt), optionsJson, clean(payload.correctAnswer), acceptedAnswersJson, clean(payload.explanation), clean(payload.speech) || null, skillsJson, clean(payload.status) || "Rascunho", Number(payload.position) || 0).run();
    } else if (payload.entity === "exam") {
      result = await db.prepare("INSERT INTO section_exams (section_id, title, description, status, pass_score, position) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(Number(payload.sectionId), clean(payload.title), clean(payload.description), clean(payload.status) || "Rascunho", Math.min(100, Math.max(0, Number(payload.passScore) || 70)), Number(payload.position) || 1).run();
    } else if (payload.entity === "examQuestion") {
      const optionsJson = jsonArray(payload.optionsJson, "Opções");
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      result = await db.prepare("INSERT INTO section_exam_questions (exam_id, question_type, category, prompt, options_json, correct_answer, accepted_answers_json, explanation, status, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Number(payload.examId), clean(payload.questionType) || "choice", clean(payload.category) || "Avaliação", clean(payload.prompt), optionsJson, clean(payload.correctAnswer), acceptedAnswersJson, clean(payload.explanation), clean(payload.status) || "Rascunho", Number(payload.position) || 0).run();
    } else {
      return Response.json({ error: "Entidade inválida." }, { status: 400 });
    }
    return Response.json({ ok: true, id: result.meta.last_row_id }, { status: 201 });
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
    const db = getD1();
    const id = Number(payload.id);
    if (!id) return Response.json({ error: "ID inválido." }, { status: 400 });
    if (payload.entity === "student") {
      const existing = await db.prepare("SELECT email FROM students WHERE id = ? LIMIT 1").bind(id).first<{ email: string }>();
      const email = clean(payload.email).toLowerCase();
      await db.batch([
        db.prepare("UPDATE students SET full_name = ?, email = ?, level = ?, status = ? WHERE id = ?").bind(clean(payload.fullName), email, clean(payload.level), clean(payload.status), id),
        db.prepare("UPDATE user_accounts SET full_name = ?, email = ?, level = ?, status = ?, token_version = token_version + 1, updated_at = ? WHERE email = ? AND role = 'student'")
          .bind(clean(payload.fullName), email, clean(payload.level), clean(payload.status) === "Pausado" ? "paused" : "active", new Date().toISOString(), existing?.email ?? email),
      ]);
    } else if (payload.entity === "module") {
      await db.prepare("UPDATE course_modules SET title = ?, level = ?, description = ?, status = ?, position = ? WHERE id = ?").bind(clean(payload.title), clean(payload.level), clean(payload.description), clean(payload.status), Number(payload.position) || 0, id).run();
    } else if (payload.entity === "section") {
      await db.prepare("UPDATE course_sections SET module_id = ?, title = ?, description = ?, status = ?, position = ? WHERE id = ?").bind(Number(payload.moduleId), clean(payload.title), clean(payload.description), clean(payload.status), Number(payload.position) || 0, id).run();
    } else if (payload.entity === "lesson") {
      await db.prepare("UPDATE lessons SET section_id = ?, title = ?, description = ?, duration = ?, lesson_type = ?, status = ?, position = ? WHERE id = ?").bind(Number(payload.sectionId), clean(payload.title), clean(payload.description), clean(payload.duration), clean(payload.lessonType), clean(payload.status), Number(payload.position) || 0, id).run();
    } else if (payload.entity === "exercise") {
      const optionsJson = jsonArray(payload.optionsJson, "Opções");
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      const skillsJson = jsonArray(payload.skillsJson, "Habilidades");
      await db.prepare("UPDATE lesson_exercises SET lesson_id = ?, exercise_type = ?, category = ?, title = ?, prompt = ?, options_json = ?, correct_answer = ?, accepted_answers_json = ?, explanation = ?, speech = ?, skills_json = ?, status = ?, position = ? WHERE id = ?")
        .bind(Number(payload.lessonId), clean(payload.exerciseType), clean(payload.category), clean(payload.title), clean(payload.prompt), optionsJson, clean(payload.correctAnswer), acceptedAnswersJson, clean(payload.explanation), clean(payload.speech) || null, skillsJson, clean(payload.status), Number(payload.position) || 0, id).run();
    } else if (payload.entity === "exam") {
      await db.prepare("UPDATE section_exams SET section_id = ?, title = ?, description = ?, status = ?, pass_score = ?, position = ? WHERE id = ?").bind(Number(payload.sectionId), clean(payload.title), clean(payload.description), clean(payload.status), Math.min(100, Math.max(0, Number(payload.passScore) || 70)), Number(payload.position) || 1, id).run();
    } else if (payload.entity === "examQuestion") {
      const optionsJson = jsonArray(payload.optionsJson, "Opções");
      const acceptedAnswersJson = jsonArray(payload.acceptedAnswersJson, "Respostas aceitas");
      await db.prepare("UPDATE section_exam_questions SET exam_id = ?, question_type = ?, category = ?, prompt = ?, options_json = ?, correct_answer = ?, accepted_answers_json = ?, explanation = ?, status = ?, position = ? WHERE id = ?")
        .bind(Number(payload.examId), clean(payload.questionType), clean(payload.category), clean(payload.prompt), optionsJson, clean(payload.correctAnswer), acceptedAnswersJson, clean(payload.explanation), clean(payload.status), Number(payload.position) || 0, id).run();
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
    const db = getD1();

    if (payload.action === "resetStudentPassword") {
      const studentId = Number(payload.id);
      const password = payload.password ?? "";
      if (!studentId) return Response.json({ error: "Aluno inválido." }, { status: 400 });
      const passwordError = passwordPolicyError(password);
      if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
      const student = await db.prepare("SELECT full_name AS fullName, email, level, placement_score AS placementScore, status, created_at AS createdAt FROM students WHERE id = ? LIMIT 1").bind(studentId).first<{ fullName: string; email: string; level: string; placementScore: number; status: string; createdAt: string }>();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      const account = await db.prepare("SELECT id, role FROM user_accounts WHERE email = ? LIMIT 1").bind(student.email).first<{ id: number; role: string }>();
      if (account && account.role !== "student") return Response.json({ error: "Esse e-mail pertence a uma conta administrativa." }, { status: 409 });
      const salt = randomSecret(24);
      const passwordHash = await hashPassword(password, salt);
      const now = new Date().toISOString();
      if (account) {
        await db.batch([
          db.prepare("UPDATE user_accounts SET password_hash = ?, password_salt = ?, token_version = token_version + 1, must_change_password = 1, status = ?, updated_at = ? WHERE id = ?").bind(passwordHash, salt, student.status === "Pausado" ? "paused" : "active", now, account.id),
          db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(now, account.id),
        ]);
      } else {
        await db.prepare("INSERT INTO user_accounts (email, full_name, password_hash, password_salt, role, status, level, placement_score, daily_minutes, token_version, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 'student', ?, ?, ?, 10, 1, 1, ?, ?)")
          .bind(student.email, student.fullName, passwordHash, salt, student.status === "Pausado" ? "paused" : "active", student.level, student.placementScore, student.createdAt || now, now).run();
      }
      return Response.json({ ok: true, message: `A nova senha de ${student.fullName} foi salva com segurança.` });
    }

    if (payload.action === "reorder" && payload.entity && Array.isArray(payload.orderedIds)) {
      const table = payload.entity === "lesson" ? "lessons" : payload.entity === "exercise" ? "lesson_exercises" : payload.entity === "examQuestion" ? "section_exam_questions" : "course_sections";
      const statements = payload.orderedIds.map((id, index) => db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).bind(index + 1, Number(id)));
      await db.batch(statements);
      return Response.json({ ok: true });
    }

    if (payload.action === "duplicateLesson") {
      const lesson = await db.prepare("SELECT section_id AS sectionId, title, description, duration, lesson_type AS lessonType, status, position FROM lessons WHERE id = ? LIMIT 1").bind(Number(payload.id)).first<{ sectionId: number; title: string; description: string; duration: string; lessonType: string; status: string; position: number }>();
      if (!lesson) return Response.json({ error: "Aula não encontrada." }, { status: 404 });
      const nextPosition = await db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition FROM lessons WHERE section_id = ?").bind(lesson.sectionId).first<{ nextPosition: number }>();
      const result = await db.prepare("INSERT INTO lessons (section_id, title, description, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, 'Rascunho', ?)")
        .bind(lesson.sectionId, `${lesson.title} (cópia)`, lesson.description, lesson.duration, lesson.lessonType, nextPosition?.nextPosition ?? lesson.position + 1).run();
      return Response.json({ ok: true, id: result.meta.last_row_id });
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
      await db.prepare(`UPDATE ${table} SET ${prefix}_fit = ?, ${prefix}_zoom = ?, ${prefix}_overlay = ?, ${prefix}_position_x = ?, ${prefix}_position_y = ? WHERE id = ?`)
        .bind(fit, clamp(payload.imageZoom, 100, 180), clamp(payload.imageOverlay, 0, 75), clamp(payload.imagePositionX, 0, 100), clamp(payload.imagePositionY, 0, 100), Number(payload.id)).run();
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
    const db = getD1();
    const tables: Record<Entity, string> = { student: "students", module: "course_modules", section: "course_sections", lesson: "lessons", exercise: "lesson_exercises", exam: "section_exams", examQuestion: "section_exam_questions" };
    if (!entity || !tables[entity] || !id) return Response.json({ error: "Dados inválidos." }, { status: 400 });
    if (entity === "student") {
      const student = await db.prepare("SELECT email FROM students WHERE id = ? LIMIT 1").bind(id).first<{ email: string }>();
      if (student) {
        const account = await db.prepare("SELECT id FROM user_accounts WHERE email = ? AND role = 'student' LIMIT 1").bind(student.email).first<{ id: number }>();
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("DELETE FROM students WHERE id = ?").bind(id),
          db.prepare("UPDATE user_accounts SET status = 'deleted', token_version = token_version + 1, updated_at = ? WHERE id = ?").bind(now, account?.id ?? 0),
          db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(now, account?.id ?? 0),
        ]);
      }
    } else if (entity === "lesson") {
      await db.batch([db.prepare("DELETE FROM lesson_exercises WHERE lesson_id = ?").bind(id), db.prepare("DELETE FROM lessons WHERE id = ?").bind(id)]);
    } else if (entity === "exam") {
      await db.batch([db.prepare("DELETE FROM section_exam_questions WHERE exam_id = ?").bind(id), db.prepare("DELETE FROM section_exams WHERE id = ?").bind(id)]);
    } else {
      await db.prepare(`DELETE FROM ${tables[entity]} WHERE id = ?`).bind(id).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: 500 });
  }
}
