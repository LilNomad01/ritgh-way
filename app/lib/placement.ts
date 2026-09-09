import { assessAnswer } from "./exercise-answers";

export const placementQuestions: { prompt: string; question: string; type: string; correct: string; speech?: string; options?: string[]; accepted?: string[] }[] = [
  { type: "fill", prompt: "Complete com uma palavra", question: "My name ___ Anna.", correct: "is" },
  { type: "listening_transcription", prompt: "Escute e transcreva", question: "Escreva a frase que você ouvir.", speech: "I am from Brazil.", correct: "I am from Brazil." },
  { type: "correction", prompt: "Corrija a frase", question: "She work every day.", correct: "She works every day." },
  { type: "fill", prompt: "Complete com uma palavra", question: "I have lived here ___ five years.", correct: "for" },
  { type: "choice", prompt: "Uma situação real", question: "Você precisa de ajuda. Qual pedido soa mais educado?", options: ["You must help me.", "Could you help me, please?", "You help me now."], correct: "Could you help me, please?" },
  { type: "listening_transcription", prompt: "Escute e transcreva", question: "Escreva a frase completa que você ouvir.", speech: "I am looking forward to meeting you.", correct: "I am looking forward to meeting you." },
  { type: "fill", prompt: "Complete com três palavras", question: "Had I known, I ___ differently.", correct: "would have acted" },
  { type: "writing", prompt: "Reformule a frase", question: "Use despite: Although it was raining, we went out.", correct: "Despite the rain, we went out.", accepted: ["Despite it raining, we went out.", "Despite the fact that it was raining, we went out."] },
];

export function placementResult(answers: string[]) {
  const score = placementQuestions.reduce((sum, question, index) => sum + (assessAnswer(answers[index] ?? "", question.correct, question.accepted).status === "correct" ? 1 : 0), 0);
  return { score, level: score <= 2 ? "Começando do zero" : score <= 4 ? "Básico" : score <= 6 ? "Intermediário" : "Avançado" };
}
