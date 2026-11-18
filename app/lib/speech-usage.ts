export type SpeechUsage = {
  model: string; requests: number; latencyMs: number; fallback: boolean;
  inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; inputAudioTokens?: number; billedSeconds?: number;
  estimatedUsd: number | null; rateDate: string;
};
type UsageCounts = Partial<Pick<SpeechUsage, "inputTokens" | "outputTokens" | "cachedInputTokens" | "inputAudioTokens" | "billedSeconds">>;

// Published standard rates checked 2026-11-17; custom models/unknown usage have no estimate.
export function estimateUsageCost(model: string, usage: UsageCounts): number | null {
  const values = Object.values(usage);
  if (values.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0)) return null;
  if (model === "gpt-transcribe") return usage.billedSeconds === undefined ? null : usage.billedSeconds / 60 * 0.0045;
  if (usage.inputTokens === undefined || usage.outputTokens === undefined) return null;
  if (model === "gpt-audio-1.5") {
    if (usage.inputAudioTokens === undefined || usage.inputAudioTokens > usage.inputTokens) return null;
    return ((usage.inputTokens - usage.inputAudioTokens) * 2.5 + usage.inputAudioTokens * 32 + usage.outputTokens * 10) / 1_000_000;
  }
  if (model === "gpt-6-luna") {
    const cached = usage.cachedInputTokens ?? 0;
    if (cached > usage.inputTokens) return null;
    return ((usage.inputTokens - cached) * 0.1 + cached * 0.01 + usage.outputTokens * 0.5) / 1_000_000;
  }
  return null;
}

export function speechUsage(model: string, raw: unknown, started: number, fallback = false): SpeechUsage {
  const usage = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const details = (usage.prompt_tokens_details ?? usage.input_token_details ?? {}) as Record<string, unknown>;
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  const counts: UsageCounts = {
    inputTokens: count(usage.prompt_tokens ?? usage.input_tokens), outputTokens: count(usage.completion_tokens ?? usage.output_tokens),
    cachedInputTokens: count(details.cached_tokens), inputAudioTokens: count(details.audio_tokens), billedSeconds: count(usage.seconds),
  };
  const reported = Object.fromEntries(Object.entries(counts).filter(([, value]) => value !== undefined));
  return { model, requests: 1, latencyMs: Date.now() - started, fallback, ...reported, estimatedUsd: estimateUsageCost(model, reported), rateDate: "2026-11-17" };
}
