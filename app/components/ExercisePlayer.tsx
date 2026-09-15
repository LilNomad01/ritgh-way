"use client";

import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";
import { RecordedAudio } from "./RecordedAudio";
import { AnswerComparison } from "./AnswerComparison";
import { assessAnswer, isListening, type exerciseTypes } from "../lib/exercise-answers";

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
};

type PracticePayload = {
  practice: { id: number; title: string; sectionTitle: string; level: string; exercises: Exercise[] };
  session?: { currentIndex: number; answers: string[]; score: number; status: "active" | "completed" };
};

function answerIsCorrect(exercise: Exercise, answer: string) {
  return assessAnswer(answer, exercise.correct, exercise.accepted).status === "correct";
}

export function ExercisePlayer({ lessonId, onClose }: { lessonId: number; onClose: () => void }) {
  const [payload, setPayload] = useState<PracticePayload | null>(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [responses, setResponses] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
        setCurrent(index); setResponses(session.answers ?? []); setScore(session.score ?? 0);
        if (session.answers?.[index]) { setSelected(session.answers[index]); setConfirmed(true); }
      }
    }).catch(() => { if (!cancelled) setError("Não foi possível carregar esta prática."); });
    return () => { cancelled = true; };
  }, [lessonId]);

  const exercises = useMemo(() => payload?.practice.exercises ?? [], [payload]);
  const exercise = exercises[current];
  const isCorrect = exercise ? answerIsCorrect(exercise, selected) : false;
  const assessment = exercise && confirmed ? assessAnswer(selected, exercise.correct, exercise.accepted) : null;
  const canConfirm = Boolean(selected.trim()) && (!exercise || !isListening(exercise.type) || Boolean(exercise.audioKey));
  const progress = useMemo(() => exercises.length ? ((finished ? exercises.length : current + 1) / exercises.length) * 100 : 0, [current, exercises.length, finished]);
  const wrongAnswers = useMemo(() => exercises.map((item, index) => ({ exercise: item, answer: responses[index] ?? "" })).filter((item) => item.answer && !answerIsCorrect(item.exercise, item.answer)), [exercises, responses]);

  async function persist(action: "progress" | "complete", nextResponses: string[], nextScore: number, nextIndex: number) {
    setSaving(true); setError("");
    try {
    const response = await fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, answers: nextResponses, score: nextScore, currentIndex: nextIndex, total: exercises.length }) });
    if (!response.ok) throw new Error();
    return true;
    } catch { setError("Seu resultado não pôde ser salvo agora. Confira a conexão e tente novamente."); return false; }
    finally { setSaving(false); }
  }

  function choose(value: string) {
    if (!confirmed && !saving) setSelected(value);
  }

  async function primaryAction() {
    if (!exercise || saving || !canConfirm) return;
    if (!confirmed) {
      const nextResponses = [...responses];
      nextResponses[current] = selected;
      const nextScore = score + (isCorrect ? 1 : 0);
      if (!await persist("progress", nextResponses, nextScore, current + 1)) return;
      setResponses(nextResponses);
      setScore(nextScore);
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
  }

  async function restart() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", reset: true }) });
      if (!response.ok) throw new Error();
      const practiceResponse = await fetch(`/api/practices/${lessonId}`);
      if (!practiceResponse.ok) throw new Error();
      const practiceData = await practiceResponse.json() as PracticePayload;
      setPayload(practiceData); setCurrent(0); setSelected(""); setConfirmed(false); setScore(0); setFinished(false); setResponses([]); setReviewing(false); setError("");
    } catch { setError("Não foi possível reiniciar. Tente novamente."); } finally { setSaving(false); }
  }

  if (error && !payload) return <div className="lesson-overlay" role="dialog" aria-modal="true"><section className="lesson-modal practice-load-error"><MaterialIcon name="error" /><h2>{error}</h2><button className="primary-button" onClick={onClose}>Voltar para Praticar</button></section></div>;
  if (!payload || !exercise) return <div className="lesson-overlay" role="dialog" aria-modal="true"><section className="lesson-modal practice-loading"><MaterialIcon name="progress_activity" /><strong>Carregando prática...</strong></section></div>;

  return <div className="lesson-overlay" role="dialog" aria-modal="true" aria-labelledby="lesson-title"><section className="lesson-modal"><div className="modal-top"><button onClick={onClose} aria-label="Sair da prática"><MaterialIcon name="close" /></button><div className="modal-progress"><span style={{ width: `${progress}%` }} /></div><small>{finished ? exercises.length : current + 1} / {exercises.length}</small></div>
    {finished ? <div className="exercise-finish"><div className="finish-medal"><MaterialIcon name="workspace_premium" filled /></div><span className="eyebrow">RESULTADO DA PRÁTICA</span><h2>{score}/{exercises.length} · {Math.round((score / exercises.length) * 100)}%</h2><p>Você concluiu <strong>{payload.practice.title}</strong>. Seu desempenho foi salvo.</p><div className="finish-stats"><div><small>ACERTOS</small><strong>{score}</strong></div><div><small>ERROS</small><strong>{exercises.length - score}</strong></div><div><small>DESEMPENHO</small><strong>{Math.round((score / exercises.length) * 100)}%</strong></div></div>{reviewing ? <div className="wrong-answer-review"><h3>Revisão dos erros</h3>{wrongAnswers.length ? wrongAnswers.map(({ exercise: wrongExercise, answer }) => <article key={wrongExercise.id}><strong>{wrongExercise.title}</strong><span>Sua resposta: {answer}</span><b>Resposta correta: {wrongExercise.correct}</b><p>{wrongExercise.explanation}</p></article>) : <p>Você acertou tudo. Excelente trabalho!</p>}</div> : null}{error ? <p role="alert">{error}</p> : null}<div className="finish-actions"><button className="secondary-button" onClick={() => setReviewing((value) => !value)}>{reviewing ? "Ocultar revisão" : "Revisar erros"}</button><button disabled={saving} className="secondary-button" onClick={restart}>Refazer prática</button><button className="primary-button" onClick={onClose}>Voltar para Praticar</button></div></div> : <><div className="modal-content"><div className="maya-tip"><div className="coach-avatar small">M</div><p><strong>Dica da Maya</strong>{isListening(exercise.type) ? "Escute, escreva e compare depois de confirmar. Pode ouvir novamente." : "Pense na situação e responda em inglês. Depois vamos revisar juntos."}</p></div><span className="eyebrow">{exercise.category}</span><h2 id="lesson-title">{exercise.title}</h2><p>{exercise.prompt}</p>
      {isListening(exercise.type) ? <RecordedAudio exerciseId={exercise.id} available={Boolean(exercise.audioKey)} /> : null}
      {exercise.type === "choice" ? <div className="answers">{exercise.options?.map((option, index) => { const optionSelected = selected === option; const revealCorrect = confirmed && option === exercise.correct; const revealWrong = confirmed && optionSelected && option !== exercise.correct; return <button key={option} disabled={confirmed || saving} className={`${optionSelected && !confirmed ? "selected" : ""} ${revealCorrect ? "correct" : ""} ${revealWrong ? "wrong" : ""}`} onClick={() => choose(option)}><span>{String.fromCharCode(65 + index)}</span>{option}{confirmed && (revealCorrect || revealWrong) ? <b>{revealCorrect ? <MaterialIcon name="check" /> : <MaterialIcon name="close" />}</b> : null}</button>; })}</div> : null}
      {exercise.type === "fill" ? <div className="fill-answer"><span>Complete:</span><input aria-label="Complete a frase" lang="en" spellCheck={false} maxLength={1000} value={selected} disabled={confirmed || saving} onChange={(event) => setSelected(event.target.value)} placeholder="digite aqui" /></div> : null}
      {exercise.type !== "choice" && exercise.type !== "fill" ? <div className="writing-answer"><label htmlFor="practice-answer">{isListening(exercise.type) ? "O que você ouviu?" : exercise.type === "correction" ? "Reescreva a frase corrigida" : "Sua resposta em inglês"}</label><textarea id="practice-answer" lang="en" spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={1000} value={selected} disabled={confirmed || saving} onChange={(event) => setSelected(event.target.value)} placeholder={isListening(exercise.type) ? "Digite o que você ouviu…" : "Escreva sua resposta…"} /><small>Pense na intenção da frase, não traduza palavra por palavra.</small></div> : null}
      {confirmed ? <div role="status" className={isCorrect ? "feedback success" : assessment?.status === "almost" ? "feedback almost" : "feedback error"}><strong>{isCorrect ? "Resposta correta!" : assessment?.status === "almost" ? "Quase! Vamos ajustar alguns detalhes." : "Vamos revisar juntos."}</strong><p>{exercise.explanation}</p>{!isCorrect ? <><AnswerComparison answer={selected} correct={exercise.correct} accepted={exercise.accepted} /></> : null}</div> : null}{error ? <p className="practice-save-error">{error}</p> : null}</div><div className="modal-footer"><span>{confirmed && isCorrect ? "Escute, pratique e aplique na sua próxima conversa." : "A resposta só será revelada após confirmar"}</span><button disabled={!canConfirm || saving} onClick={primaryAction}>{saving ? "Salvando…" : confirmed ? current === exercises.length - 1 ? "Ver resultado" : "Próxima" : "Confirmar resposta"}<MaterialIcon name="arrow_forward" /></button></div></>}
  </section></div>;
}
