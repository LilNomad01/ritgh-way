"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseData, CourseLesson, orderedCourse } from "../lib/course";
import { getNextLearningStep } from "../lib/learning-progress";
import { MaterialIcon } from "./MaterialIcon";

const emptyCourse: CourseData = { modules: [], sections: [], lessons: [], academic: { lessonStates: [], sectionStates: [], moduleStates: [] } };
const statusIcon = { completed: "check", in_progress: "progress_activity", available: "play_arrow", locked: "lock" } as const;

export function JourneyView({ onContinue, onOpenExam }: { onContinue: (lesson: CourseLesson) => void; onOpenExam: (sectionId: number) => void }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseData>(emptyCourse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expandedModuleId, setExpandedModuleId] = useState<number | null>();
  const [expandedSectionId, setExpandedSectionId] = useState<number | null>();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/content", { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Não foi possível carregar sua jornada.");
        return response.json() as Promise<CourseData>;
      })
      .then(setCourse)
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  const ordered = useMemo(() => orderedCourse(course), [course]);
  const step = course.academic ? getNextLearningStep(course.academic) : null;
  const nextLessonState = course.academic?.lessonStates.find(state => state.lessonId === step?.lessonId);
  const nextLesson = ordered.lessons.find(lesson => lesson.id === step?.lessonId);
  const nextExam = step?.kind === "exam" || step?.kind === "review" ? course.academic?.sectionStates.find(state => state.sectionId === step.sectionId) : undefined;
  const currentModule = ordered.modules.find(module => course.academic?.moduleStates.find(state => state.moduleId === module.id && state.unlocked && !state.completed && !state.reviewOnly));
  const nextActionTitle = nextExam?.examTitle ?? nextLesson?.title ?? (step?.kind === "complete" ? "Curso concluído" : undefined);
  const nextActionType = step?.kind === "review" ? "REVISÃO RECOMENDADA" : nextExam ? "AVALIAÇÃO LIBERADA" : step?.kind === "practice" ? "PRÁTICA PENDENTE" : nextLesson ? "PRÓXIMA AULA" : "JORNADA EM DIA";
  const nextActionDescription = nextExam
    ? step?.kind === "review" ? "Revise seus pontos fracos antes da próxima tentativa." : "As aulas da matéria foram concluídas. Mostre o que aprendeu para avançar."
    : step?.kind === "practice" ? "O vídeo já terminou. Conclua os exercícios desta aula para avançar."
    : nextLessonState?.videoStatus === "watching"
      ? `Seu vídeo está em ${nextLessonState.videoPercent}%. Retome de onde parou.`
      : nextLesson ? "Assista à aula e faça a prática para avançar." : "Todo o conteúdo disponível foi concluído.";
  const lessonStates = course.academic?.lessonStates ?? [];
  const sectionStates = course.academic?.sectionStates ?? [];
  const completedLessons = lessonStates.filter(item => item.ready && !item.reviewOnly && item.completed).length;
  const completedSections = sectionStates.filter(item => !item.reviewOnly && item.completed).length;
  const scoredLessons = lessonStates.filter(item => item.bestPercentage !== undefined);
  const averageScore = scoredLessons.length ? Math.round(scoredLessons.reduce((sum, item) => sum + (item.bestPercentage ?? 0), 0) / scoredLessons.length) : undefined;
  const focus = useMemo(() => {
    const values = new Map<string, { correct: number; total: number; lessonId?: number }>();
    for (const section of course.academic?.sectionStates ?? []) for (const skill of section.weakSkills) {
      const previous = values.get(skill.skill) ?? { correct: 0, total: 0, lessonId: skill.lessonId };
      values.set(skill.skill, { correct: previous.correct + skill.correct, total: previous.total + skill.total, lessonId: previous.lessonId ?? skill.lessonId });
    }
    return [...values].map(([skill, value]) => ({ skill, percentage: Math.round(100 * value.correct / Math.max(1, value.total)), lessonId: value.lessonId })).sort((a, b) => a.percentage - b.percentage).slice(0, 3);
  }, [course]);
  const openNextAction = () => {
    if (step) router.push(step.href);
  };

  if (loading) return <div className="page-view journey-page"><div className="journey-loading">Preparando sua jornada…</div></div>;
  if (error) return <div className="page-view journey-page"><section className="section-block journey-error" role="alert"><p>{error}</p><button className="outline-button" onClick={() => { setError(""); setLoading(true); setRetry(value => value + 1); }}>Tentar novamente</button></section></div>;

  return <div className="page-view journey-page">
    <section className="journey-hero journey-hero-academic">
      <div className="journey-hero-copy"><span className="eyebrow">CONTINUE DE ONDE PAROU</span><small>{currentModule?.title ?? (ordered.modules.length ? "Jornada concluída" : "Conteúdo em preparação")}{nextLesson ? ` · ${course.sections.find(section => section.id === nextLesson.sectionId)?.title ?? ""}` : ""}</small><h1>{nextActionTitle ?? (ordered.modules.length ? "Conteúdo disponível concluído" : "Sua jornada começa aqui")}</h1><p>{nextActionDescription}</p>{step?.kind !== "complete" && nextActionTitle ? <button onClick={openNextAction}>Continuar jornada <MaterialIcon name="arrow_forward" /></button> : null}</div>
      <div className="journey-hero-progress"><MaterialIcon name={nextExam ? "assignment" : "route"} filled /><div><small>PROGRESSO DO MÓDULO</small><strong>{course.academic?.moduleStates.find(state => state.moduleId === currentModule?.id)?.percent ?? 0}%</strong><div><span style={{ width: `${course.academic?.moduleStates.find(state => state.moduleId === currentModule?.id)?.percent ?? 0}%` }} /></div><b>{nextActionType}</b></div></div>
    </section>

    <section className="journey-insights" aria-label="Resumo da jornada"><div className="journey-stats"><article><MaterialIcon name="school" /><span><strong>{completedLessons}</strong><small>aulas concluídas</small></span></article><article><MaterialIcon name="verified" /><span><strong>{completedSections}</strong><small>seções concluídas</small></span></article><article><MaterialIcon name="analytics" /><span><strong>{averageScore === undefined ? "—" : `${averageScore}%`}</strong><small>{averageScore === undefined ? "sem média ainda" : "melhor média"}</small></span></article></div><article className="journey-focus"><div><span className="eyebrow">SEU FOCO</span><h2>{focus.length ? "Fortaleça seus pontos mais importantes" : "Estamos conhecendo seu desempenho"}</h2><p>{focus.length ? "Recomendações baseadas nas suas respostas reais, sem números fictícios." : "Continue praticando para receber recomendações personalizadas."}</p></div>{focus.length ? <div className="journey-focus-skills">{focus.map(item => <button key={item.skill} onClick={() => router.push(item.lessonId ? `/praticar/${item.lessonId}` : "/praticar")}><span><strong>{item.skill.replace(/[_-]+/g, " ")}</strong><small>{item.percentage < 60 ? "Precisa de prática" : "Pode melhorar"}</small></span><b>{item.percentage}%</b></button>)}</div> : <MaterialIcon name="insights" />}</article></section>

    <div className="journey-layout"><div className="journey-timeline">
      {ordered.modules.length === 0 && <p className="dashboard-empty-course">Os módulos aparecerão aqui assim que forem publicados.</p>}
      {ordered.modules.map((courseModule, moduleIndex) => {
        const moduleState = course.academic?.moduleStates.find(state => state.moduleId === courseModule.id);
        const sections = ordered.sections.filter(section => section.moduleId === courseModule.id);
        const moduleOpen = expandedModuleId === undefined ? Boolean(moduleState?.unlocked && !moduleState.completed) : expandedModuleId === courseModule.id;
        const moduleStatus = moduleState?.reviewOnly ? "Revisão" : moduleState?.completed ? "Concluído" : moduleState?.unlocked ? "Disponível" : "Bloqueado";
        return <section className={`journey-module academic-${moduleState?.status ?? "locked"}${moduleOpen ? " is-open" : ""}`} key={courseModule.id}>
          <div className="journey-level-marker"><span><MaterialIcon name={statusIcon[moduleState?.status ?? "locked"]} filled={moduleState?.status === "completed"} /></span></div>
          <div className="journey-module-card">
            <header className="journey-module-head"><div><small>MÓDULO {String(moduleIndex + 1).padStart(2, "0")} · {courseModule.level} <span>· {moduleStatus}</span></small><h2>{courseModule.title}</h2><p>{moduleState?.unlocked ? `${moduleState.completedSections} de ${moduleState.sectionCount} matérias concluídas` : "Conclua o módulo anterior para liberar"}</p></div><div className="journey-module-head-actions"><strong>{moduleState?.percent ?? 0}%</strong><button type="button" className="journey-expand-button" aria-label={`${moduleOpen ? "Recolher" : "Expandir"} módulo ${courseModule.title}`} aria-expanded={moduleOpen} onClick={() => setExpandedModuleId(moduleOpen ? null : courseModule.id)}><MaterialIcon name={moduleOpen ? "expand_less" : "expand_more"} /></button></div></header>
            <div className="journey-progress" role="progressbar" aria-label={`Progresso do módulo ${courseModule.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={moduleState?.percent ?? 0}><span style={{ width: `${moduleState?.percent ?? 0}%` }} /></div>
            <div className="journey-sections">{sections.map((section, sectionIndex) => {
              const sectionState = course.academic?.sectionStates.find(state => state.sectionId === section.id);
              const lessons = ordered.lessons.filter(lesson => lesson.sectionId === section.id);
              const sectionOpen = expandedSectionId === undefined ? Boolean(sectionState?.unlocked && !sectionState.completed) : expandedSectionId === section.id;
              const sectionStatus = sectionState?.completed ? "Concluída" : sectionState?.unlocked ? "Disponível" : "Bloqueada";
              return <article className={`journey-section-card academic-${sectionState?.status ?? "locked"}${sectionOpen ? " is-open" : ""}`} key={section.id}>
                <header><span><MaterialIcon name={statusIcon[sectionState?.status ?? "locked"]} filled={sectionState?.status === "completed"} /></span><div><small>MATÉRIA {String(sectionIndex + 1).padStart(2, "0")} · {sectionStatus}</small><h3>{section.title}</h3><p>{sectionState?.completedLessons ?? 0} de {sectionState?.lessonCount ?? lessons.length} aulas concluídas</p></div><b>{sectionState?.percent ?? 0}%</b><button type="button" className="journey-expand-button" aria-label={`${sectionOpen ? "Recolher" : "Expandir"} matéria ${section.title}`} aria-expanded={sectionOpen} onClick={() => setExpandedSectionId(sectionOpen ? null : section.id)}><MaterialIcon name={sectionOpen ? "expand_less" : "expand_more"} /></button></header>
                <div className="journey-lesson-list">
                  {lessons.map((lesson, lessonIndex) => {
                    const lessonState = course.academic?.lessonStates.find(state => state.lessonId === lesson.id);
                    const isNext = nextLesson?.id === lesson.id;
                    return <button className={isNext ? "is-next" : ""} disabled={!lessonState?.ready || !lessonState.unlocked} onClick={() => onContinue(lesson)} key={lesson.id}><span><MaterialIcon name={lessonState?.ready === false ? "construction" : statusIcon[lessonState?.status ?? "locked"]} filled={lessonState?.completed} /></span><div><small>AULA {String(lessonIndex + 1).padStart(2, "0")} · {lesson.duration}</small><strong>{lesson.title}</strong></div><b>{lessonState?.ready === false ? "Em preparação" : lessonState?.completed ? "Concluída" : lessonState?.status === "in_progress" ? "Em andamento" : lessonState?.status === "available" ? "Próxima" : "Bloqueada"}</b></button>;
                  })}
                  <button className={`journey-exam-row${nextExam?.sectionId === section.id ? " is-next" : ""}`} disabled={!sectionState?.examUnlocked && !sectionState?.examPassed} onClick={() => onOpenExam(section.id)}><span><MaterialIcon name={sectionState?.examPassed ? "workspace_premium" : sectionState?.examUnlocked ? "trophy" : "lock"} filled={sectionState?.examPassed} /></span><div><small>PROVA DA MATÉRIA</small><strong>{sectionState?.examTitle || `Prova — ${section.title}`}</strong></div><b>{sectionState?.examPassed ? "Aprovado" : sectionState?.examUnlocked ? "Liberada" : sectionState?.examId ? "Bloqueada" : "Em preparação"}</b></button>
                </div>
              </article>;
            })}</div>
          </div>
        </section>;
      })}
    </div><aside className="journey-aside"><MaterialIcon name={nextExam ? "assignment" : "flag"} /><span className="eyebrow">{nextActionType}</span><h3>{nextActionTitle ?? "Jornada em dia"}</h3><p>{nextActionDescription}</p>{nextActionTitle && step?.kind !== "complete" && <button onClick={openNextAction}>Continuar <MaterialIcon name="arrow_forward" /></button>}</aside></div>
    {nextActionTitle && step?.kind !== "complete" && <button className="journey-mobile-continue" onClick={openNextAction}><span><small>{nextActionType}</small><strong>{nextActionTitle}</strong></span><span>Continuar <MaterialIcon name="arrow_forward" /></span></button>}
  </div>;
}
