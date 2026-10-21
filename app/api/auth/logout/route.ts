import { assertSameOrigin, clearSessionCookies, getRefreshToken } from "../../../lib/auth";
import { assertSupabase, getSupabase } from "../../../../db/supabase";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const token = getRefreshToken(request);
  const [sessionId] = token.split(".");
  if (sessionId) assertSupabase(await getSupabase().from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId));
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const cookie of clearSessionCookies()) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
