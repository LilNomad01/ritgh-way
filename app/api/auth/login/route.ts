import { assertSameOrigin, hashToken, issueSession, rootAdminConfig, verifyPassword } from "../../../lib/auth";
import { assertSupabase, getSupabase } from "../../../../db/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const payload = await request.json() as { email?: string; password?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    if (!email || !password) return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
    const db = getSupabase();
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
    const identifier = await hashToken(`${email}:${ip}`);
    type Account = { id: number; email: string; fullName: string; passwordHash: string; passwordSalt: string; role: "admin" | "student"; status: string; level: string; placementScore: number; tokenVersion: number; mustChangePassword: number };
    const [attemptResult, accountResult] = await Promise.all([
      db.from("login_attempts").select("failed_count,locked_until").eq("identifier", identifier).maybeSingle(),
      db.from("user_accounts").select("id,email,full_name,password_hash,password_salt,role,status,level,placement_score,token_version,must_change_password").eq("email", email).maybeSingle(),
    ]);
    const rawAttempt = assertSupabase(attemptResult);
    const attempt = rawAttempt ? { failedCount: rawAttempt.failed_count, lockedUntil: rawAttempt.locked_until } : null;
    const rawAccount = assertSupabase(accountResult);
    let account: Account | null = rawAccount ? { id: rawAccount.id, email: rawAccount.email, fullName: rawAccount.full_name, passwordHash: rawAccount.password_hash, passwordSalt: rawAccount.password_salt, role: rawAccount.role, status: rawAccount.status, level: rawAccount.level, placementScore: rawAccount.placement_score, tokenVersion: rawAccount.token_version, mustChangePassword: rawAccount.must_change_password } as Account : null;
    if (attempt?.lockedUntil && new Date(attempt.lockedUntil).getTime() > Date.now()) {
      return Response.json({ error: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente." }, { status: 429 });
    }

    const root = rootAdminConfig();

    if (!account && email === root.email && root.passwordHash && root.passwordSalt && await verifyPassword(password, root.passwordSalt, root.passwordHash)) {
      const now = new Date().toISOString();
      const created = assertSupabase(await db.from("user_accounts").insert({ email: root.email, full_name: "Vinicius Gullo", password_hash: root.passwordHash, password_salt: root.passwordSalt, role: "admin", status: "active", level: "Avançado", placement_score: 8, daily_minutes: 10, token_version: 1, must_change_password: 1, created_at: now, updated_at: now }).select("id").single());
      if (!created) throw new Error("O Supabase não retornou a conta administrativa criada.");
      account = { id: Number(created.id), email: root.email, fullName: "Vinicius Gullo", passwordHash: root.passwordHash, passwordSalt: root.passwordSalt, role: "admin", status: "active", level: "Avançado", placementScore: 8, tokenVersion: 1, mustChangePassword: 1 };
    }

    if (!account || account.status !== "active" || !await verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      const nextCount = (attempt?.failedCount ?? 0) + 1;
      const lockedUntil = nextCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      assertSupabase(await db.from("login_attempts").upsert({ identifier, failed_count: nextCount, locked_until: lockedUntil, updated_at: new Date().toISOString() }, { onConflict: "identifier" }));
      return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const now = new Date().toISOString();
    const [deleted, updated] = await Promise.all([
      db.from("login_attempts").delete().eq("identifier", identifier),
      db.from("user_accounts").update({ last_login_at: now, updated_at: now }).eq("id", account.id),
    ]);
    assertSupabase(deleted); assertSupabase(updated);
    const session = await issueSession(request, account);
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    for (const cookie of session.cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ profile: { fullName: account.fullName, email: account.email, level: account.level, placementScore: account.placementScore, role: account.role, mustChangePassword: Boolean(account.mustChangePassword) } }), { status: 200, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível entrar." }, { status: 500 });
  }
}
