import { assertSameOrigin, ensureAuthSchema, hashToken, issueSession, rootAdminConfig, verifyPassword } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const payload = await request.json() as { email?: string; password?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    if (!email || !password) return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
    const db = await ensureAuthSchema();
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
    const identifier = await hashToken(`${email}:${ip}`);
    type Account = { id: number; email: string; fullName: string; passwordHash: string; passwordSalt: string; role: "admin" | "student"; status: string; level: string; placementScore: number; tokenVersion: number; mustChangePassword: number };
    const [attempt, initialAccount] = await Promise.all([
      db.prepare("SELECT failed_count AS failedCount, locked_until AS lockedUntil FROM login_attempts WHERE identifier = ?").bind(identifier).first<{ failedCount: number; lockedUntil: string | null }>(),
      db.prepare("SELECT id, email, full_name AS fullName, password_hash AS passwordHash, password_salt AS passwordSalt, role, status, level, placement_score AS placementScore, token_version AS tokenVersion, must_change_password AS mustChangePassword FROM user_accounts WHERE email = ? LIMIT 1").bind(email).first<Account>(),
    ]);
    if (attempt?.lockedUntil && new Date(attempt.lockedUntil).getTime() > Date.now()) {
      return Response.json({ error: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente." }, { status: 429 });
    }

    let account = initialAccount;
    const root = rootAdminConfig();

    if (!account && email === root.email && root.passwordHash && root.passwordSalt && await verifyPassword(password, root.passwordSalt, root.passwordHash)) {
      const now = new Date().toISOString();
      const result = await db.prepare("INSERT INTO user_accounts (email, full_name, password_hash, password_salt, role, status, level, placement_score, daily_minutes, token_version, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 'active', 'Avançado', 8, 10, 1, 1, ?, ?)")
        .bind(root.email, "Vinicius Gullo", root.passwordHash, root.passwordSalt, now, now).run();
      account = { id: Number(result.meta.last_row_id), email: root.email, fullName: "Vinicius Gullo", passwordHash: root.passwordHash, passwordSalt: root.passwordSalt, role: "admin", status: "active", level: "Avançado", placementScore: 8, tokenVersion: 1, mustChangePassword: 1 };
    }

    const valid = account && account.status === "active" && await verifyPassword(password, account.passwordSalt, account.passwordHash);
    if (!valid) {
      const nextCount = (attempt?.failedCount ?? 0) + 1;
      const lockedUntil = nextCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await db.prepare("INSERT INTO login_attempts (identifier, failed_count, locked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(identifier) DO UPDATE SET failed_count = excluded.failed_count, locked_until = excluded.locked_until, updated_at = excluded.updated_at")
        .bind(identifier, nextCount, lockedUntil, new Date().toISOString()).run();
      return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const now = new Date().toISOString();
    await db.batch([
      db.prepare("DELETE FROM login_attempts WHERE identifier = ?").bind(identifier),
      db.prepare("UPDATE user_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, account.id),
    ]);
    const session = await issueSession(request, account);
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    for (const cookie of session.cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ profile: { fullName: account.fullName, email: account.email, level: account.level, placementScore: account.placementScore, role: account.role, mustChangePassword: Boolean(account.mustChangePassword) } }), { status: 200, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível entrar." }, { status: 500 });
  }
}
