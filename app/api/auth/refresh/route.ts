import { assertSameOrigin, getRefreshToken, hashToken, issueSession } from "../../../lib/auth";
import { assertSupabase, getSupabase } from "../../../../db/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const token = getRefreshToken(request);
  const [sessionId] = token.split(".");
  if (!sessionId || !token) return Response.json({ error: "Sessão inválida." }, { status: 401 });
  const db = getSupabase();
  const session = assertSupabase(await db.from("auth_sessions").select("user_id,refresh_token_hash,expires_at,revoked_at").eq("id", sessionId).maybeSingle());
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || session.refresh_token_hash !== await hashToken(token)) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const rawAccount = assertSupabase(await db.from("user_accounts").select("id,email,full_name,role,token_version,status").eq("id", session.user_id).maybeSingle());
  const account = rawAccount ? { id: rawAccount.id, email: rawAccount.email, fullName: rawAccount.full_name, role: rawAccount.role as "admin" | "student", tokenVersion: rawAccount.token_version, status: rawAccount.status } : null;
  if (!account || account.status !== "active") return Response.json({ error: "Conta indisponível." }, { status: 401 });
  assertSupabase(await db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId));
  const rotated = await issueSession(request, account);
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const cookie of rotated.cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
