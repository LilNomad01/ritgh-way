import { getAuthUser } from "../../../lib/auth";
import { assertSupabase, getSupabase } from "../../../../db/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ authenticated: false }, { status: 401, headers: { "cache-control": "no-store" } });
  const account = assertSupabase(await getSupabase().from("user_accounts").select("level,placement_score,goal,daily_minutes,must_change_password").eq("id", user.sub).maybeSingle());
  return Response.json({ authenticated: true, profile: { fullName: user.fullName, email: user.email, role: user.role, level: account?.level, placementScore: account?.placement_score, goal: account?.goal, dailyMinutes: account?.daily_minutes, mustChangePassword: Boolean(account?.must_change_password) } }, { headers: { "cache-control": "no-store" } });
}
