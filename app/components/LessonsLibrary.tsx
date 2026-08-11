"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CourseData, CourseLesson, CourseProgress, CourseSection, orderedCourse, progressForLesson } from "../lib/course";
import { MaterialIcon } from "./MaterialIcon";

const emptyCourse: CourseData = { modules: [], sections: [], lessons: [] };

function ProgressBar({ value }: { value: number }) {
  return <div className="rail-progress-bar"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function LessonArtwork({ lesson }: { lesson: CourseLesson }) {
  return <div className="lesson-thumb">
    {lesson.imageKey ? <img src={`/api/media?key=${encodeURIComponent(lesson.imageKey)}`} alt="" style={{ objectFit: lesson.imageFit ?? "cover", objectPosition: `${lesson.imagePositionX ?? 50}% ${lesson.imagePositionY ?? 50}%`, transform: `scale(${(lesson.imageZoom ?? 100) / 100})` }} /> : <span><MaterialIcon name={lesson.videoKey ? "play_arrow" : "school"} /></span>}
    <i style={{ opacity: (lesson.imageOverlay ?? 18) / 100 }} />
  </div>;
}

function LessonCard({ lesson, index, progress, onOpen }: { lesson: CourseLesson; index: number; progress: number; onOpen: () => void }) {
  const status = progress >= 100 ? "Concluída" : progress > 0 ? "Em andamento" : "Não iniciada";
  return <article className={`student-lesson-card ${status === "Concluída" ? "complete" : progress > 0 ? "active" : ""}`}>
    <div className="lesson-card-art"><LessonArtwork lesson={lesson} />{status === "Concluída" ? <b><MaterialIcon name="check" /></b> : null}</div>
    <div className="student-lesson-copy"><small>Aula {String(index + 1).padStart(2, "0")} · {lesson.duration}</small><h4>{lesson.title}</h4><p>{lesson.lessonType}</p><ProgressBar value={progress} /><div><span>{status}</span><button onClick={onOpen}>Abrir aula <MaterialIcon name="arrow_forward" /></button></div></div>
  </article>;
}

function CourseSectionRail({ section, lessons, progress, onOpenLesson }: { section: CourseSection; lessons: CourseLesson[]; progress: CourseProgress[]; onOpenLesson: (lesson: CourseLesson) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  return <div className="course-section-rail"><div className="section-rail-head"><div><h3>{section.title}</h3><p>{lessons.length} aulas disponíveis</p></div><div className="rail-controls"><button onClick={() => railRef.current?.scrollBy({ left: -320, behavior: "smooth" })} aria-label="Aulas anteriores"><MaterialIcon name="chevron_left" /></button><button onClick={() => railRef.current?.scrollBy({ left: 320, behavior: "smooth" })} aria-label="Próximas aulas"><MaterialIcon name="chevron_right" /></button></div></div><div className="student-lesson-rail" ref={railRef}>{lessons.map((lesson, index) => <LessonCard key={lesson.id} lesson={lesson} index={index} progress={progressForLesson(lesson, progress)} onOpen={() => onOpenLesson(lesson)} />)}</div></div>;
}

function LessonPlayer({ lesson, sectionTitle, level, onBack, onPractice }: { lesson: CourseLesson; sectionTitle: string; level: string; onBack: () => void; onPractice: () => void }) {
  return <div className="lesson-player-page">
    <button className="module-back-button" onClick={onBack}><MaterialIcon name="arrow_back" />Voltar para aulas</button>
    <section className="lesson-player-hero"><div className="lesson-player-video">{lesson.videoKey ? <video controls preload="metadata" src={`/api/videos?key=${encodeURIComponent(lesson.videoKey)}`} /> : <div><MaterialIcon name="movie" /><strong>Videoaula em preparação</strong><span>O conteúdo complementar já pode ser explorado abaixo.</span></div>}</div><div className="lesson-player-copy"><span className="eyebrow">{level} · {sectionTitle}</span><h1>{lesson.title}</h1><p>Assista à aula, revise os pontos principais e pratique quando estiver pronto.</p><div className="lesson-player-meta"><span><MaterialIcon name="schedule" />{lesson.duration}</span><span><MaterialIcon name="school" />{lesson.lessonType}</span></div><button className="primary-button icon-button" onClick={onPractice}>Praticar esta aula <MaterialIcon name="target" /></button></div></section>
    <div className="lesson-player-sections"><article><MaterialIcon name="menu_book" /><div><span className="eyebrow">NESTA AULA</span><h2>Objetivos de aprendizagem</h2><p>Compreender o conteúdo em contexto, reconhecer estruturas naturais e usar o inglês com mais confiança.</p></div></article><article><MaterialIcon name="tips_and_updates" /><div><span className="eyebrow">DICA DA MAYA</span><h2>Aprenda de forma ativa</h2><p>Anote expressões completas e tente criar um exemplo próprio antes de iniciar a prática.</p></div></article></div>
  </div>;
}

export function LessonsLibrary({ onPracticeLesson }: { onPracticeLesson: (lessonId: number) => void }) {
  const [data, setData] = useState<CourseData>(emptyCourse);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<CourseLesson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/content").then((response) => response.ok ? response.json() as Promise<CourseData> : Promise.reject()),
      fetch("/api/progress").then((response) => response.ok ? response.json() as Promise<{ progress: CourseProgress[] }> : Promise.reject()),
    ]).then(([content, saved]) => { if (!cancelled) { setData(content); setProgress(saved.progress ?? []); } }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const ordered = useMemo(() => orderedCourse(data), [data]);
  const firstInProgress = ordered.lessons.find((lesson) => { const value = progressForLesson(lesson, progress); return value > 0 && value < 100; });
  const featuredLesson = firstInProgress ?? ordered.lessons[0];
  const featuredSection = featuredLesson ? ordered.sections.find((section) => section.id === featuredLesson.sectionId) : undefined;
  const featuredModule = featuredSection ? ordered.modules.find((item) => item.id === featuredSection.moduleId) : undefined;

  if (selectedLesson) {
    const section = ordered.sections.find((item) => item.id === selectedLesson.sectionId);
    const courseModule = section ? ordered.modules.find((item) => item.id === section.moduleId) : undefined;
    return <div className="library-page page-view course-rails-page"><LessonPlayer lesson={selectedLesson} sectionTitle={section?.title ?? "Aula"} level={courseModule?.level ?? "Right Way"} onBack={() => setSelectedLesson(null)} onPractice={() => onPracticeLesson(selectedLesson.id)} /></div>;
  }

  return <div className="library-page page-view course-rails-page">
    <section className="lessons-library-hero"><div><span className="eyebrow">BIBLIOTECA DE AULAS</span><h1>Explore o inglês no seu ritmo.</h1><p>Escolha livremente um nível, uma seção e a aula que deseja assistir.</p></div><div className="lessons-library-icon"><MaterialIcon name="video_library" filled /><span><strong>{ordered.lessons.length}</strong><small>aulas disponíveis</small></span></div></section>
    {loading ? <div className="journey-loading">Carregando biblioteca...</div> : null}
    {featuredLesson ? <section className="continue-learning-card"><div><span className="eyebrow">CONTINUE APRENDENDO</span><h2>{featuredLesson.title}</h2><p>{featuredModule?.level} · {featuredSection?.title} · {featuredLesson.duration}</p><ProgressBar value={progressForLesson(featuredLesson, progress)} /></div><button onClick={() => setSelectedLesson(featuredLesson)}>Abrir aula <MaterialIcon name="arrow_forward" /></button></section> : null}
    <div className="course-rails-intro"><div><span className="eyebrow">CONTEÚDOS</span><h2>Níveis e seções</h2></div><p>Aulas é sua biblioteca: explore os conteúdos disponíveis sem alterar a ordem recomendada da sua Jornada.</p></div>
    {ordered.modules.map((courseModule, moduleIndex) => {
      const sections = ordered.sections.filter((section) => section.moduleId === courseModule.id);
      const sectionIds = new Set(sections.map((section) => section.id));
      const lessons = ordered.lessons.filter((lesson) => sectionIds.has(lesson.sectionId));
      const completed = lessons.filter((lesson) => progressForLesson(lesson, progress) >= 100).length;
      return <section className="course-level-rail" key={courseModule.id}><header className="level-rail-head"><span>{String(moduleIndex + 1).padStart(2, "0")}</span><div><small>{courseModule.level}</small><h2>{courseModule.title}</h2><p>{courseModule.description}</p></div><aside><strong>{lessons.length} aulas</strong><small>{completed} concluídas</small><ProgressBar value={lessons.length ? Math.round(lessons.reduce((sum, lesson) => sum + progressForLesson(lesson, progress), 0) / lessons.length) : 0} /></aside></header>{sections.map((section) => { const sectionLessons = lessons.filter((lesson) => lesson.sectionId === section.id); return sectionLessons.length ? <CourseSectionRail key={section.id} section={section} lessons={sectionLessons} progress={progress} onOpenLesson={setSelectedLesson} /> : null; })}</section>;
    })}
  </div>;
}
