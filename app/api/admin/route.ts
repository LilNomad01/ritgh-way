import { getD1 } from "../../../db";
import { assertSameOrigin, requireAdmin } from "../../lib/auth";

export const dynamic = "force-dynamic";

type Entity = "student" | "module" | "section" | "lesson";

async function ensureData() {
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
  ]);

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
  return db;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;
    const db = await ensureData();
    const [students, modules, sections, lessons] = await Promise.all([
      db.prepare("SELECT id, full_name AS fullName, email, level, placement_score AS placementScore, status, created_at AS createdAt FROM students ORDER BY id DESC").all(),
      db.prepare("SELECT id, title, level, description, status, position FROM course_modules ORDER BY position, id").all(),
      db.prepare("SELECT id, module_id AS moduleId, title, position FROM course_sections ORDER BY module_id, position, id").all(),
      db.prepare("SELECT id, section_id AS sectionId, title, duration, lesson_type AS lessonType, status, position, video_key AS videoKey, video_name AS videoName, video_size AS videoSize FROM lessons ORDER BY section_id, position, id").all(),
    ]);
    return Response.json({ students: students.results, modules: modules.results, sections: sections.results, lessons: lessons.results });
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
      result = await db.prepare("INSERT INTO course_sections (module_id, title, position) VALUES (?, ?, ?)")
        .bind(Number(payload.moduleId), clean(payload.title), Number(payload.position) || 0).run();
    } else if (payload.entity === "lesson") {
      result = await db.prepare("INSERT INTO lessons (section_id, title, duration, lesson_type, status, position) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(Number(payload.sectionId), clean(payload.title), clean(payload.duration) || "10 min", clean(payload.lessonType) || "Vídeo + prática", clean(payload.status) || "Rascunho", Number(payload.position) || 0).run();
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
      await db.prepare("UPDATE course_sections SET module_id = ?, title = ?, position = ? WHERE id = ?").bind(Number(payload.moduleId), clean(payload.title), Number(payload.position) || 0, id).run();
    } else if (payload.entity === "lesson") {
      await db.prepare("UPDATE lessons SET section_id = ?, title = ?, duration = ?, lesson_type = ?, status = ?, position = ? WHERE id = ?").bind(Number(payload.sectionId), clean(payload.title), clean(payload.duration), clean(payload.lessonType), clean(payload.status), Number(payload.position) || 0, id).run();
    } else {
      return Response.json({ error: "Entidade inválida." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar." }, { status: 500 });
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
    const tables: Record<Entity, string> = { student: "students", module: "course_modules", section: "course_sections", lesson: "lessons" };
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
    } else {
      await db.prepare(`DELETE FROM ${tables[entity]} WHERE id = ?`).bind(id).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir." }, { status: 500 });
  }
}
