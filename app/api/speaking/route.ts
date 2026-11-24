import { assertSupabase, getSupabase } from "../../../db/supabase";
import { assertSameOrigin, requireAuth } from "../../lib/auth";
import { canAccessPractice, computeAcademicState } from "../../lib/academic";
import { evaluateAcoustics, evaluateSpeaking, speakingTarget, SpeechProcessingError, transcribeSpeech } from "../../lib/speech";
import { parsePracticePlan } from "../../lib/practice-rotation";
import { createHash } from "node:crypto";
import { inspectWav } from "../../lib/speech-audio";
import { matchesSpeechRequest } from "../../lib/speech-contracts";
import { completedSpeechResponse, findSpeechRequest, pendingSpeechResponse } from "../../lib/speech-jobs";
import type { SpeechUsage } from "../../lib/speech-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const MAX_SIZE = 6 * 1024 * 1024;
const TYPES = new Set(["audio/wav", "audio/x-wav"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const requestId = new URL(request.url).searchParams.get("requestId") ?? "";
  if (!UUID.test(requestId)) return Response.json({ error: "Identificador inválido." }, { status: 400 });
  try {
    const row = await findSpeechRequest(requestId, auth.sub);
    if (!row) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
    return row.status === "completed" ? completedSpeechResponse(row.attempt_id, auth.sub) : pendingSpeechResponse(row.status);
  } catch { return Response.json({ error: "Não foi possível consultar a análise." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  let claimedRequestId: string | null = null;
  let usage: SpeechUsage[] = [];
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const exerciseId = Number(form.get("exerciseId"));
    const requestId = String(form.get("requestId") ?? "");
    const requestedTarget = String(form.get("targetText") ?? "").trim();
    if (!(audio instanceof File) || !Number.isSafeInteger(exerciseId) || exerciseId <= 0 || !UUID.test(requestId)) return Response.json({ error: "Gravação, exercício ou identificador inválido. Atualize a página." }, { status: 400 });
    if (!TYPES.has(audio.type.split(";")[0]) || audio.size < 800) return Response.json({ error: "Não detectamos áudio suficiente. Grave novamente, falando perto do microfone." }, { status: 400 });
    if (audio.size > MAX_SIZE) return Response.json({ error: "A gravação ultrapassou o limite de 6 MB." }, { status: 413 });
    const bytes = new Uint8Array(await audio.arrayBuffer()), facts = inspectWav(bytes);
    const audioHash = createHash("sha256").update(bytes).digest("hex");
    const db = getSupabase();
    const existing = await findSpeechRequest(requestId, auth.sub);
    if (existing) {
      if (!matchesSpeechRequest(existing, { user_id: auth.sub, exercise_id: exerciseId, practice_session_id: existing.practice_session_id, audio_hash: audioHash, target_text: requestedTarget })) return Response.json({ error: "Este identificador pertence a outra gravação." }, { status: 409 });
      return existing.status === "completed" ? completedSpeechResponse(existing.attempt_id, auth.sub) : pendingSpeechResponse(existing.status);
    }
    const exercise = assertSupabase(await db.from("lesson_exercises").select("id,lessonId:lesson_id,type:exercise_type,prompt,optionsJson:options_json,correct:correct_answer,acceptedJson:accepted_answers_json").eq("id", exerciseId).eq("status", "Publicado").maybeSingle()) as { id: number; lessonId: number; type: string; prompt: string; optionsJson: string | null; correct: string; acceptedJson: string | null } | null;
    if (!exercise || !["speaking", "choice_speaking"].includes(exercise.type)) return Response.json({ error: "Este exercício não possui etapa de speaking." }, { status: 404 });
    const lesson = assertSupabase(await db.from("lessons").select("id").eq("id", exercise.lessonId).eq("status", "Publicado").maybeSingle());
    if (!lesson) return Response.json({ error: "Este exercício não possui etapa de speaking." }, { status: 404 });
    const academic = await computeAcademicState(auth.sub);
    const lessonState = academic.lessonStates.find(item => item.lessonId === exercise.lessonId);
    if (!canAccessPractice(lessonState)) return Response.json({ error: "Esta prática ainda não está liberada." }, { status: 403 });
    const session = assertSupabase(await db.from("practice_sessions").select("id,planJson:exercise_plan_json").eq("user_id", auth.sub).eq("lesson_id", exercise.lessonId).eq("status", "active").maybeSingle()) as { id: number; planJson: string } | null;
    if (!session) return Response.json({ error: "Inicie a prática antes de gravar." }, { status: 409 });
    const question = parsePracticePlan(session.planJson).find(item => item.id === exercise.id);
    if (!question || !["speaking", "choice_speaking"].includes(question.type)) return Response.json({ error: "O exercício não pertence a esta tentativa." }, { status: 403 });
    const { target, accepted } = speakingTarget(question, requestedTarget);
    const binding = { user_id: auth.sub, exercise_id: exerciseId, practice_session_id: session.id, audio_hash: audioHash, target_text: target };
    const claim = await db.rpc("claim_speech_request", { p_request_id: requestId, p_user_id: auth.sub, p_exercise_id: exerciseId, p_session_id: session.id, p_audio_hash: audioHash, p_target: target });
    if (claim.error?.message.includes("SPEECH_RATE_LIMIT")) return Response.json({ error: "Aguarde um minuto antes de enviar novas gravações." }, { status: 429 });
    const job = assertSupabase(claim) as { claimed: boolean; request: typeof binding & { status: string; attempt_id: number } };
    if (!matchesSpeechRequest(job.request, binding)) return Response.json({ error: "Este identificador pertence a outra gravação." }, { status: 409 });
    if (!job.claimed) return job.request.status === "completed" ? completedSpeechResponse(job.request.attempt_id, auth.sub) : pendingSpeechResponse(job.request.status);
    claimedRequestId = requestId;
    const transcribed = await transcribeSpeech(audio);
    usage = [transcribed.usage];
    const [content, acoustic] = await Promise.all([evaluateSpeaking(transcribed.text, target, accepted, question.prompt, transcribed.provider), evaluateAcoustics(audio, target, facts)]);
    usage = [...usage, ...(content.usage ?? []), ...acoustic.usage];
    const result = { ...content, ...acoustic, usage };
    const attemptId = assertSupabase(await db.rpc("complete_speech_request", { p_request_id: requestId, p_result: result, p_provider: result.provider })) as number;
    console.info("speech_usage", JSON.stringify({ requestId, durationSeconds: facts.durationSeconds, providers: result.usage }));
    return completedSpeechResponse(attemptId, auth.sub);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (error instanceof SpeechProcessingError) usage.push(error.usage);
    if (claimedRequestId) {
      await getSupabase().from("speech_processing_requests").update({ status: "failed", usage_metadata: usage, error_code: ["SPEECH_NOT_CONFIGURED", "SPEECH_AUTH_FAILED", "SPEECH_LIMIT_REACHED", "NO_SPEECH"].includes(code) ? code : "PROCESSING_FAILED", updated_at: new Date().toISOString() }).eq("request_id", claimedRequestId).eq("status", "processing");
      console.info("speech_usage", JSON.stringify({ requestId: claimedRequestId, failed: true, providers: usage }));
    }
    if (["INVALID_AUDIO", "INVALID_DURATION", "SILENT_AUDIO"].includes(code)) return Response.json({ code, error: "Grave de 1 a 60 segundos, falando perto do microfone em um ambiente silencioso." }, { status: 422 });
    if (code === "SPEECH_NOT_CONFIGURED") return Response.json({ code, error: "O serviço de transcrição ainda não foi configurado pelo administrador." }, { status: 503 });
    if (code === "SPEECH_AUTH_FAILED") return Response.json({ code, error: "A credencial do serviço de fala está inválida. O administrador precisa atualizar a configuração." }, { status: 503 });
    if (code === "SPEECH_LIMIT_REACHED") return Response.json({ code, error: "O serviço de fala atingiu o limite de uso ou saldo. Sua gravação foi mantida; tente novamente mais tarde." }, { status: 429 });
    if (code === "INVALID_SPEAKING_TARGET") return Response.json({ code, error: "Escolha uma das alternativas desta tentativa antes de gravar." }, { status: 400 });
    if (code === "NO_SPEECH") return Response.json({ code, error: "Nenhuma fala foi detectada. Tente novamente em um lugar mais silencioso." }, { status: 422 });
    console.error("Speaking processing failed", { code: "PROCESSING_FAILED" });
    return Response.json({ error: "Não foi possível transcrever sua fala agora. Tente novamente." }, { status: 503 });
  }
}
