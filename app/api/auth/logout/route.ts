import { assertSameOrigin, clearSessionCookies, ensureAuthSchema, getRefreshToken } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const token = getRefreshToken(request);
  const [sessionId] = token.split(".");
  if (sessionId) await (await ensureAuthSchema()).prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").bind(new Date().toISOString(), sessionId).run();
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const cookie of clearSessionCookies()) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
