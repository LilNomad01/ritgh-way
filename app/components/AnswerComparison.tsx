import { assessAnswer, normalizeAnswer } from "../lib/exercise-answers";

export function AnswerComparison({ answer, correct, accepted = [] }: { answer: string; correct: string; accepted?: string[] }) {
  const result = assessAnswer(answer, correct, accepted);
  const reverse = assessAnswer(result.expected, answer);
  return <div className="answer-comparison">
    <div><strong>Resposta de referência</strong><p>{result.words.map((word, i) => <span key={i} className={word.matched ? "word-match" : "word-correction"}>{word.text} </span>)}</p></div>
    <div><strong>Sua resposta</strong><p>{normalizeAnswer(answer).trim() ? reverse.words.map((word, i) => <span key={i} className={word.matched ? "word-match" : "word-error"}>{word.text} </span>) : <em>Nenhuma palavra informada</em>}</p></div>
    {result.status !== "correct" && <small>Verde: forma correta. Vermelho e sublinhado: trecho a revisar. Confira também palavras que faltaram. Maiúsculas e pontuação não alteram a nota.</small>}
  </div>;
}
