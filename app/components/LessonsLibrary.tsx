"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";

type Artwork = { imageKey?: string; imageFit?: "cover" | "contain" | "fill"; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number };
type Module = Artwork & { id: number; title: string; level: string; description: string; status: string; position: number };
type Section = Artwork & { id: number; moduleId: number; title: string; position: number };
type Lesson = Artwork & { id: number; sectionId: number; title: string; duration: string; lessonType: string; status: string; position: number; videoKey?: string };
type Progress = { lessonSlug: string; progressPercent: number; completedAt?: string };

const fallback = {
  modules: [
    { id: 1, title: "Start speaking", level: "Básico", description: "Construa sua base no inglês com apresentações, rotina e frases essenciais.", status: "Publicado", position: 1 },
    { id: 2, title: "Real conversations", level: "Intermediário", description: "Transforme vocabulário em conversas naturais para situações reais.", status: "Publicado", position: 2 },
    { id: 3, title: "Fluent thinking", level: "Avançado", description: "Refine fluência, nuance e precisão para se comunicar com segurança.", status: "Publicado", position: 3 },
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

function slugLesson(lesson: Lesson) {
  return lesson.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function lessonProgress(lesson: Lesson, progress: Progress[]) {
  return progress.find((item) => item.lessonSlug === slugLesson(lesson) || item.lessonSlug === `${slugLesson(lesson)}-practice`)?.progressPercent ?? 0;
}

function ProgressBar({ value }: { value: number }) {
  return <div className="rail-progress-bar"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function LessonArtwork({ lesson }: { lesson: Lesson }) {
  return <div className="lesson-thumb">
    {lesson.imageKey ? <img src={`/api/media?key=${encodeURIComponent(lesson.imageKey)}`} alt="" style={{ objectFit: lesson.imageFit ?? "cover", objectPosition: `${lesson.imagePositionX ?? 50}% ${lesson.imagePositionY ?? 50}%`, transform: `scale(${(lesson.imageZoom ?? 100) / 100})` }} /> : <span><MaterialIcon name={lesson.videoKey ? "play_arrow" : "school"} /></span>}
    <i style={{ opacity: (lesson.imageOverlay ?? 18) / 100 }} />
  </div>;
}

function LessonCard({ lesson, index, progress, onStartLesson }: { lesson: Lesson; index: number; progress: number; onStartLesson: () => void }) {
  const status = progress >= 100 ? "Concluída" : progress > 0 ? "Em andamento" : "Não iniciada";
  return (
    <article className={`student-lesson-card ${status === "Concluída" ? "complete" : progress > 0 ? "active" : ""}`}>
      <div className="lesson-card-art"><LessonArtwork lesson={lesson} />{status === "Concluída" && <b><MaterialIcon name="check" /></b>}</div>
      <div className="student-lesson-copy">
        <small>Aula {String(index + 1).padStart(2, "0")} · {lesson.duration}</small>
        <h4>{lesson.title}</h4>
        <p>{lesson.lessonType}</p>
        <ProgressBar value={progress} />
        <div><span>{status}</span><button onClick={onStartLesson}>Abrir aula <MaterialIcon name="arrow_forward" /></button></div>
      </div>
    </article>
  );
}

function CourseSectionRail({ section, lessons, progress, onStartLesson }: { section: Section; lessons: Lesson[]; progress: Progress[]; onStartLesson: () => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  return (
    <div className="course-section-rail">
      <div className="section-rail-head">
        <div><h3>{section.title}</h3><p>{lessons.length} aulas</p></div>
        <div className="rail-controls">
          <button onClick={() => railRef.current?.scrollBy({ left: -320, behavior: "smooth" })} aria-label="Aulas anteriores"><MaterialIcon name="chevron_left" /></button>
          <button onClick={() => railRef.current?.scrollBy({ left: 320, behavior: "smooth" })} aria-label="Próximas aulas"><MaterialIcon name="chevron_right" /></button>
        </div>
      </div>
      <div className="student-lesson-rail" ref={railRef}>
        {lessons.map((lesson, index) => <LessonCard key={lesson.id} lesson={lesson} index={index} progress={lessonProgress(lesson, progress)} onStartLesson={onStartLesson} />)}
      </div>
    </div>
  );
}

function CourseLevelRail({ module, index, sections, lessons, progress, onStartLesson }: { module: Module; index: number; sections: Section[]; lessons: Lesson[]; progress: Progress[]; onStartLesson: () => void }) {
  const completed = lessons.filter((lesson) => lessonProgress(lesson, progress) >= 100).length;
  const totalProgress = lessons.length ? Math.round(lessons.reduce((sum, lesson) => sum + lessonProgress(lesson, progress), 0) / lessons.length) : 0;
  const nextLesson = lessons.find((lesson) => lessonProgress(lesson, progress) < 100) ?? lessons[0];

  return (
    <section className="course-level-rail">
      <header className="level-rail-head">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div>
          <small>{module.level}</small>
          <h2>{module.title}</h2>
          <p>{module.description}</p>
        </div>
        <aside>
          <strong>{lessons.length} aulas</strong>
          <small>{completed} concluídas</small>
          <ProgressBar value={totalProgress} />
          <b>{totalProgress}%</b>
          <button onClick={onStartLesson} disabled={!nextLesson}>Continuar estudando</button>
        </aside>
      </header>
      {sections.map((section) => {
        const sectionLessons = lessons.filter((lesson) => lesson.sectionId === section.id);
        if (!sectionLessons.length) return null;
        return <CourseSectionRail key={section.id} section={section} lessons={sectionLessons} progress={progress} onStartLesson={onStartLesson} />;
      })}
    </section>
  );
}

export function LessonsLibrary({ onStartLesson }: { onStartLesson: () => void }) {
  const [data, setData] = useState<{ modules: Module[]; sections: Section[]; lessons: Lesson[] }>(fallback);
  const [progress, setProgress] = useState<Progress[]>([]);

  useEffect(() => {
    fetch("/api/content").then((response) => response.ok ? response.json() : Promise.reject()).then((result) => setData(result)).catch(() => undefined);
    fetch("/api/progress").then((response) => response.ok ? response.json() : Promise.reject()).then((result) => setProgress(result.progress ?? [])).catch(() => undefined);
  }, []);

  const modules = useMemo(() => data.modules.slice().sort((left, right) => left.position - right.position || left.id - right.id), [data.modules]);
  const allLessons = data.lessons;
  const firstInProgress = allLessons.find((lesson) => lessonProgress(lesson, progress) > 0 && lessonProgress(lesson, progress) < 100);
  const firstLesson = firstInProgress ?? allLessons[0];
  const firstProgress = firstLesson ? lessonProgress(firstLesson, progress) : 0;
  const firstSection = firstLesson ? data.sections.find((section) => section.id === firstLesson.sectionId) : null;
  const firstModule = firstSection ? data.modules.find((module) => module.id === firstSection.moduleId) : null;

  return (
    <div className="library-page page-view course-rails-page">
      {firstLesson && <section className="continue-learning-card">
        <div>
          <span className="eyebrow">CONTINUE ESTUDANDO</span>
          <h1>{firstLesson.title}</h1>
          <p>{firstModule?.level ?? "Right Way"} · {firstSection?.title ?? "Aula"} · {firstLesson.duration}</p>
          <ProgressBar value={firstProgress} />
        </div>
        <button onClick={onStartLesson}>Continuar aula →</button>
      </section>}

      <div className="course-rails-intro">
        <div><span className="eyebrow">AULAS</span><h2>Escolha seu próximo passo.</h2></div>
        <p>Os níveis aparecem como prateleiras: entre em Iniciante, Intermediário ou Avançado e deslize pelas aulas.</p>
      </div>

      {modules.map((module, index) => {
        const moduleSections = data.sections.filter((section) => section.moduleId === module.id).sort((left, right) => left.position - right.position || left.id - right.id);
        const moduleLessons = data.lessons.filter((lesson) => moduleSections.some((section) => section.id === lesson.sectionId)).sort((left, right) => left.position - right.position || left.id - right.id);
        return <CourseLevelRail key={module.id} module={module} index={index} sections={moduleSections} lessons={moduleLessons} progress={progress} onStartLesson={onStartLesson} />;
      })}
    </div>
  );
}
