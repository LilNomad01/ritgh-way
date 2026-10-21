import { assertSameOrigin, issueSession, passwordPolicyError, randomSecret, requireAuth, verifyPassword, hashPassword } from "../../../lib/auth";
import { assertSupabase, getSupabase } from "../../../../db/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
  const user = await requireAuth(request);
  if (user instanceof Response) return user;

  try {
    const payload = await request.json() as { currentPassword?: string; newPassword?: string };
    const currentPassword = payload.currentPassword ?? "";
    const newPassword = payload.newPassword ?? "";
    const passwordError = passwordPolicyError(newPassword);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

    const db = getSupabase();
    const rawAccount = assertSupabase(await db.from("user_accounts").select("password_hash,password_salt,token_version").eq("id", user.sub).maybeSingle());
    const account = rawAccount ? { passwordHash: rawAccount.password_hash, passwordSalt: rawAccount.password_salt, tokenVersion: rawAccount.token_version } : null;
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
    const [updated, revoked] = await Promise.all([
      db.from("user_accounts").update({ password_hash: passwordHash, password_salt: salt, token_version: tokenVersion, must_change_password: 0, updated_at: now }).eq("id", user.sub),
      db.from("auth_sessions").update({ revoked_at: now }).eq("user_id", user.sub).is("revoked_at", null),
    ]);
    assertSupabase(updated); assertSupabase(revoked);

    const session = await issueSession(request, { id: user.sub, email: user.email, fullName: user.fullName, role: user.role, tokenVersion });
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    for (const cookie of session.cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a senha." }, { status: 500 });
  }
}
