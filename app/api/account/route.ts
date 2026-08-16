import { assertSameOrigin, ensureAuthSchema, hashPassword, issueSession, passwordPolicyError, randomSecret } from "../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const payload = await request.json() as { action?: string; fullName?: string; email?: string; password?: string; level?: string; placementScore?: number; goal?: string; dailyMinutes?: number; answers?: number[] };
    if (payload.action !== "register") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const fullName = payload.fullName?.trim() ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    if (fullName.length < 2 || !email.includes("@")) return Response.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
    const passwordError = passwordPolicyError(password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    const db = await ensureAuthSchema();
    const existing = await db.prepare("SELECT id FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first();
    if (existing) return Response.json({ error: "Já existe uma conta com esse e-mail." }, { status: 409 });
    const salt = randomSecret(18);
    const passwordHash = await hashPassword(password, salt);
    const now = new Date().toISOString();
    const level = payload.level ?? "Começando do zero";
    const placementScore = Number(payload.placementScore) || 0;
    const result = await db.prepare("INSERT INTO user_accounts (email, full_name, password_hash, password_salt, role, status, level, placement_score, goal, daily_minutes, token_version, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 'student', 'active', ?, ?, ?, ?, 1, 0, ?, ?)")
      .bind(email, fullName, passwordHash, salt, level, placementScore, payload.goal ?? null, Number(payload.dailyMinutes) || 10, now, now).run();
    const userId = Number(result.meta.last_row_id);
    await db.batch([
      db.prepare("INSERT INTO students (full_name, email, level, placement_score, status, created_at) VALUES (?, ?, ?, ?, 'Ativo', ?) ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, level = excluded.level, placement_score = excluded.placement_score, status = 'Ativo'").bind(fullName, email, level, placementScore, now),
      db.prepare("INSERT INTO placement_attempts (user_id, score, total_questions, resulting_level, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, placementScore, 8, level, JSON.stringify(payload.answers ?? []), now),
    ]);
    const account = { id: userId, email, fullName, role: "student" as const, tokenVersion: 1 };
    const session = await issueSession(request, account);
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    for (const cookie of session.cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ profile: { fullName, email, level, placementScore, goal: payload.goal, dailyMinutes: Number(payload.dailyMinutes) || 10, role: "student" } }), { status: 201, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar a conta." }, { status: 500 });
  }
}
