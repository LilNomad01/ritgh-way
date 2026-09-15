export type RotationVariant = {
  title?: string;
  prompt: string;
  options?: string[];
  correct: string;
  accepted?: string[];
  explanation?: string;
};

export type PracticeExerciseSource = {
  id: number;
  type: string;
  category: string;
  title: string;
  prompt: string;
  optionsJson?: string | null;
  correct: string;
  acceptedJson?: string | null;
  explanation: string;
  speech?: string | null;
  audioKey?: string | null;
  skillsJson?: string | null;
  rotationVariantsJson?: string | null;
};

export type PracticePlanItem = {
  id: number;
  type: string;
  category: string;
  title: string;
  prompt: string;
  options: string[];
  correct: string;
  accepted: string[];
  explanation: string;
  speech?: string;
  audioKey?: string;
  skills: string[];
  variantKey: number;
};

export function parseStringList(value?: string | null) {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseRotationVariants(value?: string | null): RotationVariant[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
      const correct = typeof candidate.correct === "string" ? candidate.correct.trim() : "";
      if (!prompt || !correct) return [];
      return [{
        title: typeof candidate.title === "string" ? candidate.title.trim() : undefined,
        prompt,
        correct,
        options: Array.isArray(candidate.options) ? candidate.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim())) : undefined,
        accepted: Array.isArray(candidate.accepted) ? candidate.accepted.filter((answer): answer is string => typeof answer === "string" && Boolean(answer.trim())) : undefined,
        explanation: typeof candidate.explanation === "string" ? candidate.explanation.trim() : undefined,
      }];
    });
  } catch {
    return [];
  }
}

export function parsePracticePlan(value?: string | null): PracticePlanItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PracticePlanItem => Boolean(item && typeof item === "object" && Number((item as PracticePlanItem).id) && typeof (item as PracticePlanItem).correct === "string"));
  } catch {
    return [];
  }
}

function shuffled<T>(items: T[]) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function baseItem(source: PracticeExerciseSource): PracticePlanItem {
  return {
    id: source.id,
    type: source.type,
    category: source.category,
    title: source.title,
    prompt: source.prompt,
    options: parseStringList(source.optionsJson),
    correct: source.correct,
    accepted: parseStringList(source.acceptedJson),
    explanation: source.explanation,
    speech: source.speech ?? undefined,
    audioKey: source.audioKey ?? undefined,
    skills: parseStringList(source.skillsJson),
    variantKey: -1,
  };
}

export function buildPracticePlan(sources: PracticeExerciseSource[], smartRotation: boolean, previous: PracticePlanItem[] = []) {
  const previousById = new Map(previous.map((item) => [item.id, item.variantKey]));
  let plan = sources.map((source) => {
    const base = baseItem(source);
    if (!smartRotation || source.type === "listening" || source.type === "listening_transcription") return base;
    const variants = parseRotationVariants(source.rotationVariantsJson);
    const candidates = [-1, ...variants.map((_, index) => index)];
    const previousKey = previousById.get(source.id);
    const eligible = candidates.length > 1 ? candidates.filter((key) => key !== previousKey) : candidates;
    const variantKey = eligible[Math.floor(Math.random() * eligible.length)] ?? -1;
    if (variantKey < 0) return base;
    const variant = variants[variantKey];
    return {
      ...base,
      title: variant.title || base.title,
      prompt: variant.prompt,
      options: variant.options ?? base.options,
      correct: variant.correct,
      accepted: variant.accepted ?? [],
      explanation: variant.explanation || base.explanation,
      variantKey,
    };
  });

  if (!smartRotation) return plan;
  plan = plan.map((item) => item.type === "choice" ? { ...item, options: shuffled(item.options) } : item);
  const shuffledPlan = shuffled(plan);
  if (shuffledPlan.length > 1 && previous.length === shuffledPlan.length && shuffledPlan.every((item, index) => item.id === previous[index]?.id)) {
    shuffledPlan.push(shuffledPlan.shift() as PracticePlanItem);
  }
  return shuffledPlan;
}
