"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerComparison } from "./AnswerComparison";
import { MaterialIcon } from "./MaterialIcon";
import { skillLabel, type LearningStep, type SkillResult } from "../lib/learning-progress";

type ExamQuestion = { id: number; type: string; category: string; prompt: string; options: string[] };
type ExamPayload = { exam: { id: number; sectionId: number; title: string; description: string; passScore: number; sectionTitle: string; moduleTitle: string; level: string; questionCount: number; firstLessonId?: number }; questions: ExamQuestion[]; state: { examUnlocked: boolean; examPassed: boolean; completedLessons: number; lessonCount: number; bestExamPercentage?: number; examAttempts: number; weakSkills: SkillResult[] } };
type Result = { title: string; score: number; total: number; percentage: number; passed: boolean; passScore: number; weakSkills: SkillResult[]; review: { questionId: number; prompt: string; answer: string; correctAnswer: string; explanation: string; correct: boolean }[] };

export function SectionExam({ sectionId, session, onBack, onStart, onNextSection }: { sectionId: number; session: boolean; onBack: () => void; onStart: () => void; onNextSection: (href: string) => void }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ExamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [nextStep, setNextStep] = useState<LearningStep | null>(null);
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
      const data = await response.json() as { result?: Result; nextStep?: LearningStep; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error ?? "Não foi possível salvar o resultado.");
      setResult(data.result);
      setNextStep(data.nextStep ?? null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o resultado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryExam() {
    try {
      const response = await fetch(`/api/exams/${sectionId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível preparar outra tentativa.");
      setPayload(await response.json() as ExamPayload);
      setResult(null); setCurrent(0); setAnswers({}); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tente novamente."); }
  }

  if (loading) return <div className="page-view exam-page"><div className="journey-loading">Preparando a prova...</div></div>;
  if (error && !payload) return <div className="page-view exam-page"><div className="practice-empty"><MaterialIcon name="error" /><h2>{error}</h2><button onClick={onBack}>Voltar</button></div></div>;
  if (!payload) return null;

  if (!session) return <div className="page-view exam-page">
    <button className="module-back-button" onClick={onBack}><MaterialIcon name="arrow_back" />Voltar para aulas</button>
    <section className={`exam-intro ${payload.state.examUnlocked ? "unlocked" : "locked"}`}><div className="exam-trophy"><MaterialIcon name={payload.state.examUnlocked ? "trophy" : "lock"} filled /></div><div><span className="eyebrow">PROVA DA MATÉRIA · {payload.exam.level}</span><h1>{payload.exam.title}</h1><p>{payload.exam.description || `Avalie tudo o que aprendeu em ${payload.exam.sectionTitle}.`}</p><div className="exam-facts"><span><strong>{payload.exam.questionCount}</strong><small>questões</small></span><span><strong>{payload.exam.passScore}%</strong><small>para aprovação</small></span><span><strong>{payload.state.completedLessons}/{payload.state.lessonCount}</strong><small>aulas concluídas</small></span></div>{payload.state.examUnlocked ? <button className="primary-button icon-button" onClick={onStart}>{payload.state.examAttempts ? "Fazer nova tentativa" : "Começar prova"}<MaterialIcon name="arrow_forward" /></button> : <div className="exam-locked-note"><MaterialIcon name="lock" /><span><strong>Prova bloqueada</strong><small>Conclua todas as aulas desta matéria.</small></span></div>}</div></section>
    {payload.state.examUnlocked && <section className="exam-section-review"><span className="eyebrow">REVISÃO DA MATÉRIA</span><h2>Revise antes de avaliar</h2><p>Use seus resultados das aulas para focar nos assuntos que mais exigem atenção. A prova avalia o conjunto da matéria.</p>{payload.state.weakSkills.filter((item) => item.percentage < payload.exam.passScore).length ? <ul>{payload.state.weakSkills.filter((item) => item.percentage < payload.exam.passScore).map((item) => <li key={item.skill}><strong>{skillLabel(item.skill)}</strong><span>{item.percentage}% de acertos</span><button onClick={() => router.push(`/aulas/${item.lessonId ?? payload.exam.firstLessonId}`)}>Revisar aula</button></li>)}</ul> : <p>Não há dificuldades específicas registradas. Você pode revisar as aulas antes de começar.</p>}</section>}
    {payload.state.examAttempts > 0 && <section className="exam-history-card"><MaterialIcon name={payload.state.examPassed ? "verified" : "history"} filled /><div><span className="eyebrow">SEU HISTÓRICO</span><h2>Melhor resultado: {payload.state.bestExamPercentage}%</h2><p>{payload.state.examAttempts} {payload.state.examAttempts === 1 ? "tentativa realizada" : "tentativas realizadas"} · {payload.state.examPassed ? "Matéria concluída" : "A próxima matéria aguarda aprovação"}</p>{!payload.state.examPassed && <div className="exam-weak-skills"><strong>Pontos para reforçar</strong>{payload.state.weakSkills.length ? <ul>{payload.state.weakSkills.map((item) => <li key={item.skill}>{skillLabel(item.skill)} — {item.percentage}% de acertos</li>)}</ul> : <p>Revise as aulas da matéria antes da próxima tentativa.</p>}{payload.exam.firstLessonId && <button className="secondary-button" onClick={() => router.push(`/aulas/${payload.exam.firstLessonId}`)}>Revisar aulas</button>}</div>}</div></section>}
  </div>;

  if (result) return <div className="page-view exam-page"><section className={`exam-result ${result.passed ? "passed" : "failed"}`}>
    <div className="exam-result-mark"><MaterialIcon name={result.passed ? "workspace_premium" : "school"} filled /></div><span className="eyebrow">AVALIAÇÃO CONCLUÍDA</span><h1>{result.percentage}%</h1><p>{result.passed ? "Avaliação aprovada. A próxima etapa está liberada." : `Você ainda precisa reforçar ${result.weakSkills.filter((item) => item.percentage < result.passScore).length || "alguns"} assuntos. A próxima matéria será liberada com ${result.passScore}%.`}</p>
    <div className="exam-result-stats"><div><small>ACERTOS</small><strong>{result.score}</strong></div><div><small>ERROS</small><strong>{result.total - result.score}</strong></div><div><small>QUESTÕES</small><strong>{result.total}</strong></div><div><small>STATUS</small><strong>{result.passed ? "Aprovado" : "Revisão necessária"}</strong></div></div>
    {!result.passed && <div className="exam-weak-skills"><strong>Priorize estes conteúdos</strong><ul>{result.weakSkills.map((item) => <li key={item.skill}>{skillLabel(item.skill)} — {item.percentage}% de acertos</li>)}</ul></div>}
    <div className="exam-review">{result.review.filter((item) => !item.correct).map((item) => <article key={item.questionId}><strong>{item.prompt}</strong><AnswerComparison answer={item.answer} correct={item.correctAnswer} /><p>{item.explanation}</p></article>)}</div>
    {error && <p role="alert" className="practice-save-error">{error}</p>}
    <div className="finish-actions">{result.passed ? <button className="primary-button" onClick={() => onNextSection(nextStep?.href ?? "/jornada")}>{nextStep?.kind === "complete" ? "Ver curso concluído" : "Continuar jornada"}</button> : <><button className="primary-button" onClick={() => void retryExam()}>Nova tentativa</button>{payload.exam.firstLessonId && <button className="secondary-button" onClick={() => router.push(`/aulas/${payload.exam.firstLessonId}`)}>Revisar aulas</button>}</>}<button className="secondary-button" onClick={onBack}>Voltar para aulas</button></div>
  </section></div>;

  if (!payload.state.examUnlocked || !question) return <div className="page-view exam-page"><div className="practice-empty"><MaterialIcon name="lock" /><h2>Prova bloqueada</h2><p>Conclua todas as aulas desta matéria antes de começar.</p><button onClick={onBack}>Voltar</button></div></div>;

  return <div className="exam-session"><header><button onClick={onBack} aria-label="Sair da prova"><MaterialIcon name="close" /></button><div><span style={{ width: `${progress}%` }} /></div><strong>{current + 1} / {payload.questions.length}</strong></header><main><span className="eyebrow">{question.category}</span><h1>{question.prompt}</h1>{question.options.length ? <div className="exam-options">{question.options.map((option, index) => <button className={answer === option ? "selected" : ""} onClick={() => setAnswers((currentAnswers) => ({ ...currentAnswers, [String(question.id)]: option }))} key={option}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div> : <textarea value={answer} onChange={(event) => setAnswers((currentAnswers) => ({ ...currentAnswers, [String(question.id)]: event.target.value }))} placeholder="Escreva sua resposta em inglês..." />}{error ? <p className="practice-save-error">{error}</p> : null}</main><footer><span>As respostas serão corrigidas ao finalizar a prova.</span><button disabled={!answer.trim() || submitting} onClick={() => current === payload.questions.length - 1 ? void finishExam() : setCurrent((value) => value + 1)}>{submitting ? "Salvando..." : current === payload.questions.length - 1 ? "Finalizar prova" : "Próxima questão"}<MaterialIcon name="arrow_forward" /></button></footer></div>;
}
