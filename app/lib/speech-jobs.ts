import { assertSupabase, getSupabase } from "../../db/supabase";
import type { SpeakingEvaluation } from "./speech";
import { speechRequestExpired } from "./speech-contracts";

export async function findSpeechRequest(requestId: string, userId: number | string) {
  const db = getSupabase();
  const read = () => db.from("speech_processing_requests").select("user_id,exercise_id,practice_session_id,audio_hash,target_text,status,attempt_id,updated_at").eq("request_id", requestId).eq("user_id", userId).maybeSingle();
  const row = assertSupabase(await read());
  if (row?.status === "processing" && speechRequestExpired(row.updated_at)) {
    // A crashed function cannot resume after its 90-second runtime. Never restart paid work automatically.
    assertSupabase(await db.from("speech_processing_requests").update({ status: "failed", error_code: "PROCESSING_TIMEOUT", updated_at: new Date().toISOString() }).eq("request_id", requestId).eq("user_id", userId).eq("status", "processing").lt("updated_at", new Date(Date.now() - 120_000).toISOString()));
    return assertSupabase(await read());
  }
  return row;
}

export async function completedSpeechResponse(attemptId: number, userId: number | string) {
  const row = assertSupabase(await getSupabase().from("speaking_attempts").select("id,attempt_number,result_json").eq("id", attemptId).eq("user_id", userId).eq("status", "completed").maybeSingle()) as { id: number; attempt_number: number; result_json: string } | null;
  if (!row) return Response.json({ error: "Tentativa não encontrada." }, { status: 404 });
  return Response.json({ attemptId: row.id, attemptNumber: row.attempt_number, result: JSON.parse(row.result_json) as SpeakingEvaluation }, { headers: { "cache-control": "private, no-store" } });
}

export function pendingSpeechResponse(status: string) {
  return status === "processing"
    ? Response.json({ status: "processing", error: "A análise ainda está em andamento. Consulte o resultado sem reenviar o áudio." }, { status: 202, headers: { "retry-after": "3", "cache-control": "private, no-store" } })
    : Response.json({ status: "failed", code: "REQUEST_FAILED", error: "Esta análise falhou. Sua gravação foi mantida; confirme uma nova análise para tentar novamente." }, { status: 409, headers: { "cache-control": "private, no-store" } });
}
