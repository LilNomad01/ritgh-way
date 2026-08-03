"use client";

import { useEffect, useMemo, useState } from "react";

type Module = { id: number; title: string; level: string; description: string; status: string; position: number };
type Section = { id: number; moduleId: number; title: string; position: number };
type Lesson = { id: number; sectionId: number; title: string; duration: string; lessonType: string; status: string; position: number; videoKey?: string };

const fallback = {
  modules: [
    { id: 1, title: "Start speaking", level: "Básico", description: "Fundamentos para começar a falar desde a primeira aula.", status: "Publicado", position: 1 },
    { id: 2, title: "Real conversations", level: "Intermediário", description: "Conversas naturais para situações da vida real.", status: "Publicado", position: 2 },
    { id: 3, title: "Fluent thinking", level: "Avançado", description: "Refine argumentação, fluência e precisão.", status: "Publicado", position: 3 },
  ],
  sections: [
    { id: 1, moduleId: 1, title: "Primeiros passos", position: 1 },
    { id: 2, moduleId: 1, title: "Rotina e apresentações", position: 2 },
    { id: 3, moduleId: 2, title: "Food & travel", position: 1 },
    { id: 4, moduleId: 2, title: "Work & connections", position: 2 },
    { id: 5, moduleId: 3, title: "Nuance & persuasion", position: 1 },
  ],
  lessons: [
    { id: 1, sectionId: 1, title: "Nice to meet you", duration: "12 min", lessonType: "Vídeo + Speaking", status: "Publicado", position: 1 },
    { id: 2, sectionId: 1, title: "The verb to be", duration: "16 min", lessonType: "Vídeo + Exercícios", status: "Publicado", position: 2 },
    { id: 3, sectionId: 2, title: "My daily routine", duration: "14 min", lessonType: "Listening + Writing", status: "Publicado", position: 1 },
    { id: 4, sectionId: 3, title: "At the coffee shop", duration: "18 min", lessonType: "Vídeo + Conversation", status: "Publicado", position: 1 },
    { id: 5, sectionId: 3, title: "Checking into a hotel", duration: "21 min", lessonType: "Listening + Speaking", status: "Publicado", position: 2 },
    { id: 6, sectionId: 4, title: "A productive meeting", duration: "19 min", lessonType: "Vídeo + Writing", status: "Publicado", position: 1 },
    { id: 7, sectionId: 5, title: "Making a compelling case", duration: "24 min", lessonType: "Conversation + Speaking", status: "Publicado", position: 1 },
  ],
};

export function LessonsLibrary({ onStartLesson }: { onStartLesson: () => void }) {
  const [data, setData] = useState<{ modules: Module[]; sections: Section[]; lessons: Lesson[] }>(fallback);
  const [level, setLevel] = useState("Todos");
  const [selectedModule, setSelectedModule] = useState<number | null>(2);

  useEffect(() => {
    fetch("/api/admin").then((response) => response.ok ? response.json() : Promise.reject()).then((result) => setData(result)).catch(() => undefined);
  }, []);

  const visibleModules = level === "Todos" ? data.modules : data.modules.filter((module) => module.level === level);
  const selected = data.modules.find((module) => module.id === selectedModule) ?? visibleModules[0];
  const selectedSections = useMemo(() => data.sections.filter((section) => section.moduleId === selected?.id), [data.sections, selected]);

  return (
    <div className="library-page page-view">
      <div className="page-hero library-hero"><div><span className="eyebrow">SUA ÁREA DE ESTUDOS</span><h1>Aulas que acompanham o seu ritmo.</h1><p>Escolha um módulo, continue sua trilha ou explore uma habilidade específica.</p></div><div className="library-progress"><small>PROGRESSO DO NÍVEL</small><strong>42%</strong><div><span /></div><p>18 de 43 aulas concluídas</p></div></div>
      <div className="library-toolbar"><div><h2>Módulos</h2><p>Do essencial à fluência, uma conquista por vez.</p></div><div className="level-filters">{["Todos", "Básico", "Intermediário", "Avançado"].map((item) => <button className={level === item ? "active" : ""} onClick={() => setLevel(item)} key={item}>{item}</button>)}</div></div>

      <div className="module-grid">
        {visibleModules.map((module, index) => {
          const moduleSections = data.sections.filter((section) => section.moduleId === module.id);
          const lessonCount = data.lessons.filter((lesson) => moduleSections.some((section) => section.id === lesson.sectionId)).length;
          return <button key={module.id} onClick={() => setSelectedModule(module.id)} className={`module-poster poster-${index % 3} ${selected?.id === module.id ? "selected" : ""}`}><span className="poster-level">{module.level}</span><div className="poster-art"><i /><i /><i /></div><div className="poster-copy"><small>MÓDULO {String(index + 1).padStart(2, "0")}</small><h3>{module.title}</h3><p>{module.description}</p><div className="poster-progress"><span style={{ width: module.level === "Intermediário" ? "58%" : module.level === "Básico" ? "100%" : "0%" }} /></div><b>{lessonCount} aulas · {module.level === "Avançado" ? "Bloqueado" : module.level === "Básico" ? "Concluído" : "Em andamento"}</b></div></button>;
        })}
      </div>

      {selected && <section className="module-detail"><div className="module-detail-head"><div><span className="eyebrow">{selected.level} · {selected.title}</span><h2>Conteúdo do módulo</h2></div><span>{selectedSections.length} seções</span></div>{selectedSections.map((section, sectionIndex) => <div className="lesson-section" key={section.id}><div className="lesson-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span><div><h3>{section.title}</h3><p>{data.lessons.filter((lesson) => lesson.sectionId === section.id).length} aulas</p></div></div><div className="lesson-rows">{data.lessons.filter((lesson) => lesson.sectionId === section.id).map((lesson, lessonIndex) => <article key={lesson.id}><span className="lesson-number">{lessonIndex + 1}</span><button className="lesson-play" onClick={onStartLesson} aria-label={`Iniciar ${lesson.title}`}>▶</button><div><h4>{lesson.title}</h4><p>{lesson.lessonType}</p></div><small>{lesson.duration}</small><span className={lesson.videoKey ? "video-ready" : "lesson-state"}>{lesson.videoKey ? "Vídeo" : lessonIndex === 0 ? "Continuar" : "Iniciar"}</span><button className="lesson-arrow" onClick={onStartLesson}>→</button></article>)}</div></div>)}</section>}
    </div>
  );
}
