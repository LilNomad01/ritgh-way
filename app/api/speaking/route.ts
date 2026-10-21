import { assertSupabase, getSupabase } from "../../../db/supabase";
import { assertSameOrigin, requireAuth } from "../../lib/auth";
import { computeAcademicState } from "../../lib/academic";
import { evaluateSpeaking, transcribeSpeech } from "../../lib/speech";

export const dynamic = "force-dynamic";
const MAX_SIZE = 6 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;
const TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav", "audio/aac"]);

function parseList(value?: string | null) { try { const parsed: unknown = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const exerciseId = Number(form.get("exerciseId"));
    const duration = Number(form.get("durationSeconds"));
    const requestedTarget = String(form.get("targetText") ?? "").trim();
    if (!(audio instanceof File) || !exerciseId) return Response.json({ error: "Gravação ou exercício inválido." }, { status: 400 });
    if (!TYPES.has(audio.type.split(";")[0]) || audio.size < 800) return Response.json({ error: "Não detectamos áudio suficiente. Grave novamente, falando perto do microfone." }, { status: 400 });
    if (audio.size > MAX_SIZE) return Response.json({ error: "A gravação ultrapassou o limite de 6 MB." }, { status: 413 });
    if (!Number.isFinite(duration) || duration < 0.7) return Response.json({ error: "A gravação ficou muito curta. Fale a frase completa." }, { status: 400 });
    if (duration > MAX_DURATION_SECONDS) return Response.json({ error: "Grave uma resposta de até 60 segundos." }, { status: 413 });
    const db = getSupabase();
    const exercise = assertSupabase(await db.from("lesson_exercises").select("id,lessonId:lesson_id,type:exercise_type,prompt,optionsJson:options_json,correct:correct_answer,acceptedJson:accepted_answers_json").eq("id", exerciseId).eq("status", "Publicado").maybeSingle()) as { id: number; lessonId: number; type: string; prompt: string; optionsJson: string | null; correct: string; acceptedJson: string | null } | null;
    if (!exercise || !["speaking", "choice_speaking"].includes(exercise.type)) return Response.json({ error: "Este exercício não possui etapa de speaking." }, { status: 404 });
    const lesson = assertSupabase(await db.from("lessons").select("id").eq("id", exercise.lessonId).eq("status", "Publicado").maybeSingle());
    if (!lesson) return Response.json({ error: "Este exercício não possui etapa de speaking." }, { status: 404 });
    const academic = await computeAcademicState(auth.sub);
    const lessonState = academic.lessonStates.find(item => item.lessonId === exercise.lessonId);
    if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Esta prática ainda não está liberada." }, { status: 403 });
    const session = assertSupabase(await db.from("practice_sessions").select("id,planJson:exercise_plan_json").eq("user_id", auth.sub).eq("lesson_id", exercise.lessonId).eq("status", "active").maybeSingle()) as { id: number; planJson: string } | null;
    if (!session) return Response.json({ error: "Inicie a prática antes de gravar." }, { status: 409 });
    const plan = JSON.parse(session.planJson || "[]") as { id?: number }[];
    if (!plan.some(item => item.id === exercise.id)) return Response.json({ error: "O exercício não pertence a esta tentativa." }, { status: 403 });
    const recent = await db.from("speaking_attempts").select("id", { count: "exact", head: true }).eq("user_id", auth.sub).gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if (recent.error) throw new Error(`Supabase: ${recent.error.message}`);
    if (Number(recent.count ?? 0) >= 10) return Response.json({ error: "Aguarde um minuto antes de enviar novas gravações." }, { status: 429 });
    const options = parseList(exercise.optionsJson);
    const target = exercise.type === "choice_speaking" && options.includes(requestedTarget) ? requestedTarget : exercise.correct;
    const accepted = exercise.type === "choice_speaking" ? [] : parseList(exercise.acceptedJson);
    const transcribed = await transcribeSpeech(audio);
    const result = await evaluateSpeaking(transcribed.text, target, accepted, exercise.prompt, transcribed.provider);
    const previous = await db.from("speaking_attempts").select("id", { count: "exact", head: true }).eq("user_id", auth.sub).eq("exercise_id", exercise.id);
    if (previous.error) throw new Error(`Supabase: ${previous.error.message}`);
    const attemptNumber = Number(previous.count ?? 0) + 1;
    const inserted = assertSupabase(await db.from("speaking_attempts").insert({ user_id: auth.sub, lesson_id: exercise.lessonId, exercise_id: exercise.id, practice_session_id: session.id, attempt_number: attemptNumber, transcription: result.transcription, expected_text: target, conceptual_status: result.intent.status, conceptual_score: result.intent.score, vocabulary_score: result.vocabulary.score, grammar_score: result.grammar.score, pronunciation_score: null, fluency_score: null, result_json: JSON.stringify(result), provider: result.provider, status: "completed", created_at: new Date().toISOString() }).select("id").single()) as { id: number } | null;
    if (!inserted) throw new Error("O Supabase não retornou a tentativa criada.");
    return Response.json({ attemptId: inserted.id, attemptNumber, result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SPEECH_NOT_CONFIGURED") return Response.json({ error: "O serviço de transcrição ainda não foi configurado pelo administrador." }, { status: 503 });
    if (code === "NO_SPEECH") return Response.json({ error: "Nenhuma fala foi detectada. Tente novamente em um lugar mais silencioso." }, { status: 422 });
    console.error("Speaking processing failed", error);
    return Response.json({ error: "Não foi possível transcrever sua fala agora. Tente novamente." }, { status: 503 });
  }
}
