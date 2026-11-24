import { normalizeSpeakingEvaluation, type SpeakingEvaluation, type SpeakingStatus } from "../lib/speech";
import { AnswerComparison } from "./AnswerComparison";
import { SpeakingReference } from "./SpeakingReference";
import styles from "./SpeakingFeedback.module.css";

function metricLabel(status: SpeakingStatus) {
  return status === "correct" ? "Muito bom" : status === "attention" ? "Pode melhorar" : "Precisa praticar";
}

const recognizedWords = (text: string) => text.toLocaleLowerCase("en-US").replace(/[.,!?;:]/g, "").replace(/\s+/g, " ").trim();

export function SpeakingFeedback({ evaluation, targetText, exerciseId, studentAudioUrl }: { evaluation: SpeakingEvaluation; targetText: string; exerciseId?: number; studentAudioUrl?: string }) {
  const result = normalizeSpeakingEvaluation(evaluation, targetText);
  const pronunciation = result.pronunciation;
  const metrics = [["Clareza", result.clarity], ["Fluência", result.fluency], ["Vocabulário", result.vocabulary], ["Gramática", result.grammar]] as const;
  return <div className={styles.result}>
    {pronunciation.available && <section className={styles.primary} data-status={pronunciation.status}>
      <small>PRONÚNCIA · ORIENTAÇÃO POR IA</small><h3>{metricLabel(pronunciation.status)}</h3>
      <p>{pronunciation.feedback}</p>
      <small>Análise qualitativa da gravação. Não é medição fonética calibrada.</small>
    </section>}
    <section className={styles.comparison}><AnswerComparison answer={result.transcription} correct={targetText} expectedLabel="Referência esperada" answerLabel="Transcrição reconhecida" /><small>A transcrição pode errar e não comprova como cada som foi produzido.</small>{result.acousticHeard && recognizedWords(result.acousticHeard) !== recognizedWords(result.transcription) && <p>O analisador de áudio ouviu “{result.acousticHeard}”. Os reconhecimentos divergem; compare sua gravação e tente novamente.</p>}</section>
    <div className={styles.content}><strong>Conteúdo: {metricLabel(result.intent.status)}</strong><p>{result.intent.feedback}</p></div>
    <dl className={styles.metrics}>{metrics.map(([name, metric]) => <div key={name} data-status={metric?.available ? metric.status : "unavailable"}><dt>{name}</dt><dd>{metric?.available ? metricLabel(metric.status) : "Não avaliado"}<p>{metric?.feedback}</p></dd></div>)}</dl>
    {result.practiceTip && <aside className={styles.tip}><strong>Na próxima tentativa</strong><p>{result.practiceTip}</p></aside>}
    {exerciseId && <SpeakingReference exerciseId={exerciseId} targetText={targetText} studentAudioUrl={studentAudioUrl} />}
  </div>;
}
