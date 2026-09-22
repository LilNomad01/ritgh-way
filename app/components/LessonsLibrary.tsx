"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CourseData, CourseLesson, CourseSection, LessonState, SectionState, orderedCourse } from "../lib/course";
import type { LessonVideo } from "../lib/lesson-videos";
import { StudentDashboard } from "./StudentDashboard";
import { MaterialIcon } from "./MaterialIcon";
import { AnswerComparison } from "./AnswerComparison";
import { skillLabel, type LearningStep } from "../lib/learning-progress";

const emptyCourse: CourseData = { modules: [], sections: [], lessons: [], academic: { lessonStates: [], sectionStates: [], moduleStates: [] } };

function ProgressBar({ value }: { value: number }) {
  return <div className="rail-progress-bar"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function LessonArtwork({ lesson }: { lesson: CourseLesson }) {
  const desktopKey = lesson.imageKey ?? lesson.imageMobileKey;
  return <div className="lesson-thumb">{desktopKey ? <picture>{lesson.imageMobileKey && <source media="(max-width: 720px)" srcSet={`/api/media?key=${encodeURIComponent(lesson.imageMobileKey)}`} />}<img src={`/api/media?key=${encodeURIComponent(desktopKey)}`} alt="" style={{ objectFit: lesson.imageFit ?? "cover", objectPosition: `${lesson.imagePositionX ?? 50}% ${lesson.imagePositionY ?? 50}%`, transform: `scale(${(lesson.imageZoom ?? 100) / 100})` }} /></picture> : <span><MaterialIcon name={lesson.videoKey ? "play_arrow" : "movie"} /></span>}<i style={{ opacity: (lesson.imageOverlay ?? 18) / 100 }} /></div>;
}

function videoLabel(title: string, index: number) {
  return /\.[a-z0-9]{2,4}$/i.test(title.trim()) ? `Vídeo ${index + 1}` : `${index + 1}. ${title}`;
}

function stateLabel(state?: LessonState) {
  if (!state || state.status === "locked") return "Bloqueada";
  if (state.status === "completed") return state.reviewRecommended ? `Finalizada · ${state.lastPercentage ?? 0}% · revisão recomendada` : state.exerciseCount ? `Finalizada · ${state.bestPercentage ?? 0}% de domínio` : "Finalizada";
  if (state.status === "in_progress") return "Em andamento";
  return "Disponível";
}

function LessonCard({ lesson, index, state, onOpen }: { lesson: CourseLesson; index: number; state?: LessonState; onOpen: () => void }) {
  const label = stateLabel(state);
  const progress = state?.completed ? 100 : Math.round(((state?.videoPercent ?? 0) * .55) + (state?.exercisesCompleted ? 45 : 0));
  return <article className={`student-lesson-card academic-${state?.status ?? "locked"}`}><div className="lesson-card-art"><LessonArtwork lesson={lesson} /><b className="lesson-state-mark"><MaterialIcon name={state?.completed ? "check" : state?.status === "locked" ? "lock" : state?.status === "in_progress" ? "progress_activity" : "play_arrow"} filled={state?.status === "available"} /></b></div><div className="student-lesson-copy"><small>Aula {String(index + 1).padStart(2, "0")} · {lesson.duration}</small><h4>{lesson.title}</h4><p>{lesson.description || lesson.lessonType}</p><ProgressBar value={progress} /><div><span>{label}</span><button disabled={!state?.unlocked} onClick={onOpen}>{state?.unlocked ? "Abrir aula" : "Bloqueada"}<MaterialIcon name={state?.unlocked ? "arrow_forward" : "lock"} /></button></div></div></article>;
}

function SectionExamCard({ section, state, onOpen }: { section: CourseSection; state?: SectionState; onOpen: () => void }) {
  const configured = Boolean(state?.examId && state.examQuestionCount > 0);
  return <article className={`section-exam-card ${state?.examPassed ? "passed" : state?.examUnlocked ? "unlocked" : "locked"}`}><span><MaterialIcon name={state?.examPassed ? "workspace_premium" : state?.examUnlocked ? "trophy" : "lock"} filled /></span><div><small>PROVA DA MATÉRIA</small><h4>{state?.examTitle || `Prova — ${section.title}`}</h4><p>{!configured ? "A avaliação está sendo preparada pelo professor." : state?.examPassed ? `Aprovado com ${state.bestExamPercentage}%` : state?.examUnlocked ? `Você concluiu as ${state.lessonCount} aulas. Agora teste seus conhecimentos.` : "Conclua todos os vídeos e exercícios para liberar."}</p></div><button disabled={!configured} onClick={onOpen}>{state?.examPassed ? "Ver resultado" : state?.examUnlocked ? "Começar prova" : configured ? "Ver requisitos" : "Em preparação"}<MaterialIcon name={state?.examUnlocked ? "arrow_forward" : "lock"} /></button></article>;
}

function CourseSectionRail({ section, lessons, states, sectionState, onOpenLesson, onOpenExam }: { section: CourseSection; lessons: CourseLesson[]; states: LessonState[]; sectionState?: SectionState; onOpenLesson: (lessonId: number) => void; onOpenExam: (sectionId: number) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  return <div className={`course-section-rail section-${sectionState?.status ?? "locked"}`}><div className="section-rail-head"><div><span className="section-status-icon"><MaterialIcon name={sectionState?.completed ? "check_circle" : sectionState?.unlocked ? "radio_button_checked" : "lock"} filled={sectionState?.completed} /></span><div><h3>{section.title}</h3><p>{sectionState?.unlocked ? `${sectionState.completedLessons} de ${sectionState.lessonCount} aulas concluídas` : "Conclua a matéria anterior para desbloquear"}</p></div></div><div className="rail-controls"><button onClick={() => railRef.current?.scrollBy({ left: -320, behavior: "smooth" })} aria-label="Aulas anteriores"><MaterialIcon name="chevron_left" /></button><button onClick={() => railRef.current?.scrollBy({ left: 320, behavior: "smooth" })} aria-label="Próximas aulas"><MaterialIcon name="chevron_right" /></button></div></div><div className="student-lesson-rail" ref={railRef}>{lessons.map((lesson, index) => <LessonCard key={lesson.id} lesson={lesson} index={index} state={states.find((state) => state.lessonId === lesson.id)} onOpen={() => onOpenLesson(lesson.id)} />)}</div><SectionExamCard section={section} state={sectionState} onOpen={() => onOpenExam(section.id)} /></div>;
}

type LessonDetailPayload = { videos: LessonVideo[]; lesson: CourseLesson & { sectionTitle: string; sectionDescription: string; moduleTitle: string; moduleId: number; level: string; videoName?: string }; state: LessonState; nextStep: LearningStep | null; review: { prompt: string; answer: string; correctAnswer: string; explanation: string }[] };

function LessonPage({ lessonId, onBack, onPractice, onContinue }: { lessonId: number; onBack: () => void; onPractice: (lessonId: number) => void; onContinue: (href: string) => void }) {
  const [payload, setPayload] = useState<LessonDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const exitSave = useRef<() => void>(() => {});
  const [activeVideo, setActiveVideo] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedSecond = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lessons/${lessonId}`).then(async (response) => { const data = await response.json() as LessonDetailPayload & { error?: string }; if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a aula."); return data; }).then((data) => { if (!cancelled) setPayload(data); }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a aula."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lessonId]);

  async function saveVideoProgress(ended = false) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    try {
    const response = await fetch(`/api/lessons/${lessonId}/video-progress`, { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ videoId: selectedVideo?.id, positionSeconds: Math.max(0, video.currentTime - (selectedVideo?.startSeconds ?? 0)), durationSeconds: Math.max(1, Math.min(selectedVideo?.endSeconds ?? video.duration, video.duration) - (selectedVideo?.startSeconds ?? 0)), ended }) });
    if (response.ok) {
      const data = await response.json() as { state?: LessonState; nextStep?: LearningStep | null };
      setSaveError("");
      const savedPosition = Math.max(0, video.currentTime - (selectedVideo?.startSeconds ?? 0));
      if (data.state) setPayload((current) => current ? { ...current, state: data.state as LessonState, nextStep: data.nextStep ?? current.nextStep, videos: current.videos.map(item => item.id === selectedVideo?.id ? { ...item, savedPosition, completed: ended ? 1 : item.completed, updatedAt: new Date().toISOString() } : item) } : current);
    } else { setSaveError("Não foi possível salvar sua posição. Pause o vídeo e tente novamente."); }
    } catch { setSaveError("Sem conexão. Sua posição ainda não foi salva."); }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    if (selectedVideo?.endSeconds && video.currentTime >= selectedVideo.endSeconds && !video.paused) { video.pause(); void saveVideoProgress(true); return; }
    const currentSecond = Math.floor(video.currentTime);
    if (Math.abs(currentSecond - lastSavedSecond.current) >= 5) { lastSavedSecond.current = currentSecond; void saveVideoProgress(); }
  }

  const recentVideo = payload?.videos.filter(item => item.updatedAt).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  const selectedVideo = payload?.videos.find(item => item.id === activeVideo) ?? recentVideo ?? payload?.videos[0];
  useEffect(() => { exitSave.current = () => { void saveVideoProgress(); }; });
  useEffect(() => {
    const save = () => exitSave.current();
    const visibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save); document.addEventListener("visibilitychange", visibility);
    return () => { save(); window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  if (loading) return <div className="journey-loading">Abrindo sua aula...</div>;
  if (error || !payload) return <div className="practice-empty"><MaterialIcon name="error" /><h2>{error || "Aula indisponível"}</h2><button onClick={onBack}>Voltar para aulas</button></div>;
  const { lesson, state } = payload;
  if (!state.unlocked) return <div className="lesson-player-page"><button className="module-back-button" onClick={onBack}><MaterialIcon name="arrow_back" />{lesson.sectionTitle}</button><section className="lesson-locked-page"><MaterialIcon name="lock" filled /><span className="eyebrow">AULA BLOQUEADA</span><h1>{lesson.title}</h1><p>Conclua o vídeo e os exercícios da aula anterior para liberar este conteúdo.</p><button onClick={onBack}>Voltar para a matéria</button></section></div>;
  const practiceReady = state.videoStatus === "completed" && state.exerciseCount > 0;
  return <div className="lesson-player-page">
    <button className="module-back-button" onClick={onBack}><MaterialIcon name="arrow_back" />{lesson.sectionTitle}</button>
    <div className="lesson-title-block"><span className="eyebrow">{lesson.level} · {lesson.sectionTitle}</span><h1>{lesson.title}</h1><p>{lesson.description || "Assista à videoaula e depois pratique o conteúdo para concluir esta etapa."}</p></div>
    <section className="lesson-video-shell"><div className="lesson-player-video">{selectedVideo ? <video key={selectedVideo.id} ref={videoRef} controls preload="metadata" src={`/api/videos?key=${encodeURIComponent(selectedVideo.videoKey)}`} onLoadedMetadata={() => { const video = videoRef.current; if (video) { video.currentTime = Math.min(selectedVideo.startSeconds + (selectedVideo.savedPosition ?? (selectedVideo.id === 0 ? state.videoPosition : 0)), Math.max(0, video.duration - 1)); lastSavedSecond.current = Math.floor(video.currentTime); } }} onTimeUpdate={handleTimeUpdate} onSeeked={() => void saveVideoProgress()} onPause={() => void saveVideoProgress()} onEnded={() => void saveVideoProgress(true)} /> : <div><MaterialIcon name="movie" /><strong>Sem videoaula nesta etapa</strong><span>Continue pela prática quando ela estiver disponível.</span></div>}</div><aside><span className="eyebrow">AULA {String(lesson.position).padStart(2, "0")}</span><h2>{lesson.title}</h2><div className="lesson-player-meta"><span><MaterialIcon name="schedule" />{lesson.duration}</span><span><MaterialIcon name="school" />{lesson.lessonType}</span></div><p>{lesson.description || lesson.sectionDescription}</p></aside></section>
    {payload.videos.length > 0 && <section className="section-block">{saveError && <p role="alert" className="practice-save-error">{saveError}<button className="outline-button" onClick={() => void saveVideoProgress()}>Tentar salvar</button></p>}<h2>Vídeos desta aula</h2><div className="video-playlist">{payload.videos.map((item, index) => <button className={item.id === selectedVideo?.id ? "outline-button active" : "outline-button"} key={item.id} onClick={async () => { videoRef.current?.pause(); await saveVideoProgress(); setActiveVideo(item.id); }}><MaterialIcon name={item.completed ? "check_circle" : "play_circle"} />{videoLabel(item.title, index)}</button>)}</div></section>}
    <section className="lesson-completion-panel"><div className="lesson-progress-copy"><span className="eyebrow">SEU PROGRESSO</span><h2>Complete as etapas desta aula</h2><p>Finalizar a aula e dominar o conteúdo são conquistas diferentes.</p></div>
      <div className="completion-step"><span className={state.videoStatus === "completed" ? "done" : state.videoStatus === "watching" ? "current" : ""}><MaterialIcon name={state.videoStatus === "completed" ? "check" : "play_arrow"} /></span><div><small>ETAPA 1</small><strong>Videoaula</strong><ProgressBar value={state.videoPercent} /><p>{!payload.videos.length ? "Esta aula não exige vídeo" : state.videoStatus === "completed" ? "Vídeo concluído" : state.videoStatus === "watching" ? `${state.videoPercent}% assistido` : "Ainda não iniciado"}</p></div></div>
      <div className="completion-step"><span className={state.exercisesCompleted ? "done" : practiceReady ? "current" : "locked"}><MaterialIcon name={state.exercisesCompleted ? "check" : practiceReady ? "quiz" : "lock"} /></span><div><small>ETAPA 2</small><strong>Prática desta aula</strong><p>{state.exerciseCount ? `${state.exerciseCount} exercícios · aproximadamente ${Math.max(5, state.exerciseCount * 2)} minutos` : "Esta aula não exige exercícios"}</p>{state.exerciseCount > 0 && <button disabled={!practiceReady} onClick={() => onPractice(lesson.id)}>{state.exercisesCompleted ? "Refazer exercícios" : practiceReady ? "Começar exercícios" : "Conclua o vídeo para liberar"}<MaterialIcon name={practiceReady ? "arrow_forward" : "lock"} /></button>}</div></div>
      {state.completed && <div className="lesson-complete-banner"><MaterialIcon name="verified" filled /><div><strong>Aula finalizada</strong><p>{state.exerciseCount ? `${state.masteryReached ? state.bestPercentage ?? 0 : state.lastPercentage ?? 0}% de domínio · ${state.masteryReached ? "Meta atingida" : "Revisão recomendada"}` : "Etapas obrigatórias concluídas."}</p></div><div className="lesson-complete-actions">{state.reviewRecommended && <button className="outline-button" onClick={() => setReviewOpen((value) => !value)}>{reviewOpen ? "Ocultar revisão" : "Revisar meus erros"}</button>}<button onClick={() => onContinue(payload.nextStep?.href ?? "/jornada")}>Continuar jornada</button></div></div>}
      {reviewOpen && <div className="lesson-review-panel"><h3>Pontos para reforçar</h3>{state.weakSkills.length ? <ul>{state.weakSkills.map((item) => <li key={item.skill}>{skillLabel(item.skill)} — {item.percentage}% de acertos</li>)}</ul> : <p>Esta tentativa antiga não registrou assuntos por habilidade. Refazer a prática permite uma revisão detalhada.</p>}{payload.review.map((item, index) => <article key={index}><strong>{item.prompt}</strong><AnswerComparison answer={item.answer} correct={item.correctAnswer} /><p>{item.explanation}</p></article>)}</div>}
    </section>
  </div>;
}

export function LessonsLibrary({ lessonId, onOpenLesson, onBack, onPracticeLesson, onOpenExam, onContinue }: { lessonId?: number; onOpenLesson: (lessonId: number) => void; onBack: () => void; onPracticeLesson: (lessonId: number) => void; onOpenExam: (sectionId: number) => void; onContinue: (href: string) => void }) {
  const [data, setData] = useState<CourseData>(emptyCourse);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let cancelled = false; fetch("/api/content", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<CourseData> : Promise.reject()).then((content) => { if (!cancelled) setData(content); }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, []);
  const ordered = useMemo(() => orderedCourse(data), [data]);
  if (lessonId) return <div className="library-page page-view course-rails-page"><LessonPage lessonId={lessonId} onBack={onBack} onPractice={onPracticeLesson} onContinue={onContinue} /></div>;
  return <div className="library-page page-view course-rails-page"><section className="lessons-library-hero"><div><span className="eyebrow">BIBLIOTECA DE AULAS</span><h1>Aprenda, pratique e avance.</h1><p>Cada aula tem uma videoaula e exercícios próprios. Conclua as duas etapas para desbloquear o próximo conteúdo.</p></div><div className="lessons-library-icon"><MaterialIcon name="video_library" filled /><span><strong>{ordered.lessons.length}</strong><small>aulas disponíveis</small></span></div></section>{loading ? <div className="journey-loading">Carregando sua trilha...</div> : null}<StudentDashboard compact /><div className="course-rails-intro"><div><span className="eyebrow">CONTEÚDOS</span><h2>Módulos, matérias e aulas</h2></div><p>Os cadeados mostram a progressão acadêmica real. A prova de cada matéria é liberada após todas as aulas.</p></div>{selectedModule === null ? <div className="module-poster-grid">{ordered.modules.map((module, index) => { const state = data.academic?.moduleStates.find(item => item.moduleId === module.id); const key = module.imageMobileKey || module.imageKey; return <button className="module-poster" key={module.id} onClick={() => setSelectedModule(module.id)} aria-label={`Ver módulo ${module.title}`}><div className="module-poster-image">{key ? <img loading="lazy" src={`/api/media?key=${encodeURIComponent(key)}`} alt="" /> : <MaterialIcon name="school" />}<span className="module-poster-number">{String(index + 1).padStart(2, "0")}</span></div><div className="module-poster-copy"><small>{module.level}</small><h3>{module.title}</h3><p>{module.description}</p><ProgressBar value={state?.percent ?? 0} /><span>{state?.completedSections ?? 0} de {state?.sectionCount ?? 0} matérias concluídas</span><strong>{state?.unlocked ? "Explorar módulo" : "Ver conteúdo e requisitos"} <MaterialIcon name={state?.unlocked ? "arrow_forward" : "lock"} /></strong></div></button>; })}</div> : <button className="module-back-button" onClick={() => setSelectedModule(null)}><MaterialIcon name="arrow_back" />Todos os módulos</button>}{ordered.modules.filter(module => module.id === selectedModule).map((courseModule, moduleIndex) => { const sections = ordered.sections.filter((section) => section.moduleId === courseModule.id); const moduleState = data.academic?.moduleStates.find((state) => state.moduleId === courseModule.id); return <section className={`course-level-rail academic-${moduleState?.status ?? "locked"}`} key={courseModule.id}><header className="level-rail-head"><span>{moduleState?.completed ? <MaterialIcon name="check" /> : moduleState?.unlocked ? String(moduleIndex + 1).padStart(2, "0") : <MaterialIcon name="lock" />}</span><div><small>{courseModule.level}</small><h2>{courseModule.title}</h2><p>{courseModule.description}</p></div><aside><strong>{moduleState?.completedSections ?? 0} de {moduleState?.sectionCount ?? sections.length} matérias</strong><small>{moduleState?.completed ? "Módulo concluído" : `${moduleState?.percent ?? 0}% concluído`}</small><ProgressBar value={moduleState?.percent ?? 0} /></aside></header>{sections.map((section) => { const lessons = ordered.lessons.filter((lesson) => lesson.sectionId === section.id); return <CourseSectionRail key={section.id} section={section} lessons={lessons} states={data.academic?.lessonStates ?? []} sectionState={data.academic?.sectionStates.find((state) => state.sectionId === section.id)} onOpenLesson={onOpenLesson} onOpenExam={onOpenExam} />; })}</section>; })}</div>;
}
