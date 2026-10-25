import { env } from "cloudflare:workers";
import { assessAnswer, normalizeAnswer } from "./exercise-answers";

export type SpeakingStatus = "correct" | "attention" | "review";
export type SpeakingMetric = { available: boolean; score: number | null; status: SpeakingStatus; feedback: string };
export type SpeakingEvaluation = {
  transcription: string;
  intent: SpeakingMetric;
  vocabulary: SpeakingMetric & { used: string[]; difficulties: string[] };
  grammar: SpeakingMetric;
  naturalness: SpeakingMetric;
  pronunciation: SpeakingMetric;
  fluency: SpeakingMetric;
  summary: string;
  provider: string;
};

type SpeechSecrets = {
  OPENAI_API_KEY?: string;
  SPEECH_TRANSCRIPTION_MODEL?: string;
  SPEECH_EVALUATION_MODEL?: string;
};

function secrets() { return env as unknown as SpeechSecrets; }

function statusFor(score: number): SpeakingStatus {
  return score >= 85 ? "correct" : score >= 60 ? "attention" : "review";
}

function fallbackEvaluation(transcription: string, reference: string, accepted: string[], provider: string): SpeakingEvaluation {
  const assessment = assessAnswer(transcription, reference, accepted);
  const actual = new Set(normalizeAnswer(transcription).split(" ").filter(Boolean));
  const expected = normalizeAnswer(assessment.expected).split(" ").filter(Boolean);
  const used = expected.filter(word => actual.has(word));
  const difficulties = expected.filter(word => !actual.has(word));
  const score = Math.round(100 * used.length / Math.max(expected.length, 1));
  const intentScore = assessment.status === "correct" ? 100 : assessment.status === "almost" ? Math.max(65, score) : score;
  const intentStatus = statusFor(intentScore);
  return {
    transcription,
    intent: { available: true, score: intentScore, status: intentStatus, feedback: intentStatus === "correct" ? "Sua resposta comunica a intenção esperada." : intentStatus === "attention" ? "Sua resposta foi compreendida, mas pode ficar mais completa." : "Revise a ideia principal e tente novamente." },
    vocabulary: { available: true, score, status: statusFor(score), used: [...new Set(used)], difficulties: [...new Set(difficulties)], feedback: difficulties.length ? `Pratique: ${[...new Set(difficulties)].join(", ")}.` : "Você usou o vocabulário essencial desta situação." },
    grammar: { available: false, score: null, status: "attention", feedback: "A análise gramatical detalhada não ficou disponível nesta tentativa." },
    naturalness: { available: false, score: null, status: "attention", feedback: "A naturalidade não ficou disponível nesta tentativa." },
    pronunciation: { available: false, score: null, status: "attention", feedback: "A transcrição não mede pronúncia. Esta métrica não foi inventada." },
    fluency: { available: false, score: null, status: "attention", feedback: "Ainda não há dados confiáveis para medir fluidez." },
    summary: intentStatus === "correct" ? "Muito bem! Sua fala transmitiu a mensagem." : "Bom trabalho. Veja a dica e grave novamente se quiser melhorar.",
    provider,
  };
}

export async function transcribeSpeech(file: File) {
  const apiKey = secrets().OPENAI_API_KEY;
  if (!apiKey) throw new Error("SPEECH_NOT_CONFIGURED");
  const form = new FormData();
  form.set("file", file, file.name || "speaking.webm");
  form.set("model", secrets().SPEECH_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
  form.set("language", "en");
  form.set("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form });
  if (!response.ok) { console.error("Speech transcription failed", response.status); throw new Error("TRANSCRIPTION_FAILED"); }
  const result = await response.json() as { text?: string };
  const text = result.text?.trim() ?? "";
  if (!text) throw new Error("NO_SPEECH");
  return { text, provider: `openai:${secrets().SPEECH_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe"}` };
}

export async function evaluateSpeaking(transcription: string, reference: string, accepted: string[], context: string, provider: string): Promise<SpeakingEvaluation> {
  const apiKey = secrets().OPENAI_API_KEY;
  const fallback = fallbackEvaluation(transcription, reference, accepted, provider);
  if (!apiKey) return fallback;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: secrets().SPEECH_EVALUATION_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "speaking_content_evaluation", strict: true, schema: { type: "object", additionalProperties: false, required: ["intent_status", "intent_score", "vocabulary_score", "grammar_score", "naturalness_status", "summary", "feedback", "vocabulary_used", "difficulties"], properties: {
          intent_status: { type: "string", enum: ["correct", "attention", "review"] }, intent_score: { type: "integer", minimum: 0, maximum: 100 }, vocabulary_score: { type: "integer", minimum: 0, maximum: 100 }, grammar_score: { type: "integer", minimum: 0, maximum: 100 }, naturalness_status: { type: "string", enum: ["correct", "attention", "review"] }, summary: { type: "string" }, feedback: { type: "string" }, vocabulary_used: { type: "array", items: { type: "string" } }, difficulties: { type: "array", items: { type: "string" } },
        } } } },
        messages: [
          { role: "system", content: "Você avalia conteúdo de respostas faladas de estudantes de inglês. Aceite sinônimos e formas naturais que cumpram a intenção. Não avalie pronúncia nem fluidez: você recebeu apenas transcrição. Seja pedagógico, breve e responda em português no feedback." },
          { role: "user", content: JSON.stringify({ context, reference, accepted, transcription }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`evaluation ${response.status}`);
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { intent_status: SpeakingStatus; intent_score: number; vocabulary_score: number; grammar_score: number; naturalness_status: SpeakingStatus; summary: string; feedback: string; vocabulary_used: string[]; difficulties: string[] };
    return {
      ...fallback,
      intent: { available: true, score: parsed.intent_score, status: parsed.intent_status, feedback: parsed.feedback },
      vocabulary: { available: true, score: parsed.vocabulary_score, status: statusFor(parsed.vocabulary_score), used: parsed.vocabulary_used, difficulties: parsed.difficulties, feedback: parsed.difficulties.length ? `Pratique: ${parsed.difficulties.join(", ")}.` : "Vocabulário adequado para a situação." },
      grammar: { available: true, score: parsed.grammar_score, status: statusFor(parsed.grammar_score), feedback: parsed.grammar_score >= 85 ? "Estrutura gramatical bem construída." : parsed.feedback },
      naturalness: { available: true, score: null, status: parsed.naturalness_status, feedback: parsed.feedback },
      summary: parsed.summary,
    };
  } catch (error) {
    console.error("Speaking content evaluation fallback", error);
    return fallback;
  }
}
