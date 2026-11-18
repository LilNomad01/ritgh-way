import { createHash } from "node:crypto";

type SpeechBinding = { user_id: number | string; exercise_id: number; practice_session_id: number; audio_hash: string; target_text: string };
export function matchesSpeechRequest(a: SpeechBinding, b: SpeechBinding): boolean {
  return String(a.user_id) === String(b.user_id) && a.exercise_id === b.exercise_id && a.practice_session_id === b.practice_session_id && a.audio_hash === b.audio_hash && a.target_text === b.target_text;
}

export function referenceMatchesTarget(reference: string, target: string): boolean {
  return Boolean(normalizeReferenceText(reference)) && normalizeReferenceText(reference) === normalizeReferenceText(target);
}

export function normalizeReferenceText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().replace(/[.,!?;:…]+$/u, "").trim();
}

export function referenceTextHash(text: string): string {
  return createHash("sha256").update(normalizeReferenceText(text)).digest("hex");
}

export function speechRequestExpired(updatedAt: string, now = Date.now()): boolean {
  return now - Date.parse(updatedAt) > 120_000;
}

