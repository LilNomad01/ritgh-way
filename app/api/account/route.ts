import { assertSameOrigin, hashPassword, issueSession, passwordPolicyError, randomSecret } from "../../lib/auth";
import { placementResult } from "../../lib/placement";
import { assertSupabase, getSupabase } from "../../../db/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem da requisição não autorizada." }, { status: 403 });
  try {
    const payload = await request.json() as { action?: string; fullName?: string; email?: string; password?: string; level?: string; placementScore?: number; goal?: string; dailyMinutes?: number; answers?: string[] };
    if (payload.action !== "register") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const fullName = payload.fullName?.trim() ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    if (fullName.length < 2 || !email.includes("@")) return Response.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
    const passwordError = passwordPolicyError(password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    const db = getSupabase();
    const existing = assertSupabase(await db.from("user_accounts").select("id").eq("email", email).maybeSingle());
    if (existing) return Response.json({ error: "Já existe uma conta com esse e-mail." }, { status: 409 });
    const salt = randomSecret(18);
    const passwordHash = await hashPassword(password, salt);
    const now = new Date().toISOString();
    const answers = Array.isArray(payload.answers) ? payload.answers.slice(0, 8).map(value => typeof value === "string" ? value.slice(0, 1000) : "") : [];
    const { level, score: placementScore } = placementResult(answers);
    const created = assertSupabase(await db.from("user_accounts").insert({ email, full_name: fullName, password_hash: passwordHash, password_salt: salt, role: "student", status: "active", level, placement_score: placementScore, goal: payload.goal ?? null, daily_minutes: Number(payload.dailyMinutes) || 10, token_version: 1, must_change_password: 0, created_at: now, updated_at: now }).select("id").single());
    if (!created) throw new Error("O Supabase não retornou a conta criada.");
    const userId = Number(created.id);
    const [student, placement] = await Promise.all([
      db.from("students").upsert({ full_name: fullName, email, level, placement_score: placementScore, status: "Ativo", created_at: now }, { onConflict: "email" }),
      db.from("placement_attempts").insert({ user_id: userId, score: placementScore, total_questions: 8, resulting_level: level, answers_json: JSON.stringify(answers), created_at: now }),
    ]);
    assertSupabase(student); assertSupabase(placement);
    const account = { id: userId, email, fullName, role: "student" as const, tokenVersion: 1 };
    const session = await issueSession(request, account);
    const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
    for (const cookie of session.cookies) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ profile: { fullName, email, level, placementScore, goal: payload.goal, dailyMinutes: Number(payload.dailyMinutes) || 10, role: "student" } }), { status: 201, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar a conta." }, { status: 500 });
  }
}
