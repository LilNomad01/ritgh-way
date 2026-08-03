import { getAuthUser } from "../../../lib/auth";
import { getD1 } from "../../../../db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ authenticated: false }, { status: 401, headers: { "cache-control": "no-store" } });
  const account = await getD1().prepare("SELECT level, placement_score AS placementScore, goal, daily_minutes AS dailyMinutes, must_change_password AS mustChangePassword FROM user_accounts WHERE id = ?").bind(user.sub).first();
  return Response.json({ authenticated: true, profile: { fullName: user.fullName, email: user.email, role: user.role, ...account, mustChangePassword: Boolean((account as { mustChangePassword?: number } | null)?.mustChangePassword) } }, { headers: { "cache-control": "no-store" } });
}
