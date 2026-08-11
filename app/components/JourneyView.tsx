"use client";

import { useEffect, useMemo, useState } from "react";
import { CourseData, CourseLesson, CourseProgress, orderedCourse, progressForLesson } from "../lib/course";
import { MaterialIcon } from "./MaterialIcon";

const emptyCourse: CourseData = { modules: [], sections: [], lessons: [] };

export function JourneyView({ onContinue }: { onContinue: (lesson: CourseLesson) => void }) {
  const [course, setCourse] = useState<CourseData>(emptyCourse);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/content").then((response) => response.ok ? response.json() as Promise<CourseData> : Promise.reject()),
      fetch("/api/progress").then((response) => response.ok ? response.json() as Promise<{ progress: CourseProgress[] }> : Promise.reject()),
    ]).then(([content, saved]) => {
      if (!cancelled) { setCourse(content); setProgress(saved.progress ?? []); }
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const ordered = useMemo(() => orderedCourse(course), [course]);
  const path = useMemo(() => ordered.modules.map((courseModule) => {
    const sectionIds = new Set(ordered.sections.filter((section) => section.moduleId === courseModule.id).map((section) => section.id));
    const lessons = ordered.lessons.filter((lesson) => sectionIds.has(lesson.sectionId));
    const completed = lessons.filter((lesson) => progressForLesson(lesson, progress) >= 100).length;
    const percent = lessons.length ? Math.round(lessons.reduce((total, lesson) => total + progressForLesson(lesson, progress), 0) / lessons.length) : 0;
    return { courseModule, lessons, completed, percent };
  }), [ordered, progress]);
  const currentModuleIndex = Math.max(0, path.findIndex((item) => item.percent < 100));
  const currentPath = path[currentModuleIndex];
  const nextLesson = currentPath?.lessons.find((lesson) => progressForLesson(lesson, progress) < 100);

  if (loading) return <div className="page-view journey-page"><div className="journey-loading">Preparando sua jornada...</div></div>;

  return <div className="page-view journey-page">
    <section className="journey-hero">
      <div><span className="eyebrow">SUA JORNADA</span><h1>Seu próximo passo está claro.</h1><p>Acompanhe o caminho recomendado, veja o que concluiu e avance sem se perder.</p></div>
      <div className="journey-current-summary"><MaterialIcon name="route" filled /><span><small>VOCÊ ESTÁ EM</small><strong>{currentPath?.courseModule.title ?? "Primeiro nível"}</strong><b>{currentPath?.percent ?? 0}% concluído</b></span></div>
    </section>

    <div className="journey-layout">
      <div className="journey-timeline">{path.map(({ courseModule, lessons, completed, percent }, moduleIndex) => {
        const isCurrent = moduleIndex === currentModuleIndex;
        const isLocked = moduleIndex > currentModuleIndex;
        return <section className={`journey-level ${isCurrent ? "current" : ""} ${isLocked ? "locked" : ""}`} key={courseModule.id}>
          <div className="journey-level-marker"><span>{isLocked ? <MaterialIcon name="lock" /> : percent >= 100 ? <MaterialIcon name="check" /> : String(moduleIndex + 1).padStart(2, "0")}</span></div>
          <div className="journey-level-card">
            <header><div><small>{courseModule.level}</small><h2>{courseModule.title}</h2><p>{isLocked ? "Conclua o nível anterior para liberar esta etapa." : `${completed} de ${lessons.length} aulas concluídas`}</p></div><strong>{percent}%</strong></header>
            <div className="journey-progress"><span style={{ width: `${percent}%` }} /></div>
            <div className="journey-lesson-steps">{lessons.map((lesson, lessonIndex) => {
              const lessonPercent = progressForLesson(lesson, progress);
              const isNext = isCurrent && lesson.id === nextLesson?.id;
              return <article className={lessonPercent >= 100 ? "done" : isNext ? "next" : "pending"} key={lesson.id}><span>{lessonPercent >= 100 ? <MaterialIcon name="check" /> : isNext ? <MaterialIcon name="play_arrow" filled /> : lessonIndex + 1}</span><div><small>AULA {String(lessonIndex + 1).padStart(2, "0")}</small><strong>{lesson.title}</strong></div>{lessonPercent >= 100 ? <b>Concluída</b> : isNext ? <b>Próxima aula</b> : null}</article>;
            })}</div>
            {isCurrent && nextLesson && <button className="primary-button icon-button" onClick={() => onContinue(nextLesson)}>Continuar jornada <MaterialIcon name="arrow_forward" /></button>}
          </div>
        </section>;
      })}</div>
      <aside className="journey-aside"><MaterialIcon name="flag" /><span className="eyebrow">PRÓXIMA META</span><h3>{nextLesson?.title ?? "Nível concluído"}</h3><p>{nextLesson ? "Conclua esta aula para continuar avançando no seu nível atual." : "Parabéns! Você concluiu todas as aulas disponíveis."}</p><div><span>Progresso do nível</span><strong>{currentPath?.percent ?? 0}%</strong></div></aside>
    </div>
  </div>;
}
