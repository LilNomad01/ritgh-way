"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseData, CourseLesson, LessonState, SectionState } from "../lib/course";
import { orderedCourse } from "../lib/course";
import { getNextLearningStep, skillLabel } from "../lib/learning-progress";
import { getCachedCourseData, loadCourseData } from "../lib/client-data";
import { MaterialIcon } from "./MaterialIcon";

const emptyCourse: CourseData = {
  modules: [],
  sections: [],
  lessons: [],
  academic: { lessonStates: [], sectionStates: [], moduleStates: [] },
};

function StatusIcon({ status }: { status: "completed" | "in_progress" | "available" | "locked" }) {
  return <MaterialIcon
    name={status === "completed" ? "check_circle" : status === "in_progress" ? "pending" : status === "available" ? "play_circle" : "lock"}
    filled={status === "completed"}
  />;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return <div className="rwj-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <span style={{ width: percent + "%" }} />
  </div>;
}

function lessonStatus(state?: LessonState) {
  if (!state?.ready) return { text: "Em preparação", type: "pending" };
  if (state.completed) return { text: "Concluída", type: "done" };
  if (!state.unlocked) return { text: "Bloqueada", type: "locked" };
  if (state.status === "in_progress") return { text: "Em andamento", type: "current" };
  return { text: "Disponível", type: "available" };
}

function examStatus(state?: SectionState) {
  if (!state?.examId) return { text: "Em preparação", type: "pending" };
  if (state.examPassed) return { text: "Aprovada", type: "done" };
  if (state.examUnlocked) return { text: "Liberada", type: "available" };
  return { text: "Bloqueada", type: "locked" };
}

export function JourneyView({
  onContinue,
  onOpenExam,
}: {
  onContinue: (lesson: CourseLesson) => void;
  onOpenExam: (sectionId: number) => void;
}) {
  const router = useRouter();
  const cached = getCachedCourseData();
  const [course, setCourse] = useState<CourseData>(cached ?? emptyCourse);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedModuleId, setSelectedModuleId] = useState<number | undefined>(undefined);
  const [openSectionId, setOpenSectionId] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadCourseData()
      .then(data => {
        if (!cancelled) {
          setCourse(data);
          setError("");
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar a jornada.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [retry]);

  const ordered = useMemo(() => orderedCourse(course), [course]);
  const academic = course.academic;
  const step = academic ? getNextLearningStep(academic) : null;
  const moduleStates = academic?.moduleStates ?? [];
  const sectionStates = academic?.sectionStates ?? [];
  const lessonStates = academic?.lessonStates ?? [];

  const nextLesson = ordered.lessons.find(lesson => lesson.id === step?.lessonId);
  const nextSection = ordered.sections.find(section => section.id === step?.sectionId);
  const nextExam = step?.kind === "exam" || step?.kind === "review"
    ? sectionStates.find(state => state.sectionId === step.sectionId)
    : undefined;
  const nextLessonState = lessonStates.find(state => state.lessonId === nextLesson?.id);

  const recommendedModule = ordered.modules.find(module =>
    moduleStates.some(state => state.moduleId === module.id && state.unlocked && !state.completed && !state.reviewOnly)
  ) ?? ordered.modules.find(module =>
    moduleStates.some(state => state.moduleId === module.id && state.unlocked && !state.reviewOnly)
  ) ?? ordered.modules[0];

  const selectedModule = ordered.modules.find(module => module.id === selectedModuleId)
    ?? recommendedModule;
  const selectedState = moduleStates.find(state => state.moduleId === selectedModule?.id);
  const selectedSections = ordered.sections.filter(section => section.moduleId === selectedModule?.id);
  const suggestedSection = selectedSections.find(section => section.id === step?.sectionId)
    ?? selectedSections.find(section => sectionStates.some(state => state.sectionId === section.id && state.unlocked && !state.completed))
    ?? selectedSections[0];
  const expandedSectionId = openSectionId === undefined ? suggestedSection?.id : openSectionId;

  const completedLessons = lessonStates.filter(state => state.ready && !state.reviewOnly && state.completed).length;
  const completedSections = sectionStates.filter(state => !state.reviewOnly && state.completed).length;
  const scoredLessons = lessonStates.filter(state => !state.reviewOnly && state.bestPercentage !== undefined);
  const averageScore = scoredLessons.length
    ? Math.round(scoredLessons.reduce((sum, state) => sum + (state.bestPercentage ?? 0), 0) / scoredLessons.length)
    : null;
  const activePercent = selectedState?.percent ?? 0;

  const focus = useMemo(() => {
    const scores = new Map<string, { correct: number; total: number; lessonId?: number }>();
    for (const section of course.academic?.sectionStates ?? []) {
      if (section.reviewOnly) continue;
      for (const skill of section.weakSkills) {
        if (skill.total <= 0) continue;
        const old = scores.get(skill.skill) ?? { correct: 0, total: 0, lessonId: skill.lessonId };
        scores.set(skill.skill, {
          correct: old.correct + skill.correct,
          total: old.total + skill.total,
          lessonId: old.lessonId ?? skill.lessonId,
        });
      }
    }
    return [...scores].map(([skill, value]) => ({
      skill,
      score: Math.round(100 * value.correct / value.total),
      lessonId: value.lessonId,
    })).filter(item => item.score < 80).sort((a, b) => a.score - b.score).slice(0, 3);
  }, [course]);

  const stepKind = step?.kind;
  const canContinue = Boolean(step && stepKind !== "complete");
  const isCourseDone = stepKind === "complete";
  const actionTitle = nextExam?.examTitle
    ?? nextLesson?.title
    ?? (stepKind === "pending" ? "Novos conteúdos em preparação" : isCourseDone ? "Você concluiu sua jornada!" : "Sua próxima conquista começa aqui");
  const actionLabel = stepKind === "exam" ? "Fazer avaliação"
    : stepKind === "review" ? "Revisar e tentar novamente"
    : stepKind === "practice" ? "Continuar exercícios"
    : stepKind === "pending" ? "Explorar biblioteca"
    : "Continuar aprendendo";
  const actionCategory = stepKind === "exam" ? "AVALIAÇÃO LIBERADA"
    : stepKind === "review" ? "HORA DE REVISAR"
    : stepKind === "practice" ? "PRÁTICA PENDENTE"
    : stepKind === "pending" ? "PRÓXIMOS PASSOS"
    : isCourseDone ? "JORNADA CONCLUÍDA"
    : "CONTINUE DE ONDE PAROU";
  const actionDescription = stepKind === "exam" ? "Você terminou as aulas desta matéria. É hora de mostrar o que aprendeu."
    : stepKind === "review" ? "Revise suas respostas e prepare-se para a próxima tentativa."
    : stepKind === "practice" ? "Finalize a prática desta aula para avançar."
    : stepKind === "pending" ? "A próxima etapa ainda está sendo preparada. Você pode rever as aulas disponíveis."
    : nextLessonState?.videoStatus === "watching" ? "Seu vídeo está em " + nextLessonState.videoPercent + "%. Retome de onde parou."
    : isCourseDone ? "Parabéns! Explore as aulas novamente quando quiser."
    : nextLesson ? "Assista à aula, pratique e avance no seu ritmo."
    : "Explore as matérias do seu curso e comece a estudar.";

  if (loading) {
    return <div className="page-view rwj" aria-live="polite"><div className="rwj-loading">
      <MaterialIcon name="hourglass_top" /><strong>Preparando sua jornada...</strong><span>Organizando suas aulas e seu progresso</span>
    </div></div>;
  }

  if (error) {
    return <div className="page-view rwj"><div className="rwj-error" role="alert">
      <MaterialIcon name="error_outline" /><h2>Não foi possível carregar a jornada</h2><p>{error}</p>
      <button type="button" onClick={() => { setError(""); setLoading(true); setRetry(count => count + 1); }}>Tentar novamente</button>
    </div></div>;
  }

  return <div className="page-view rwj">
    <header className="rwj-heading">
      <div>
        <span className="rwj-kicker">RIGHT WAY · SEU CAMINHO</span>
        <h1>Sua jornada de inglês<span className="rwj-heading-dot">.</span></h1>
        <p>Um passo de cada vez. Saiba onde você está e o que vem depois.</p>
      </div>
      <div className="rwj-summary" aria-label="Resumo do seu desempenho">
        <div><MaterialIcon name="school" /><strong>{completedLessons}</strong><small>Aulas feitas</small></div>
        <div><MaterialIcon name="task_alt" /><strong>{completedSections}</strong><small>Matérias</small></div>
        <div><MaterialIcon name="monitoring" /><strong>{averageScore === null ? "—" : averageScore + "%"}</strong><small>Média das práticas</small></div>
      </div>
    </header>

    <section className="rwj-resume" aria-label="Seu próximo passo">
      <div className="rwj-resume-main">
        <div className="rwj-resume-label"><span className="rwj-pulse" aria-hidden="true" />{actionCategory}</div>
        <div className="rwj-resume-path">{recommendedModule?.title ?? "Right Way"}{nextSection ? " / " + nextSection.title : ""}</div>
        <h2>{actionTitle}</h2>
        <p>{actionDescription}</p>
        {canContinue && <button type="button" className="rwj-primary" onClick={() => router.push(step!.href)}>
          {actionLabel}<MaterialIcon name="arrow_forward" />
        </button>}
      </div>
      <div className="rwj-resume-progress">
        <div className="rwj-ring" style={{ background: "conic-gradient(#f33d55 " + (moduleStates.find(state => state.moduleId === recommendedModule?.id)?.percent ?? 0) + "%, rgba(255,255,255,.14) 0)" }}>
          <div><strong>{moduleStates.find(state => state.moduleId === recommendedModule?.id)?.percent ?? 0}%</strong><small>do módulo</small></div>
        </div>
        <span>{recommendedModule?.title ?? "Seu progresso"}</span>
      </div>
    </section>

    <section className="rwj-path" aria-label="Escolha o nível">
      <div className="rwj-section-heading">
        <div><span className="rwj-kicker">EVOLUÇÃO</span><h2>Seu caminho para a fluência</h2></div>
        <p>Selecione um módulo para explorar as matérias.</p>
      </div>
      <div className="rwj-levels" role="group" aria-label="Módulos do curso">
        {ordered.modules.map((module, index) => {
          const state = moduleStates.find(item => item.moduleId === module.id);
          const active = selectedModule?.id === module.id;
          const status = state?.completed ? "completed" : state?.reviewOnly ? "review" : state?.unlocked ? "active" : "locked";
          return <button type="button" key={module.id}
            className={["rwj-level", "rwj-level-" + status, active ? "is-selected" : ""].join(" ")}
            aria-pressed={active} onClick={() => { setSelectedModuleId(module.id); setOpenSectionId(undefined); }}>
            <span className="rwj-level-icon"><MaterialIcon name={status === "completed" ? "check" : status === "locked" ? "lock" : "auto_stories"} /></span>
            <span className="rwj-level-body"><small>MÓDULO {String(index + 1).padStart(2, "0")} · {module.level}</small>
              <strong>{module.title}</strong><span>{status === "completed" ? "Concluído" : status === "review" ? "Revisão" : status === "locked" ? "Bloqueado" : "Em andamento"}</span></span>
            <b>{state?.percent ?? 0}%</b>
            <span className="rwj-level-track" aria-hidden="true"><i style={{ width: (state?.percent ?? 0) + "%" }} /></span>
          </button>;
        })}
      </div>
    </section>

    {selectedModule ? <section className="rwj-content" aria-label={"Matérias de " + selectedModule.title}>
      <div className="rwj-content-head">
        <div className="rwj-content-head-title">
          <div className="rwj-book"><MaterialIcon name="menu_book" /></div>
          <div><span className="rwj-kicker">{selectedModule.level} · SEU PLANO DE ESTUDOS</span><h2>{selectedModule.title}</h2>
            <p>{selectedState?.reviewOnly ? "Conteúdo disponível para revisão" : selectedState?.unlocked ? "Avance pelas matérias e conclua as avaliações." : "Conclua os módulos anteriores para liberar este nível."}</p>
          </div>
        </div>
        <div className="rwj-content-progress"><strong>{activePercent}%</strong><small>{selectedState?.completedSections ?? 0} de {selectedState?.sectionCount ?? selectedSections.length} matérias</small></div>
      </div>
      <ProgressBar value={activePercent} label={"Progresso do módulo " + selectedModule.title} />

      <div className="rwj-chapter-heading"><h3>Matérias do módulo</h3><span>{selectedSections.length} {selectedSections.length === 1 ? "matéria" : "matérias"}</span></div>
      <div className="rwj-chapters">
        {selectedSections.length === 0 && <div className="rwj-empty">As matérias deste módulo ainda estão sendo preparadas.</div>}
        {selectedSections.map((section, sectionIndex) => {
          const state = sectionStates.find(item => item.sectionId === section.id);
          const lessons = ordered.lessons.filter(lesson => lesson.sectionId === section.id);
          const expanded = expandedSectionId === section.id;
          const sectionStatus = state?.completed ? "completed" : state?.unlocked ? "available" : "locked";
          return <article key={section.id} className={["rwj-chapter", "rwj-chapter-" + sectionStatus, expanded ? "is-expanded" : ""].join(" ")}>
            <button type="button" className="rwj-chapter-trigger" aria-expanded={expanded}
              aria-controls={"rwj-chapter-body-" + section.id}
              onClick={() => setOpenSectionId(expanded ? null : section.id)}>
              <span className="rwj-chapter-number">{state?.completed ? <MaterialIcon name="check" /> : String(sectionIndex + 1).padStart(2, "0")}</span>
              <span className="rwj-chapter-copy"><small>{state?.completed ? "MATÉRIA CONCLUÍDA" : state?.unlocked ? "MATÉRIA " + String(sectionIndex + 1).padStart(2, "0") : "MATÉRIA BLOQUEADA"}</small>
                <strong>{section.title}</strong>
                <span>{state?.completedLessons ?? 0} de {state?.lessonCount ?? lessons.length} aulas disponíveis concluídas</span>
              </span>
              <span className="rwj-chapter-right"><b>{state?.percent ?? 0}%</b><MaterialIcon name={expanded ? "keyboard_arrow_up" : "keyboard_arrow_down"} /></span>
            </button>
            {expanded && <div className="rwj-chapter-body" id={"rwj-chapter-body-" + section.id}>
              <ProgressBar value={state?.percent ?? 0} label={"Progresso da matéria " + section.title} />
              <div className="rwj-lessons">
                {lessons.map((lesson, lessonIndex) => {
                  const itemState = lessonStates.find(item => item.lessonId === lesson.id);
                  const status = lessonStatus(itemState);
                  const isNext = step?.lessonId === lesson.id && (step.kind === "video" || step.kind === "practice");
                  const available = Boolean(itemState?.ready && itemState.unlocked);
                  return <button key={lesson.id} type="button" disabled={!available}
                    className={["rwj-lesson", "rwj-lesson-" + status.type, isNext ? "is-next" : ""].join(" ")}
                    onClick={() => { if (isNext && step?.kind === "practice") router.push(step.href); else onContinue(lesson); }}>
                    <span className="rwj-lesson-icon"><MaterialIcon name={status.type === "done" ? "check" : status.type === "pending" ? "construction" : status.type === "locked" ? "lock" : status.type === "current" ? "play_arrow" : "play_circle"} /></span>
                    <span className="rwj-lesson-copy"><small>AULA {String(lessonIndex + 1).padStart(2, "0")}{lesson.duration ? " · " + lesson.duration : ""}</small><strong>{lesson.title}</strong></span>
                    <span className={"rwj-status rwj-status-" + status.type}>{isNext && status.type !== "done" && status.type !== "pending" ? (step?.kind === "practice" ? "Praticar" : "Próximo passo") : status.text}</span>
                    {available && <MaterialIcon name="chevron_right" className="rwj-lesson-arrow" />}
                  </button>;
                })}
                <button type="button" className={["rwj-lesson", "rwj-exam", "rwj-lesson-" + examStatus(state).type].join(" ")}
                  disabled={!state?.examId || (!state.examUnlocked && !state.examPassed)} onClick={() => onOpenExam(section.id)}>
                  <span className="rwj-lesson-icon"><MaterialIcon name={state?.examPassed ? "workspace_premium" : state?.examUnlocked ? "assignment" : "lock"} /></span>
                  <span className="rwj-lesson-copy"><small>AVALIAÇÃO DA MATÉRIA</small><strong>{state?.examTitle ?? "Prova · " + section.title}</strong></span>
                  <span className={"rwj-status rwj-status-" + examStatus(state).type}>{examStatus(state).text}</span>
                  {(state?.examUnlocked || state?.examPassed) && <MaterialIcon name="chevron_right" className="rwj-lesson-arrow" />}
                </button>
              </div>
            </div>}
          </article>;
        })}
      </div>
    </section> : <div className="rwj-empty">Os módulos aparecerão aqui assim que forem publicados.</div>}

    {focus.length > 0 && <section className="rwj-focus" aria-label="Recomendações de prática">
      <div className="rwj-focus-head"><span className="rwj-focus-icon"><MaterialIcon name="track_changes" /></span><div><span className="rwj-kicker">REFORÇO PERSONALIZADO</span>
        <h2>O que vale praticar agora</h2><p>Com base nas respostas das suas atividades.</p></div></div>
      <div className="rwj-focus-items">{focus.map(item => <button type="button" key={item.skill} onClick={() => router.push(item.lessonId ? "/praticar/" + item.lessonId : "/praticar")}>
        <span><strong>{skillLabel(item.skill)}</strong><small>{item.score}% de acertos</small></span>
        <span>Praticar <MaterialIcon name="arrow_forward" /></span>
      </button>)}</div>
    </section>}
  </div>;
}
