export const MASTERY_THRESHOLD = 80;

export type SkillResult = { skill: string; correct: number; total: number; percentage: number; lessonId?: number };
export type AnswerResult = { tags: string[]; correct: boolean; lessonId?: number };

export function scorePercentage(score: number, total: number) {
  return total > 0 ? Math.round(100 * score / total) : 0;
}

export function masteryReached(percentage?: number) {
  return percentage !== undefined && percentage >= MASTERY_THRESHOLD;
}

export function parseAnswerResults(value?: string | null): AnswerResult[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const results = (parsed as { results?: unknown }).results;
    if (!Array.isArray(results)) return [];
    return results.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())) : [];
      return typeof row.correct === "boolean" && tags.length ? [{ tags, correct: row.correct, lessonId: typeof row.lessonId === "number" ? row.lessonId : undefined }] : [];
    });
  } catch { return []; }
}

export function getWeakSkills(results: AnswerResult[]): SkillResult[] {
  const summary = new Map<string, { correct: number; total: number; lessonId?: number }>();
  for (const result of results) {
    for (const skill of new Set(result.tags.map((tag) => tag.trim()).filter(Boolean))) {
      const previous = summary.get(skill) ?? { correct: 0, total: 0, lessonId: result.lessonId };
      summary.set(skill, { correct: previous.correct + Number(result.correct), total: previous.total + 1, lessonId: previous.lessonId ?? result.lessonId });
    }
  }
  return [...summary].map(([skill, value]) => ({ skill, ...value, percentage: scorePercentage(value.correct, value.total) }))
    .sort((a, b) => a.percentage - b.percentage || b.total - a.total || a.skill.localeCompare(b.skill));
}

export function skillLabel(skill: string) {
  return skill.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

export function rotateExamQuestions<T extends { id: number; options: string[] }>(questions: T[], userId: number, examId: number, attemptNumber: number): T[] {
  let seed = (userId * 73856093 ^ examId * 19349663) >>> 0;
  const shuffle = <V>(values: V[]) => {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const swap = (seed >>> 0) % (index + 1);
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  };
  const base = shuffle(questions);
  const offset = base.length ? attemptNumber % base.length : 0;
  const rotated = [...base.slice(offset), ...base.slice(0, offset)];
  seed ^= (attemptNumber * 83492791) >>> 0;
  return rotated.map((question) => ({ ...question, options: shuffle(question.options) }));
}

export type LearningStep = {
  kind: "video" | "practice" | "exam" | "review" | "pending" | "complete";
  href: string;
  lessonId?: number;
  sectionId?: number;
};

export type LearningState = {
  lessonStates: { lessonId: number; sectionId: number; unlocked: boolean; completed: boolean; videoStatus: string; exerciseCount: number; exercisesCompleted: boolean }[];
  sectionStates: { sectionId: number; unlocked: boolean; examId?: number; examPassed: boolean; examAttempts: number; examUnlocked: boolean }[];
};

export function getNextLearningStep(academic: LearningState): LearningStep | null {
  if (!academic.sectionStates.length) return null;
  for (const section of academic.sectionStates) {
    if (!section.unlocked) continue;
    for (const lesson of academic.lessonStates.filter((item) => item.sectionId === section.sectionId)) {
      if (lesson.completed || !lesson.unlocked) continue;
      if (lesson.videoStatus === "completed" && lesson.exerciseCount > 0 && !lesson.exercisesCompleted) {
        return { kind: "practice", href: `/praticar/${lesson.lessonId}/sessao`, lessonId: lesson.lessonId, sectionId: section.sectionId };
      }
      return { kind: "video", href: `/aulas/${lesson.lessonId}`, lessonId: lesson.lessonId, sectionId: section.sectionId };
    }
    if (section.examPassed) continue;
    if (!section.examId || !section.examUnlocked) return { kind: "pending", href: `/aulas`, sectionId: section.sectionId };
    return { kind: section.examAttempts > 0 ? "review" : "exam", href: `/prova/${section.sectionId}`, sectionId: section.sectionId };
  }
  return { kind: "complete", href: "/jornada" };
}
