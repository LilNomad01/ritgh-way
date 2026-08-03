import { assertSameOrigin, ensureAuthSchema, issueSession, randomSecret, requireAuth, verifyPassword, hashPassword } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
  const user = await requireAuth(request);
  if (user instanceof Response) return user;

  try {
    const payload = await request.json() as { currentPassword?: string; newPassword?: string };
    const currentPassword = payload.currentPassword ?? "";
    const newPassword = payload.newPassword ?? "";
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return Response.json({ error: "Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo." }, { status: 400 });
    }

    const db = await ensureAuthSchema();
    const account = await db.prepare("SELECT password_hash AS passwordHash, password_salt AS passwordSalt, token_version AS tokenVersion FROM user_accounts WHERE id = ? LIMIT 1")
      .bind(user.sub).first<{ passwordHash: string; passwordSalt: string; tokenVersion: number }>();
    if (!account || !await verifyPassword(currentPassword, account.passwordSalt, account.passwordHash)) {
      return Response.json({ error: "A senha atual está incorreta." }, { status: 401 });
    }
    if (await verifyPassword(newPassword, account.passwordSalt, account.passwordHash)) {
      return Response.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });
    }

    const salt = randomSecret(24);
    const passwordHash = await hashPassword(newPassword, salt);
    const tokenVersion = account.tokenVersion + 1;
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE user_accounts SET password_hash = ?, password_salt = ?, token_version = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
        .bind(passwordHash, salt, tokenVersion, now, user.sub),
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(now, user.sub),
    ]);

    const session = await issueSession(request, { id: user.sub, email: user.email, fullName: user.fullName, role: user.role, tokenVersion });
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    for (const cookie of session.cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a senha." }, { status: 500 });
  }
}
