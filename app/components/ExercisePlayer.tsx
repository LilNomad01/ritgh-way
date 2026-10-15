"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MaterialIcon } from "./MaterialIcon";
import { RecordedAudio } from "./RecordedAudio";
import { SpeakingRecorder } from "./SpeakingRecorder";
import { AnswerComparison } from "./AnswerComparison";
import { assessAnswer, isChoice, isListening, isSpeaking, type exerciseTypes } from "../lib/exercise-answers";
import { getWeakSkills, MASTERY_THRESHOLD, skillLabel, type LearningStep } from "../lib/learning-progress";

type Exercise = {
  id: number;
  type: keyof typeof exerciseTypes | "listening";
  category: string;
  title: string;
  prompt: string;
  options?: string[];
  correct: string;
  accepted?: string[];
  explanation: string;
  speech?: string;
  audioKey?: string;
  skills?: string[];
};

type PracticePayload = {
  practice: { id: number; title: string; sectionTitle: string; level: string; exercises: Exercise[] };
  session?: { currentIndex: number; answers: string[]; speakingAttemptIds?: Record<string, number>; score: number; status: "active" | "completed" };
};

function answerIsCorrect(exercise: Exercise, answer: string) {
  return assessAnswer(answer, exercise.correct, exercise.accepted).status === "correct";
}

export function ExercisePlayer({ lessonId, onClose }: { lessonId: number; onClose: () => void }) {
  const router = useRouter();
  const [payload, setPayload] = useState<PracticePayload | null>(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [responses, setResponses] = useState<string[]>([]);
  const [speakingAttemptIds, setSpeakingAttemptIds] = useState<Record<string, number>>({});
  const [speakingStage, setSpeakingStage] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nextStep, setNextStep] = useState<LearningStep | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) }).then((response) => response.ok ? response.json() as Promise<{ session?: PracticePayload["session"] }> : Promise.reject()).then(async (sessionData) => {
      const practiceResponse = await fetch(`/api/practices/${lessonId}`);
      if (!practiceResponse.ok) throw new Error();
      const practiceData = await practiceResponse.json() as PracticePayload;
      if (cancelled) return;
      const session = sessionData.session ?? practiceData.session;
      setPayload({ ...practiceData, session });
      if (session?.status === "active") {
        const index = Math.min(session.currentIndex ?? 0, Math.max(0, practiceData.practice.exercises.length - 1));
        setCurrent(index); setResponses(session.answers ?? []); setSpeakingAttemptIds(session.speakingAttemptIds ?? {}); setScore(session.score ?? 0);
        if (session.answers?.[index]) { setSelected(session.answers[index]); setConfirmed(true); }
      }
    }).catch(() => { if (!cancelled) setError("Não foi possível carregar esta prática."); });
    return () => { cancelled = true; };
  }, [lessonId]);

  const exercises = useMemo(() => payload?.practice.exercises ?? [], [payload]);
  const exercise = exercises[current];
  const isCorrect = exercise ? answerIsCorrect(exercise, selected) : false;
  const assessment = exercise && confirmed ? assessAnswer(selected, exercise.correct, exercise.accepted) : null;
  const hasSpeaking = exercise ? Boolean(speakingAttemptIds[String(exercise.id)]) : false;
  const canConfirm = Boolean(selected.trim()) && (!exercise || !isListening(exercise.type) || Boolean(exercise.audioKey)) && (!exercise || !isSpeaking(exercise.type) || hasSpeaking);
  const progress = useMemo(() => exercises.length ? ((finished ? exercises.length : current + 1) / exercises.length) * 100 : 0, [current, exercises.length, finished]);
  const wrongAnswers = useMemo(() => exercises.map((item, index) => ({ exercise: item, answer: responses[index] ?? "" })).filter((item) => item.answer && !answerIsCorrect(item.exercise, item.answer)), [exercises, responses]);
  const weakSkills = useMemo(() => getWeakSkills(exercises.map((item, index) => ({ tags: item.skills?.length ? item.skills : [item.category], correct: answerIsCorrect(item, responses[index] ?? "") }))).filter((item) => item.percentage < MASTERY_THRESHOLD), [exercises, responses]);
  const primaryDisabled = saving || (!confirmed && exercise?.type === "choice_speaking" && !speakingStage ? !selected.trim() : !canConfirm);

  async function persist(action: "progress" | "complete", nextResponses: string[], nextScore: number, nextIndex: number, nextSpeakingAttempts = speakingAttemptIds) {
    setSaving(true); setError("");
    try {
    const response = await fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, answers: nextResponses, speakingAttemptIds: nextSpeakingAttempts, score: nextScore, currentIndex: nextIndex, total: exercises.length }) });
    if (!response.ok) throw new Error();
    const data = await response.json() as { nextStep?: LearningStep; session?: { score?: number } };
    if (action === "complete") {
      setNextStep(data.nextStep ?? null);
    }
    return data;
    } catch { setError("Seu resultado não pôde ser salvo agora. Confira a conexão e tente novamente."); return null; }
    finally { setSaving(false); }
  }

  function choose(value: string) {
    if (!confirmed && !saving) setSelected(value);
  }

  async function primaryAction() {
    if (!exercise || saving) return;
    if (exercise.type === "choice_speaking" && !speakingStage && !confirmed) { if (selected.trim()) setSpeakingStage(true); return; }
    if (!canConfirm) return;
    if (!confirmed) {
      const nextResponses = [...responses];
      nextResponses[current] = selected;
      const nextScore = score + (isCorrect ? 1 : 0);
      const saved = await persist("progress", nextResponses, nextScore, current + 1);
      if (!saved) return;
      setResponses(nextResponses);
      setScore(saved.session?.score ?? nextScore);
      setConfirmed(true);
      return;
    }
    if (current === exercises.length - 1) {
      if (await persist("complete", responses, score, exercises.length)) setFinished(true);
      return;
    }
    setCurrent((value) => value + 1);
    setSelected("");
    setConfirmed(false);
    setSpeakingStage(false);
  }

  async function restart() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", reset: true }) });
      if (!response.ok) throw new Error();
      const practiceResponse = await fetch(`/api/practices/${lessonId}`);
      if (!practiceResponse.ok) throw new Error();
      const practiceData = await practiceResponse.json() as PracticePayload;
      setPayload(practiceData); setCurrent(0); setSelected(""); setConfirmed(false); setScore(0); setFinished(false); setResponses([]); setSpeakingAttemptIds({}); setSpeakingStage(false); setReviewing(false); setNextStep(null); setError("");
    } catch { setError("Não foi possível reiniciar. Tente novamente."); } finally { setSaving(false); }
  }

  if (error && !payload) return <div className="lesson-overlay" role="dialog" aria-modal="true"><section className="lesson-modal practice-load-error"><MaterialIcon name="error" /><h2>{error}</h2><button className="primary-button" onClick={onClose}>Voltar para Praticar</button></section></div>;
  if (!payload || !exercise) return <div className="lesson-overlay" role="dialog" aria-modal="true"><section className="lesson-modal practice-loading"><MaterialIcon name="progress_activity" /><strong>Carregando prática...</strong></section></div>;

  return <div className="lesson-overlay" role="dialog" aria-modal="true" aria-labelledby="lesson-title"><section className="lesson-modal"><div className="modal-top"><button onClick={onClose} aria-label="Sair da prática"><MaterialIcon name="close" /></button><div className="modal-progress"><span style={{ width: `${progress}%` }} /></div><small>{finished ? exercises.length : current + 1} / {exercises.length}</small></div>
    {finished ? <div className="exercise-finish"><div className="finish-medal"><MaterialIcon name="workspace_premium" filled /></div><span className="eyebrow">RESULTADO DA PRÁTICA</span><h2>{score}/{exercises.length} · {Math.round((score / exercises.length) * 100)}%</h2><p>Você concluiu <strong>{payload.practice.title}</strong>. Seu desempenho conceitual foi salvo sem transformar dificuldades de speaking em resposta errada.</p><div className="finish-stats"><div><small>ACERTOS</small><strong>{score}</strong></div><div><small>ERROS</small><strong>{exercises.length - score}</strong></div><div><small>DESEMPENHO</small><strong>{Math.round((score / exercises.length) * 100)}%</strong></div></div>{weakSkills.length ? <div className="practice-weak-skills"><strong>Habilidades para revisar</strong><p>{weakSkills.map((item) => skillLabel(item.skill)).join(" · ")}</p></div> : null}{reviewing ? <div className="wrong-answer-review"><h3>Revisão dos erros</h3>{wrongAnswers.length ? wrongAnswers.map(({ exercise: wrongExercise, answer }) => <article key={wrongExercise.id}><strong>{wrongExercise.title}</strong><AnswerComparison answer={answer} correct={wrongExercise.correct} accepted={wrongExercise.accepted} /><p>{wrongExercise.explanation}</p></article>) : <p>Você acertou tudo. Excelente trabalho!</p>}</div> : null}{error ? <p role="alert">{error}</p> : null}<div className="finish-actions"><button className="secondary-button" onClick={() => setReviewing((value) => !value)}>{reviewing ? "Ocultar revisão" : "Revisar erros"}</button><button disabled={saving} className="secondary-button" onClick={restart}>Refazer prática</button><button className="primary-button" onClick={() => router.push(nextStep?.href ?? "/jornada")}>Continuar jornada</button></div></div> : <><div className="modal-content"><div className="maya-tip"><div className="coach-avatar small">M</div><p><strong>Dica da Maya</strong>{isSpeaking(exercise.type) ? "Fale com naturalidade. Você poderá ouvir e regravar antes de confirmar." : isListening(exercise.type) ? "Escute, escreva e compare depois de confirmar. Pode ouvir novamente." : "Pense na situação e responda em inglês. Depois vamos revisar juntos."}</p></div><span className="eyebrow">{exercise.category}</span><h2 id="lesson-title">{exercise.title}</h2><p>{exercise.prompt}</p>
      {isListening(exercise.type) ? <RecordedAudio exerciseId={exercise.id} available={Boolean(exercise.audioKey)} /> : null}
      {isChoice(exercise.type) ? <div className="answers">{exercise.options?.map((option, index) => { const optionSelected = selected === option; const revealCorrect = confirmed && option === exercise.correct; const revealWrong = confirmed && optionSelected && option !== exercise.correct; return <button key={option} disabled={confirmed || saving || speakingStage} className={`${optionSelected && !confirmed ? "selected" : ""} ${revealCorrect ? "correct" : ""} ${revealWrong ? "wrong" : ""}`} onClick={() => choose(option)}><span>{String.fromCharCode(65 + index)}</span>{option}{confirmed && (revealCorrect || revealWrong) ? <b>{revealCorrect ? <MaterialIcon name="check" /> : <MaterialIcon name="close" />}</b> : null}</button>; })}</div> : null}
      {exercise.type === "choice_speaking" && speakingStage && !confirmed ? <div className="speaking-selected-answer"><small>AGORA FALE A ALTERNATIVA ESCOLHIDA</small><strong lang="en">“{selected}”</strong></div> : null}
      {isSpeaking(exercise.type) && (exercise.type === "speaking" || speakingStage) && !confirmed ? <SpeakingRecorder key={`${exercise.id}-${exercise.type === "choice_speaking" ? selected : "speaking"}`} exerciseId={exercise.id} targetText={exercise.type === "choice_speaking" ? selected : exercise.correct} onConfirmed={({ attemptId, result }) => { setSpeakingAttemptIds(previous => ({ ...previous, [String(exercise.id)]: attemptId })); if (exercise.type === "speaking") setSelected(result.transcription); }} /> : null}
      {exercise.type === "fill" ? <div className="fill-answer"><span>Complete:</span><input aria-label="Complete a frase" lang="en" spellCheck={false} maxLength={1000} value={selected} disabled={confirmed || saving} onChange={(event) => setSelected(event.target.value)} placeholder="digite aqui" /></div> : null}
      {!isChoice(exercise.type) && exercise.type !== "fill" && !isSpeaking(exercise.type) ? <div className="writing-answer"><label htmlFor="practice-answer">{isListening(exercise.type) ? "O que você ouviu?" : exercise.type === "correction" ? "Reescreva a frase corrigida" : "Sua resposta em inglês"}</label><textarea id="practice-answer" lang="en" spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={1000} value={selected} disabled={confirmed || saving} onChange={(event) => setSelected(event.target.value)} placeholder={isListening(exercise.type) ? "Digite o que você ouviu…" : "Escreva sua resposta…"} /><small>Pense na intenção da frase, não traduza palavra por palavra.</small></div> : null}
      {confirmed ? <div role="status" className={isCorrect ? "feedback success" : assessment?.status === "almost" ? "feedback almost" : "feedback error"}><strong>{exercise.type === "choice_speaking" ? `Compreensão: ${isCorrect ? "resposta correta" : "resposta incorreta"}` : isCorrect ? "Resposta correta!" : assessment?.status === "almost" ? "Quase! Vamos ajustar alguns detalhes." : "Vamos revisar juntos."}</strong><p>{exercise.explanation}</p>{!isCorrect && !isSpeaking(exercise.type) ? <AnswerComparison answer={selected} correct={exercise.correct} accepted={exercise.accepted} /> : null}</div> : null}{error ? <p className="practice-save-error">{error}</p> : null}</div><div className="modal-footer"><span>{exercise.type === "choice_speaking" && speakingStage && !hasSpeaking ? "Confirme sua gravação para continuar" : confirmed && isCorrect ? "Escute, pratique e aplique na sua próxima conversa." : "A resposta só será revelada após confirmar"}</span><button disabled={primaryDisabled} onClick={primaryAction}>{saving ? "Salvando…" : confirmed ? current === exercises.length - 1 ? "Ver resultado" : "Próxima" : exercise.type === "choice_speaking" && !speakingStage ? "Continuar para Speaking" : "Confirmar resposta"}<MaterialIcon name="arrow_forward" /></button></div></>}
  </section></div>;
}
