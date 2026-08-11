"use client";

import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";

type Exercise = {
  id: number;
  type: "choice" | "listening" | "correction" | "fill" | "writing";
  category: string;
  title: string;
  prompt: string;
  options?: string[];
  correct: string;
  accepted?: string[];
  explanation: string;
  speech?: string;
};

type PracticePayload = {
  practice: { id: number; title: string; sectionTitle: string; level: string; exercises: Exercise[] };
  session?: { currentIndex: number; answers: string[]; score: number; status: "active" | "completed" };
};

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase().replace(/[.!?]$/g, "");
}

function answerIsCorrect(exercise: Exercise, answer: string) {
  return [exercise.correct, ...(exercise.accepted ?? [])].map(normalize).includes(normalize(answer));
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/practices/${lessonId}`).then((response) => response.ok ? response.json() as Promise<PracticePayload> : Promise.reject()),
      fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) }).then((response) => response.ok ? response.json() as Promise<{ session?: PracticePayload["session"] }> : Promise.reject()),
    ]).then(([practiceData, sessionData]) => {
      if (cancelled) return;
      const session = sessionData.session ?? practiceData.session;
      setPayload({ ...practiceData, session });
      if (session?.status === "active") { setCurrent(Math.min(session.currentIndex ?? 0, Math.max(0, practiceData.practice.exercises.length - 1))); setResponses(session.answers ?? []); setScore(session.score ?? 0); }
    }).catch(() => { if (!cancelled) setError("Não foi possível carregar esta prática."); });
    return () => { cancelled = true; };
  }, [lessonId]);

  const exercises = useMemo(() => payload?.practice.exercises ?? [], [payload]);
  const exercise = exercises[current];
  const isCorrect = exercise ? answerIsCorrect(exercise, selected) : false;
  const canConfirm = Boolean(selected.trim());
  const progress = useMemo(() => exercises.length ? ((finished ? exercises.length : current + 1) / exercises.length) * 100 : 0, [current, exercises.length, finished]);
  const wrongAnswers = useMemo(() => exercises.map((item, index) => ({ exercise: item, answer: responses[index] ?? "" })).filter((item) => item.answer && !answerIsCorrect(item.exercise, item.answer)), [exercises, responses]);

  function speak() {
    if (!exercise?.speech || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(exercise.speech);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    window.speechSynthesis.speak(utterance);
  }

  async function persist(action: "progress" | "complete", nextResponses: string[], nextScore: number, nextIndex: number) {
    const response = await fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, answers: nextResponses, score: nextScore, currentIndex: nextIndex, total: exercises.length }) });
    if (!response.ok) setError("Seu resultado não pôde ser salvo agora. Tente novamente.");
  }

  function choose(value: string) {
    if (!confirmed) setSelected(value);
  }

  function primaryAction() {
    if (!exercise) return;
    if (!confirmed) {
      const nextResponses = [...responses];
      nextResponses[current] = selected;
      const nextScore = score + (isCorrect ? 1 : 0);
      setResponses(nextResponses);
      setScore(nextScore);
      setConfirmed(true);
      void persist("progress", nextResponses, nextScore, current + 1);
      return;
    }
    if (current === exercises.length - 1) {
      setFinished(true);
      void persist("complete", responses, score, exercises.length);
      return;
    }
    setCurrent((value) => value + 1);
    setSelected("");
    setConfirmed(false);
  }

  function restart() {
    setCurrent(0); setSelected(""); setConfirmed(false); setScore(0); setFinished(false); setResponses([]); setReviewing(false); setError("");
    void fetch(`/api/practices/${lessonId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", reset: true }) });
  }

  if (error && !payload) return <div className="lesson-overlay" role="dialog" aria-modal="true"><section className="lesson-modal practice-load-error"><MaterialIcon name="error" /><h2>{error}</h2><button className="primary-button" onClick={onClose}>Voltar para Praticar</button></section></div>;
  if (!payload || !exercise) return <div className="lesson-overlay" role="dialog" aria-modal="true"><section className="lesson-modal practice-loading"><MaterialIcon name="progress_activity" /><strong>Carregando prática...</strong></section></div>;

  return <div className="lesson-overlay" role="dialog" aria-modal="true" aria-labelledby="lesson-title"><section className="lesson-modal"><div className="modal-top"><button onClick={onClose} aria-label="Sair da prática"><MaterialIcon name="close" /></button><div className="modal-progress"><span style={{ width: `${progress}%` }} /></div><small>{finished ? exercises.length : current + 1} / {exercises.length}</small></div>
    {finished ? <div className="exercise-finish"><div className="finish-medal"><MaterialIcon name="workspace_premium" filled /></div><span className="eyebrow">RESULTADO DA PRÁTICA</span><h2>{score}/{exercises.length} · {Math.round((score / exercises.length) * 100)}%</h2><p>Você concluiu <strong>{payload.practice.title}</strong>. Seu desempenho foi salvo.</p><div className="finish-stats"><div><small>ACERTOS</small><strong>{score}</strong></div><div><small>ERROS</small><strong>{exercises.length - score}</strong></div><div><small>DESEMPENHO</small><strong>{Math.round((score / exercises.length) * 100)}%</strong></div></div>{reviewing ? <div className="wrong-answer-review"><h3>Revisão dos erros</h3>{wrongAnswers.length ? wrongAnswers.map(({ exercise: wrongExercise, answer }) => <article key={wrongExercise.id}><strong>{wrongExercise.title}</strong><span>Sua resposta: {answer}</span><b>Resposta correta: {wrongExercise.correct}</b><p>{wrongExercise.explanation}</p></article>) : <p>Você acertou tudo. Excelente trabalho!</p>}</div> : null}<div className="finish-actions"><button className="secondary-button" onClick={() => setReviewing((value) => !value)}>{reviewing ? "Ocultar revisão" : "Revisar erros"}</button><button className="secondary-button" onClick={restart}>Refazer prática</button><button className="primary-button" onClick={onClose}>Voltar para Praticar</button></div></div> : <><div className="modal-content"><div className="maya-tip"><div className="coach-avatar small">M</div><p><strong>Dica da Maya</strong>{exercise.type === "listening" ? "Você pode ouvir quantas vezes precisar antes de confirmar." : "Escolha com calma. A correção só aparece depois que você confirmar."}</p></div><span className="eyebrow">{exercise.category}</span><h2 id="lesson-title">{exercise.title}</h2><p>{exercise.prompt}</p>
      {exercise.type === "listening" ? <button className="listen-button" onClick={speak}><MaterialIcon name="volume_up" /><div><strong>Ouvir áudio</strong><small>Toque para reproduzir em inglês</small></div><i>0:06</i></button> : null}
      {exercise.type === "choice" || exercise.type === "listening" || exercise.type === "correction" ? <div className="answers">{exercise.options?.map((option, index) => { const optionSelected = selected === option; const revealCorrect = confirmed && option === exercise.correct; const revealWrong = confirmed && optionSelected && option !== exercise.correct; return <button key={option} disabled={confirmed} className={`${optionSelected && !confirmed ? "selected" : ""} ${revealCorrect ? "correct" : ""} ${revealWrong ? "wrong" : ""}`} onClick={() => choose(option)}><span>{String.fromCharCode(65 + index)}</span>{option}{confirmed && (revealCorrect || revealWrong) ? <b>{revealCorrect ? <MaterialIcon name="check" /> : <MaterialIcon name="close" />}</b> : null}</button>; })}</div> : null}
      {exercise.type === "fill" ? <div className="fill-answer"><span>Complete:</span><input autoFocus value={selected} disabled={confirmed} onChange={(event) => setSelected(event.target.value)} placeholder="digite aqui" /></div> : null}
      {exercise.type === "writing" ? <div className="writing-answer"><label>Sua resposta em inglês</label><textarea autoFocus value={selected} disabled={confirmed} onChange={(event) => setSelected(event.target.value)} placeholder="Escreva a frase completa..." /><small>Pense na intenção da frase, não traduza palavra por palavra.</small></div> : null}
      {confirmed ? <div className={isCorrect ? "feedback success" : "feedback error"}><strong>{isCorrect ? "Mandou bem!" : "Quase lá!"}</strong><p>{exercise.explanation}</p>{!isCorrect ? <small>Resposta correta: <b>{exercise.correct}</b></small> : null}</div> : null}{error ? <p className="practice-save-error">{error}</p> : null}</div><div className="modal-footer"><span>{confirmed && isCorrect ? "+20 XP conquistados" : "A resposta só será revelada após confirmar"}</span><button disabled={!canConfirm} onClick={primaryAction}>{confirmed ? current === exercises.length - 1 ? "Ver resultado" : "Próxima" : "Confirmar resposta"}<MaterialIcon name="arrow_forward" /></button></div></>}
  </section></div>;
}
