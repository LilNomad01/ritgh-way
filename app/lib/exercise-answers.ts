export function normalizeAnswer(value: string): string {
  return value.toLowerCase().replace(/[’‘]/g, "'")
    .replace(/\bi'm\b/g, "i am").replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not").replace(/\bshan't\b/g, "shall not")
    .replace(/n't\b/g, " not").replace(/\b(you|we|they)'re\b/g, "$1 are")
    .replace(/\b(i|you|we|they)'ve\b/g, "$1 have")
    .replace(/\b(i|you|he|she|it|we|they)'ll\b/g, "$1 will")
    .replace(/\bcan not\b/g, "cannot")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export type AnswerResult = { status: "correct" | "almost" | "wrong"; expected: string; words: { text: string; matched: boolean }[] };

// Word alignment keeps omitted/extra words from shifting every following word.
function align(expected: string[], actual: string[]) {
  const dp = Array.from({ length: expected.length + 1 }, () => Array<number>(actual.length + 1).fill(0));
  for (let i = expected.length - 1; i >= 0; i--) for (let j = actual.length - 1; j >= 0; j--)
    dp[i][j] = expected[i] === actual[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matches = new Set<number>();
  let i = 0, j = 0;
  while (i < expected.length && j < actual.length) {
    if (expected[i] === actual[j]) { matches.add(i); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return matches;
}

export function assessAnswer(answer: string, correct: string, accepted: string[] = []): AnswerResult {
  const actual = normalizeAnswer(answer).slice(0, 1000).split(" ").filter(Boolean);
  const candidates = [correct, ...accepted].filter(value => typeof value === "string" && value.trim());
  let best: AnswerResult = { status: "wrong", expected: correct, words: [] }, bestRatio = -1;
  for (const expected of candidates) {
    const words = normalizeAnswer(expected).slice(0, 1000).split(" ").filter(Boolean);
    const matches = align(words, actual);
    const exact = words.length > 0 && words.join(" ") === actual.join(" ");
    const ratio = matches.size / Math.max(words.length, actual.length, 1);
    if (exact || ratio > bestRatio) {
      bestRatio = ratio;
      best = { status: exact ? "correct" : actual.length > 0 && ratio >= 0.65 ? "almost" : "wrong", expected, words: words.map((text, index) => ({ text, matched: matches.has(index) })) };
    }
    if (exact) break;
  }
  return best;
}

export const exerciseTypes = {
  listening_transcription: "Escutar e transcrever",
  choice: "Escolha em contexto",
  correction: "Corrigir uma frase",
  fill: "Completar em contexto",
  writing: "Resposta curta",
  situational: "Situação real",
  teacher_prompt: "Pergunta da professora",
} as const;

export function isListening(type: string) { return type === "listening" || type === "listening_transcription"; }
