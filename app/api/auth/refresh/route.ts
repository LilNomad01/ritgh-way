import { assertSameOrigin, ensureAuthSchema, getRefreshToken, hashToken, issueSession } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const token = getRefreshToken(request);
  const [sessionId] = token.split(".");
  if (!sessionId || !token) return Response.json({ error: "Sessão inválida." }, { status: 401 });
  const db = await ensureAuthSchema();
  const session = await db.prepare("SELECT user_id AS userId, refresh_token_hash AS refreshTokenHash, expires_at AS expiresAt, revoked_at AS revokedAt FROM auth_sessions WHERE id = ?").bind(sessionId).first<{ userId: number; refreshTokenHash: string; expiresAt: string; revokedAt: string | null }>();
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now() || session.refreshTokenHash !== await hashToken(token)) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const account = await db.prepare("SELECT id, email, full_name AS fullName, role, token_version AS tokenVersion, status FROM user_accounts WHERE id = ?").bind(session.userId).first<{ id: number; email: string; fullName: string; role: "admin" | "student"; tokenVersion: number; status: string }>();
  if (!account || account.status !== "active") return Response.json({ error: "Conta indisponível." }, { status: 401 });
  await db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").bind(new Date().toISOString(), sessionId).run();
  const rotated = await issueSession(request, account);
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const cookie of rotated.cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
