import { getD1 } from "../../../db";
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
    const db = getD1();
    const exercise = await db.prepare("SELECT e.id, e.lesson_id AS lessonId, e.exercise_type AS type, e.prompt, e.options_json AS optionsJson, e.correct_answer AS correct, e.accepted_answers_json AS acceptedJson FROM lesson_exercises e JOIN lessons l ON l.id = e.lesson_id WHERE e.id = ? AND e.status = 'Publicado' AND l.status = 'Publicado' LIMIT 1").bind(exerciseId).first<{ id: number; lessonId: number; type: string; prompt: string; optionsJson: string | null; correct: string; acceptedJson: string | null }>();
    if (!exercise || !["speaking", "choice_speaking"].includes(exercise.type)) return Response.json({ error: "Este exercício não possui etapa de speaking." }, { status: 404 });
    const academic = await computeAcademicState(auth.sub);
    const lessonState = academic.lessonStates.find(item => item.lessonId === exercise.lessonId);
    if (!lessonState?.unlocked || lessonState.videoStatus !== "completed") return Response.json({ error: "Esta prática ainda não está liberada." }, { status: 403 });
    const session = await db.prepare("SELECT id, exercise_plan_json AS planJson FROM practice_sessions WHERE user_id = ? AND lesson_id = ? AND status = 'active' LIMIT 1").bind(auth.sub, exercise.lessonId).first<{ id: number; planJson: string }>();
    if (!session) return Response.json({ error: "Inicie a prática antes de gravar." }, { status: 409 });
    const plan = JSON.parse(session.planJson || "[]") as { id?: number }[];
    if (!plan.some(item => item.id === exercise.id)) return Response.json({ error: "O exercício não pertence a esta tentativa." }, { status: 403 });
    const recent = await db.prepare("SELECT COUNT(*) AS count FROM speaking_attempts WHERE user_id = ? AND created_at >= ?").bind(auth.sub, new Date(Date.now() - 60_000).toISOString()).first<{ count: number }>();
    if (Number(recent?.count ?? 0) >= 10) return Response.json({ error: "Aguarde um minuto antes de enviar novas gravações." }, { status: 429 });
    const options = parseList(exercise.optionsJson);
    const target = exercise.type === "choice_speaking" && options.includes(requestedTarget) ? requestedTarget : exercise.correct;
    const accepted = exercise.type === "choice_speaking" ? [] : parseList(exercise.acceptedJson);
    const transcribed = await transcribeSpeech(audio);
    const result = await evaluateSpeaking(transcribed.text, target, accepted, exercise.prompt, transcribed.provider);
    const previous = await db.prepare("SELECT COUNT(*) AS count FROM speaking_attempts WHERE user_id = ? AND exercise_id = ?").bind(auth.sub, exercise.id).first<{ count: number }>();
    const attemptNumber = Number(previous?.count ?? 0) + 1;
    const inserted = await db.prepare("INSERT INTO speaking_attempts (user_id, lesson_id, exercise_id, practice_session_id, attempt_number, transcription, expected_text, conceptual_status, conceptual_score, vocabulary_score, grammar_score, pronunciation_score, fluency_score, result_json, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'completed', ?)")
      .bind(auth.sub, exercise.lessonId, exercise.id, session.id, attemptNumber, result.transcription, target, result.intent.status, result.intent.score, result.vocabulary.score, result.grammar.score, JSON.stringify(result), result.provider, new Date().toISOString()).run();
    return Response.json({ attemptId: inserted.meta.last_row_id, attemptNumber, result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SPEECH_NOT_CONFIGURED") return Response.json({ error: "O serviço de transcrição ainda não foi configurado pelo administrador." }, { status: 503 });
    if (code === "NO_SPEECH") return Response.json({ error: "Nenhuma fala foi detectada. Tente novamente em um lugar mais silencioso." }, { status: 422 });
    console.error("Speaking processing failed", error);
    return Response.json({ error: "Não foi possível transcrever sua fala agora. Tente novamente." }, { status: 503 });
  }
}
