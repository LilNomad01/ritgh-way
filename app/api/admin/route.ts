import { getD1 } from "../../../db";
import { assertSameOrigin, requireAdmin } from "../../lib/auth";

export const dynamic = "force-dynamic";

type Entity = "student" | "module" | "section" | "lesson" | "exercise" | "exam" | "examQuestion";
type ReorderEntity = "section" | "lesson" | "exercise" | "examQuestion";

export async function ensureData() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL DEFAULT 'Básico',
      placement_score INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Ativo',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS course_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      level TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Publicado',
      position INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS course_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      duration TEXT NOT NULL DEFAULT '10 min',
      lesson_type TEXT NOT NULL DEFAULT 'Vídeo + prática',
      status TEXT NOT NULL DEFAULT 'Publicado',
      position INTEGER NOT NULL DEFAULT 0,
      video_key TEXT,
      video_name TEXT,
      video_size INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS lesson_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      exercise_type TEXT NOT NULL DEFAULT 'choice',
      category TEXT NOT NULL DEFAULT 'Compreensão',
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT,
      correct_answer TEXT NOT NULL,
      accepted_answers_json TEXT,
      explanation TEXT NOT NULL DEFAULT '',
      speech TEXT,
      skills_json TEXT,
      status TEXT NOT NULL DEFAULT 'Publicado',
      position INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS lesson_exercises_lesson_status_position_idx ON lesson_exercises (lesson_id, status, position)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      answers_json TEXT NOT NULL DEFAULT '[]',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS practice_sessions_user_lesson_unique ON practice_sessions (user_id, lesson_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS video_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      position_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      progress_percent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'not_started',
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS video_progress_user_lesson_unique ON video_progress (user_id, lesson_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS section_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Rascunho',
      pass_score INTEGER NOT NULL DEFAULT 70,
      position INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS section_exam_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'choice',
      category TEXT NOT NULL DEFAULT 'Avaliação',
      prompt TEXT NOT NULL,
      options_json TEXT,
      correct_answer TEXT NOT NULL,
      accepted_answers_json TEXT,
      explanation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Rascunho',
      position INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS section_exam_questions_exam_status_position_idx ON section_exam_questions (exam_id, status, position)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS section_exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percentage INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      answers_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS section_exam_attempts_user_exam_idx ON section_exam_attempts (user_id, exam_id)"),
  ]);

  const artworkColumns = [
    ["course_modules", "cover_key", "TEXT"], ["course_modules", "cover_mobile_key", "TEXT"], ["course_modules", "cover_fit", "TEXT NOT NULL DEFAULT 'cover'"], ["course_modules", "cover_zoom", "INTEGER NOT NULL DEFAULT 100"], ["course_modules", "cover_overlay", "INTEGER NOT NULL DEFAULT 24"], ["course_modules", "cover_position_x", "INTEGER NOT NULL DEFAULT 50"], ["course_modules", "cover_position_y", "INTEGER NOT NULL DEFAULT 50"],
    ["course_sections", "cover_key", "TEXT"], ["course_sections", "cover_mobile_key", "TEXT"], ["course_sections", "cover_fit", "TEXT NOT NULL DEFAULT 'cover'"], ["course_sections", "cover_zoom", "INTEGER NOT NULL DEFAULT 100"], ["course_sections", "cover_overlay", "INTEGER NOT NULL DEFAULT 24"], ["course_sections", "cover_position_x", "INTEGER NOT NULL DEFAULT 50"], ["course_sections", "cover_position_y", "INTEGER NOT NULL DEFAULT 50"],
    ["lessons", "thumbnail_key", "TEXT"], ["lessons", "thumbnail_mobile_key", "TEXT"], ["lessons", "thumbnail_fit", "TEXT NOT NULL DEFAULT 'cover'"], ["lessons", "thumbnail_zoom", "INTEGER NOT NULL DEFAULT 100"], ["lessons", "thumbnail_overlay", "INTEGER NOT NULL DEFAULT 20"], ["lessons", "thumbnail_position_x", "INTEGER NOT NULL DEFAULT 50"], ["lessons", "thumbnail_position_y", "INTEGER NOT NULL DEFAULT 50"],
  ] as const;
  for (const table of ["course_modules", "course_sections", "lessons"] as const) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const existing = new Set((info.results as { name: string }[]).map((column) => column.name));
    for (const [columnTable, name, declaration] of artworkColumns) {
      if (columnTable === table && !existing.has(name)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`).run();
    }
  }
  const contentColumns = [
    ["course_sections", "description", "TEXT NOT NULL DEFAULT ''"],
    ["course_sections", "status", "TEXT NOT NULL DEFAULT 'Publicado'"],
    ["lessons", "description", "TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const table of ["course_sections", "lessons"] as const) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const existing = new Set((info.results as { name: string }[]).map((column) => column.name));
    for (const [columnTable, name, declaration] of contentColumns) if (columnTable === table && !existing.has(name)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`).run();
  }
  const attemptColumns = await db.prepare("PRAGMA table_info(exercise_attempts)").all<{ name: string }>();
  if (attemptColumns.results.length && !(attemptColumns.results as { name: string }[]).some((column) => column.name === "lesson_id")) {
    await db.prepare("ALTER TABLE exercise_attempts ADD COLUMN lesson_id INTEGER").run();
  }

  const moduleCount = await db.prepare("SELECT COUNT(*) AS total FROM course_modules").first<{ total: number }>();
  if (!moduleCount?.total) {
    await db.batch([
      db.prepare("INSERT INTO course_modules (title, level, description, status, position) VALUES (?, ?, ?, ?, ?)").bind("Start speaking", "Básico", "Fundamentos para começar a falar desde a primeira aula.", "Publicado", 1),
      db.prepare("INSERT INTO course_modules (title, level, description, status, position) VALUES (?, ?, ?, ?, ?)").bind("Real conversations", "Intermediário", "Conversas naturais para situações da vida real.", "Publicado", 2),
      db.prepare("INSERT INTO course_modules (title, level, description, status, position) VALUES (?, ?, ?, ?, ?)").bind("Fluent thinking", "Avançado", "Refine argumentação, fluência e precisão.", "Publicado", 3),
    ]);
    await db.batch([
      db.prepare("INSERT INTO course_sections (module_id, title, position) VALUES (?, ?, ?)").bind(1, "Primeiros passos", 1),
      db.prepare("INSERT INTO course_sections (module_id, title, position) VALUES (?, ?, ?)").bind(1, "Rotina e apresentações", 2),
      db.prepare("INSERT INTO course_sections (module_id, title, position) VALUES (?, ?, ?)").bind(2, "Food & travel", 1),
      db.prepare("INSERT INTO course_sections (module_id, title, position) VALUES (?, ?, ?)").bind(2, "Work & connections", 2),
      db.prepare("INSERT INTO course_sections (module_id, title, position) VALUES (?, ?, ?)").bind(3, "Nuance & persuasion", 1),
    ]);
    await db.batch([
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(1, "Nice to meet you", "12 min", "Vídeo + Speaking", "Publicado", 1),
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(1, "The verb to be", "16 min", "Vídeo + Exercícios", "Publicado", 2),
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(2, "My daily routine", "14 min", "Listening + Writing", "Publicado", 1),
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(3, "At the coffee shop", "18 min", "Vídeo + Conversation", "Publicado", 1),
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(3, "Checking into a hotel", "21 min", "Listening + Speaking", "Publicado", 2),
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(4, "A productive meeting", "19 min", "Vídeo + Writing", "Publicado", 1),
      db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)").bind(5, "Making a compelling case", "24 min", "Conversation + Speaking", "Publicado", 1),
    ]);
  }
  const exerciseCount = await db.prepare("SELECT COUNT(*) AS total FROM lesson_exercises").first<{ total: number }>();
  if (!exerciseCount?.total) {
    const seededLessons = await db.prepare("SELECT id, title FROM lessons WHERE title IN ('Nice to meet you', 'My daily routine', 'At the coffee shop')").all<{ id: number; title: string }>();
    const lessonIds = new Map((seededLessons.results as { id: number; title: string }[]).map((lesson) => [lesson.title, lesson.id]));
    const exercises = [
      ["Nice to meet you", "choice", "Conversação", "Uma apresentação natural", "Você acabou de conhecer uma colega. Qual resposta soa mais natural?", ["Nice meet you.", "It’s nice to meet you.", "I am meet you."], "It’s nice to meet you.", [], "A estrutura ‘It’s nice to meet you’ é a forma natural e completa.", null, ["Speaking", "Compreensão"]],
      ["Nice to meet you", "fill", "Gramática em contexto", "Complete sem traduzir", "Complete: My name ___ Laura.", null, "is", ["'s"], "Usamos ‘is’ para ligar ‘my name’ ao nome da pessoa.", null, ["Gramática"]],
      ["Nice to meet you", "writing", "Produção", "Responda com intenção", "Escreva uma frase curta para dizer que foi um prazer conhecer alguém.", null, "It was nice to meet you.", ["Nice to meet you.", "It’s nice to meet you."], "Mais de uma resposta natural é aceita; o importante é expressar a intenção completa.", null, ["Writing", "Speaking"]],
      ["My daily routine", "choice", "Compreensão", "Rotina real", "Qual frase descreve corretamente um hábito que acontece todos os dias?", ["I am wake up at seven every day.", "I wake up at seven every day.", "I waking up at seven every day."], "I wake up at seven every day.", [], "Para hábitos usamos o presente simples: I wake up.", null, ["Gramática", "Compreensão"]],
      ["My daily routine", "listening", "Listening", "Escute a rotina", "Ouça e escolha a frase que corresponde ao áudio.", ["She starts work at eight.", "She stopped working at eight.", "She studies until eight."], "She starts work at eight.", [], "‘Starts work’ indica o horário em que ela começa a trabalhar.", "She starts work at eight.", ["Listening"]],
      ["My daily routine", "correction", "Precisão", "Encontre a forma natural", "Qual opção corrige a frase: ‘He go to the gym after work’?", ["He goes to the gym after work.", "He going to the gym after work.", "He do go to the gym after work."], "He goes to the gym after work.", [], "Com he/she/it, o verbo recebe -s no presente simples.", null, ["Gramática"]],
      ["My daily routine", "fill", "Vocabulário", "Escolha pelo contexto", "Complete: I usually ___ breakfast before leaving home.", null, "have", ["eat"], "‘Have breakfast’ é a combinação mais frequente; ‘eat breakfast’ também é possível.", null, ["Vocabulário"]],
      ["My daily routine", "writing", "Produção", "Explique seu hábito", "Responda em uma frase: What do you usually do after work?", null, "I usually relax after work.", ["I usually go home after work.", "I usually study after work."], "Uma resposta completa usa sujeito, advérbio de frequência e uma ação coerente.", null, ["Writing", "Speaking"]],
      ["At the coffee shop", "choice", "Conversação", "Faça um pedido educado", "Você quer pedir um café com leite. O que diria?", ["Give me a latte.", "Could I have a latte, please?", "I want latte now."], "Could I have a latte, please?", [], "‘Could I have…?’ soa natural e educado para fazer pedidos.", null, ["Speaking", "Compreensão"]],
      ["At the coffee shop", "listening", "Listening", "Entenda o atendente", "Ouça e identifique o que o atendente perguntou.", ["O tamanho da bebida", "A forma de pagamento", "O nome do cliente"], "O tamanho da bebida", [], "‘What size would you like?’ pergunta o tamanho desejado.", "What size would you like?", ["Listening"]],
      ["At the coffee shop", "correction", "Precisão", "Corrija sem traduzir", "Qual é a forma natural de pedir leite vegetal?", ["Can I get it with oat milk?", "Can I put oat milk it?", "I can oat milk?"], "Can I get it with oat milk?", [], "‘Can I get it with…?’ permite ajustar o pedido de forma natural.", null, ["Speaking", "Gramática"]],
      ["At the coffee shop", "fill", "Vocabulário", "Complete o atendimento", "Complete: Would you like that for here or to ___?", null, "go", [], "A expressão fixa é ‘for here or to go’.", null, ["Vocabulário"]],
      ["At the coffee shop", "writing", "Produção", "Responda ao atendente", "O atendente perguntou ‘Anything else?’. Responda que só isso, agradecendo.", null, "That’s all, thank you.", ["No, that’s all, thank you.", "That will be all, thank you."], "Uma resposta curta e educada encerra o pedido naturalmente.", null, ["Writing", "Speaking"]],
    ] as const;
    const statements = exercises.flatMap((item, index) => {
      const lessonId = lessonIds.get(item[0]);
      return lessonId ? [db.prepare("INSERT INTO lesson_exercises (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, status, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Publicado', ?)").bind(lessonId, item[1], item[2], item[3], item[4], item[5] ? JSON.stringify(item[5]) : null, item[6], JSON.stringify(item[7]), item[8], item[9], JSON.stringify(item[10]), index + 1)] : [];
    });
    if (statements.length) await db.batch(statements);
  }
  return db;
}

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
    const db = await ensureData();
    const [students, modules, sections, lessons, exercises, exams, examQuestions] = await Promise.all([
      db.prepare("SELECT id, full_name AS fullName, email, level, placement_score AS placementScore, status, created_at AS createdAt FROM students ORDER BY id DESC").all(),
      db.prepare("SELECT id, title, level, description, status, position, cover_key AS imageKey, cover_mobile_key AS imageMobileKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_modules ORDER BY position, id").all(),
      db.prepare("SELECT id, module_id AS moduleId, title, description, status, position, cover_key AS imageKey, cover_mobile_key AS imageMobileKey, cover_fit AS imageFit, cover_zoom AS imageZoom, cover_overlay AS imageOverlay, cover_position_x AS imagePositionX, cover_position_y AS imagePositionY FROM course_sections ORDER BY module_id, position, id").all(),
      db.prepare("SELECT id, section_id AS sectionId, title, description, duration, lesson_type AS lessonType, status, position, video_key AS videoKey, video_name AS videoName, video_size AS videoSize, thumbnail_key AS imageKey, thumbnail_mobile_key AS imageMobileKey, thumbnail_fit AS imageFit, thumbnail_zoom AS imageZoom, thumbnail_overlay AS imageOverlay, thumbnail_position_x AS imagePositionX, thumbnail_position_y AS imagePositionY FROM lessons ORDER BY section_id, position, id").all(),
      db.prepare("SELECT id, lesson_id AS lessonId, exercise_type AS exerciseType, category, title, prompt, options_json AS optionsJson, correct_answer AS correctAnswer, accepted_answers_json AS acceptedAnswersJson, explanation, speech, skills_json AS skillsJson, status, position FROM lesson_exercises ORDER BY lesson_id, position, id").all(),
      db.prepare("SELECT id, section_id AS sectionId, title, description, status, pass_score AS passScore, position FROM section_exams ORDER BY section_id, position, id").all(),
      db.prepare("SELECT id, exam_id AS examId, question_type AS questionType, category, prompt, options_json AS optionsJson, correct_answer AS correctAnswer, accepted_answers_json AS acceptedAnswersJson, explanation, status, position FROM section_exam_questions ORDER BY exam_id, position, id").all(),
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
    const db = await ensureData();
    let result;
    if (payload.entity === "student") {
      const name = clean(payload.fullName);
      const email = clean(payload.email).toLowerCase();
      if (!name || !email) return Response.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
      result = await db.prepare("INSERT INTO students (full_name, email, level, placement_score, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, level = excluded.level, placement_score = excluded.placement_score, status = excluded.status")
        .bind(name, email, clean(payload.level) || "Básico", Number(payload.placementScore) || 0, clean(payload.status) || "Ativo", new Date().toISOString()).run();
      await db.prepare("UPDATE user_accounts SET full_name = ?, level = ?, status = ?, updated_at = ? WHERE email = ? AND role = 'student'")
        .bind(name, clean(payload.level) || "Básico", clean(payload.status) === "Pausado" ? "paused" : "active", new Date().toISOString(), email).run();
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
    const db = await ensureData();
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
    const payload = await request.json() as { action?: string; entity?: ReorderEntity | "module"; orderedIds?: number[]; id?: number; imageFit?: string; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number };
    const db = await ensureData();

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
    const db = await ensureData();
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
