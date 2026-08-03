import { getD1 } from "../../../db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { action?: string; email?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";
    if (payload.action !== "login" || !email) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
    const student = await getD1().prepare("SELECT full_name AS fullName, email, level, placement_score AS placementScore FROM students WHERE email = ? LIMIT 1").bind(email).first();
    if (!student) return Response.json({ error: "Não encontramos uma conta com esse e-mail." }, { status: 404 });
    return Response.json({ profile: student });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível entrar." }, { status: 500 });
  }
}
