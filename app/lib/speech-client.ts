export function speechRequestOutcome(status: number, data: { status?: string; attemptId?: number; result?: unknown }) {
  if (data.status === "failed") return "failed";
  if (status === 200 && data.attemptId && data.result) return "completed";
  if (status === 404) return "not_found";
  if (status >= 400 && status < 500) return "rejected";
  return "pending";
}
