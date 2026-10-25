import type { SpeakingEvaluation, SpeakingStatus } from "../lib/speech";
import { AnswerComparison } from "./AnswerComparison";

function metricLabel(status: SpeakingStatus) {
  return status === "correct" ? "Muito bom" : status === "attention" ? "Pode melhorar" : "Precisa revisar";
}

export function SpeakingFeedback({ evaluation, targetText }: { evaluation: SpeakingEvaluation; targetText: string }) {
  return <div className="speaking-result">
    <h3>{evaluation.summary}</h3>
    <section className="speaking-comparison"><strong>Forma reconhecida e forma esperada</strong><p>Compare as palavras detectadas. Isto não é uma nota acústica de pronúncia.</p><AnswerComparison answer={evaluation.transcription} correct={targetText} expectedLabel="Forma esperada" answerLabel="Forma reconhecida" /></section>
    <div className="speaking-metrics">
      <div data-status={evaluation.intent.status}><small>INTENÇÃO</small><strong>{metricLabel(evaluation.intent.status)}</strong><p>{evaluation.intent.feedback}</p></div>
      <div data-status={evaluation.vocabulary.status}><small>VOCABULÁRIO</small><strong>{metricLabel(evaluation.vocabulary.status)}</strong><p>{evaluation.vocabulary.feedback}</p></div>
      <div data-status={evaluation.grammar.status}><small>GRAMÁTICA</small><strong>{evaluation.grammar.available ? metricLabel(evaluation.grammar.status) : "Sem dado confiável"}</strong><p>{evaluation.grammar.feedback}</p></div>
      <div data-status="attention"><small>PRONÚNCIA</small><strong>Não avaliada</strong><p>{evaluation.pronunciation.feedback}</p></div>
    </div>
  </div>;
}
