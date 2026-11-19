type Attempt = { lessonId?: number | null; lessonSlug?: string; score: number; total: number };

/** Compare attempts of different lengths without rewriting saved results. Input is newest first. */
export function practiceHistory(attempts: Attempt[], lessonId: number, slug: string) {
  const legacySlugs = new Set([slug, `${slug}-practice`, `lesson-${lessonId}-practice`]);
  const own = attempts.filter(attempt => attempt.lessonId != null ? attempt.lessonId === lessonId : legacySlugs.has(attempt.lessonSlug ?? ""));
  const last = own[0];
  const best = own.filter(attempt => Number.isFinite(attempt.score) && Number.isFinite(attempt.total) && attempt.total > 0 && attempt.score >= 0 && attempt.score <= attempt.total)
    .reduce<Attempt | undefined>((best, attempt) => !best || attempt.score * best.total > best.score * attempt.total ? attempt : best, undefined);
  return { attemptsCount: own.length, lastScore: last?.score, lastTotal: last?.total, bestScore: best?.score, bestTotal: best?.total };
}
