"use client";

import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";

type ExamQuestion = { id: number; type: string; category: string; prompt: string; options: string[] };
type ExamPayload = { exam: { id: number; sectionId: number; title: string; description: string; passScore: number; sectionTitle: string; moduleTitle: string; level: string; questionCount: number }; questions: ExamQuestion[]; state: { examUnlocked: boolean; examPassed: boolean; completedLessons: number; lessonCount: number; bestExamPercentage?: number; examAttempts: number } };
type Result = { title: string; score: number; total: number; percentage: number; passed: boolean; passScore: number; review: { questionId: number; prompt: string; answer: string; correctAnswer: string; explanation: string; correct: boolean }[] };

export function SectionExam({ sectionId, session, onBack, onStart, onNextSection }: { sectionId: number; session: boolean; onBack: () => void; onStart: () => void; onNextSection: () => void }) {
  const [payload, setPayload] = useState<ExamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/exams/${sectionId}`).then(async (response) => {
      const data = await response.json() as ExamPayload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a prova.");
      return data;
    }).then((data) => { if (!cancelled) setPayload(data); }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a prova."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sectionId]);

  const question = payload?.questions[current];
  const answer = question ? answers[String(question.id)] ?? "" : "";
  const progress = useMemo(() => payload?.questions.length ? ((current + 1) / payload.questions.length) * 100 : 0, [current, payload?.questions.length]);

  async function finishExam() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/exams/${sectionId}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
      const data = await response.json() as { result?: Result; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error ?? "Não foi possível salvar o resultado.");
      setResult(data.result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o resultado.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-view exam-page"><div className="journey-loading">Preparando a prova...</div></div>;
  if (error && !payload) return <div className="page-view exam-page"><div className="practice-empty"><MaterialIcon name="error" /><h2>{error}</h2><button onClick={onBack}>Voltar</button></div></div>;
  if (!payload) return null;

  if (!session) return <div className="page-view exam-page"><button className="module-back-button" onClick={onBack}><MaterialIcon name="arrow_back" />Voltar para aulas</button><section className={`exam-intro ${payload.state.examUnlocked ? "unlocked" : "locked"}`}><div className="exam-trophy"><MaterialIcon name={payload.state.examUnlocked ? "trophy" : "lock"} filled /></div><div><span className="eyebrow">PROVA DA MATÉRIA · {payload.exam.level}</span><h1>{payload.exam.title}</h1><p>{payload.exam.description || `Avalie tudo o que aprendeu em ${payload.exam.sectionTitle}.`}</p><div className="exam-facts"><span><strong>{payload.exam.questionCount}</strong><small>questões</small></span><span><strong>{payload.exam.passScore}%</strong><small>para aprovação</small></span><span><strong>{payload.state.completedLessons}/{payload.state.lessonCount}</strong><small>aulas concluídas</small></span></div>{payload.state.examUnlocked ? <button className="primary-button icon-button" onClick={onStart}>{payload.state.examAttempts ? "Fazer nova tentativa" : "Começar prova"}<MaterialIcon name="arrow_forward" /></button> : <div className="exam-locked-note"><MaterialIcon name="lock" /><span><strong>Prova bloqueada</strong><small>Conclua o vídeo e os exercícios de todas as aulas desta matéria.</small></span></div>}</div></section>{payload.state.examAttempts ? <section className="exam-history-card"><MaterialIcon name={payload.state.examPassed ? "verified" : "history"} filled /><div><span className="eyebrow">SEU HISTÓRICO</span><h2>Melhor resultado: {payload.state.bestExamPercentage}%</h2><p>{payload.state.examAttempts} {payload.state.examAttempts === 1 ? "tentativa realizada" : "tentativas realizadas"} · {payload.state.examPassed ? "Matéria concluída" : "Continue estudando e tente novamente"}</p></div></section> : null}</div>;

  if (result) return <div className="page-view exam-page"><section className={`exam-result ${result.passed ? "passed" : "failed"}`}><div className="exam-result-mark"><MaterialIcon name={result.passed ? "workspace_premium" : "school"} filled /></div><span className="eyebrow">PROVA CONCLUÍDA</span><h1>{result.percentage / 10} / 10</h1><p>{result.passed ? "Parabéns! Você concluiu esta matéria e desbloqueou a próxima etapa." : `Você precisa de ${result.passScore}% para aprovação. Revise os pontos abaixo e tente novamente.`}</p><div className="exam-result-stats"><div><small>ACERTOS</small><strong>{result.score}</strong></div><div><small>ERROS</small><strong>{result.total - result.score}</strong></div><div><small>QUESTÕES</small><strong>{result.total}</strong></div><div><small>STATUS</small><strong>{result.passed ? "Aprovado" : "Reprovado"}</strong></div></div><div className="exam-review">{result.review.filter((item) => !item.correct).map((item) => <article key={item.questionId}><strong>{item.prompt}</strong><span>Sua resposta: {item.answer || "Sem resposta"}</span><b>Resposta correta: {item.correctAnswer}</b><p>{item.explanation}</p></article>)}</div><div className="finish-actions">{result.passed ? <button className="primary-button" onClick={onNextSection}>Ir para próxima matéria</button> : <button className="primary-button" onClick={() => { setResult(null); setCurrent(0); setAnswers({}); }}>Tentar novamente</button>}<button className="secondary-button" onClick={onBack}>Voltar para aulas</button></div></section></div>;

  if (!payload.state.examUnlocked || !question) return <div className="page-view exam-page"><div className="practice-empty"><MaterialIcon name="lock" /><h2>Prova bloqueada</h2><p>Conclua todas as aulas desta matéria antes de começar.</p><button onClick={onBack}>Voltar</button></div></div>;

  return <div className="exam-session"><header><button onClick={onBack} aria-label="Sair da prova"><MaterialIcon name="close" /></button><div><span style={{ width: `${progress}%` }} /></div><strong>{current + 1} / {payload.questions.length}</strong></header><main><span className="eyebrow">{question.category}</span><h1>{question.prompt}</h1>{question.options.length ? <div className="exam-options">{question.options.map((option, index) => <button className={answer === option ? "selected" : ""} onClick={() => setAnswers((currentAnswers) => ({ ...currentAnswers, [String(question.id)]: option }))} key={option}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div> : <textarea value={answer} onChange={(event) => setAnswers((currentAnswers) => ({ ...currentAnswers, [String(question.id)]: event.target.value }))} placeholder="Escreva sua resposta em inglês..." />}{error ? <p className="practice-save-error">{error}</p> : null}</main><footer><span>As respostas serão corrigidas ao finalizar a prova.</span><button disabled={!answer.trim() || submitting} onClick={() => current === payload.questions.length - 1 ? void finishExam() : setCurrent((value) => value + 1)}>{submitting ? "Salvando..." : current === payload.questions.length - 1 ? "Finalizar prova" : "Próxima questão"}<MaterialIcon name="arrow_forward" /></button></footer></div>;
}
