"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Artwork, CourseModule, CourseSection } from "../lib/course";
import { MaterialIcon } from "./MaterialIcon";

export type PracticeSummary = Artwork & {
  id: number;
  sectionId: number;
  title: string;
  duration: string;
  lessonType: string;
  level: string;
  moduleTitle: string;
  sectionTitle: string;
  exerciseCount: number;
  estimatedMinutes: number;
  skills: string[];
  bestScore?: number;
  lastScore?: number;
  lastTotal?: number;
  attemptsCount?: number;
  currentIndex?: number;
  sessionStatus?: "active" | "completed";
};

type PracticeData = { modules: CourseModule[]; sections: CourseSection[]; practices: PracticeSummary[] };
const emptyData: PracticeData = { modules: [], sections: [], practices: [] };

function PracticeArtwork({ practice }: { practice: PracticeSummary }) {
  const desktopKey = practice.imageKey ?? practice.imageMobileKey;
  return <div className="practice-card-art">{desktopKey ? <picture>{practice.imageMobileKey && <source media="(max-width: 720px)" srcSet={`/api/media?key=${encodeURIComponent(practice.imageMobileKey)}`} />}<img src={`/api/media?key=${encodeURIComponent(desktopKey)}`} alt="" style={{ objectFit: practice.imageFit ?? "cover", objectPosition: `${practice.imagePositionX ?? 50}% ${practice.imagePositionY ?? 50}%`, transform: `scale(${(practice.imageZoom ?? 100) / 100})` }} /></picture> : <div><MaterialIcon name="target" /><span>RIGHT WAY PRACTICE</span></div>}<i style={{ opacity: (practice.imageOverlay ?? 20) / 100 }} /></div>;
}

function PracticeCard({ practice, onOpen }: { practice: PracticeSummary; onOpen: () => void }) {
  const percentage = practice.lastTotal ? Math.round(((practice.lastScore ?? 0) / practice.lastTotal) * 100) : 0;
  return <article className="practice-card"><PracticeArtwork practice={practice} /><div className="practice-card-copy"><span className="practice-level">{practice.level} · {practice.sectionTitle}</span><h4>{practice.title}</h4><div className="practice-card-facts"><span><MaterialIcon name="quiz" />{practice.exerciseCount} exercícios</span><span><MaterialIcon name="schedule" />{practice.estimatedMinutes} min</span></div>{practice.attemptsCount ? <div className="practice-result"><span>Último resultado</span><strong>{practice.lastScore}/{practice.lastTotal} · {percentage}%</strong></div> : <div className="practice-result new"><span>Prática nova</span><strong>Comece quando quiser</strong></div>}<button onClick={onOpen}>Ver prática <MaterialIcon name="arrow_forward" /></button></div></article>;
}

function PracticeRail({ title, practices, onOpen }: { title: string; practices: PracticeSummary[]; onOpen: (id: number) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  return <section className="practice-section-rail"><header><div><h3>{title}</h3><p>{practices.length} práticas disponíveis</p></div><div className="rail-controls"><button onClick={() => railRef.current?.scrollBy({ left: -330, behavior: "smooth" })} aria-label="Práticas anteriores"><MaterialIcon name="chevron_left" /></button><button onClick={() => railRef.current?.scrollBy({ left: 330, behavior: "smooth" })} aria-label="Próximas práticas"><MaterialIcon name="chevron_right" /></button></div></header><div className="practice-card-rail" ref={railRef}>{practices.map((practice) => <PracticeCard key={practice.id} practice={practice} onOpen={() => onOpen(practice.id)} />)}</div></section>;
}

function PracticeDetail({ practice, onBack, onStart }: { practice: PracticeSummary; onBack: () => void; onStart: () => void }) {
  const bestTotal = practice.lastTotal || practice.exerciseCount;
  return <div className="practice-detail-page"><button className="module-back-button" onClick={onBack}><MaterialIcon name="arrow_back" />Voltar para Praticar</button><section className="practice-detail-hero"><PracticeArtwork practice={practice} /><div className="practice-detail-copy"><span className="eyebrow">{practice.level} · {practice.sectionTitle}</span><h1>{practice.title}</h1><p>Pratique os principais conteúdos estudados nesta aula e fortaleça o que aprendeu.</p><div className="practice-detail-facts"><span><MaterialIcon name="quiz" /><strong>{practice.exerciseCount}</strong><small>exercícios</small></span><span><MaterialIcon name="schedule" /><strong>{practice.estimatedMinutes}</strong><small>minutos</small></span><span><MaterialIcon name="bolt" /><strong>{practice.exerciseCount * 20}</strong><small>XP possíveis</small></span></div><button className="primary-button icon-button" onClick={onStart}>{practice.sessionStatus === "active" ? "Continuar prática" : practice.attemptsCount ? "Praticar novamente" : "Começar prática"}<MaterialIcon name="arrow_forward" /></button></div></section><div className="practice-detail-grid"><section><span className="eyebrow">HABILIDADES</span><h2>O que você vai treinar</h2><div className="practice-skills">{practice.skills.map((skill) => <span key={skill}><MaterialIcon name={skill.toLowerCase().includes("listening") ? "headphones" : skill.toLowerCase().includes("gram") ? "spellcheck" : skill.toLowerCase().includes("speaking") ? "record_voice_over" : "psychology"} />{skill}</span>)}</div></section><section><span className="eyebrow">SEU HISTÓRICO</span><h2>{practice.attemptsCount ? "Resultados anteriores" : "Sua primeira tentativa"}</h2>{practice.attemptsCount ? <div className="practice-history"><div><small>MELHOR RESULTADO</small><strong>{practice.bestScore}/{bestTotal}</strong></div><div><small>ÚLTIMA TENTATIVA</small><strong>{practice.lastScore}/{practice.lastTotal}</strong></div><p><MaterialIcon name="history" />{practice.attemptsCount} {practice.attemptsCount === 1 ? "tentativa realizada" : "tentativas realizadas"}</p></div> : <p className="practice-first-copy">Você ainda não realizou esta prática. Reserve alguns minutos e teste seu conhecimento sem pressa.</p>}</section></div></div>;
}

export function PracticeHub({ lessonId, onOpenDetail, onStartSession, onBackToHub }: { lessonId?: number; onOpenDetail: (lessonId: number) => void; onStartSession: (lessonId: number) => void; onBackToHub: () => void }) {
  const [data, setData] = useState<PracticeData>(emptyData);
  const [detail, setDetail] = useState<PracticeSummary | null>(null);
  const [filter, setFilter] = useState("Todos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const endpoint = lessonId ? `/api/practices/${lessonId}` : "/api/practices";
    fetch(endpoint).then((response) => response.ok ? response.json() : Promise.reject()).then((result) => {
      if (cancelled) return;
      if (lessonId) setDetail(result.practice ?? null);
      else setData(result);
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lessonId]);

  const levels = ["Todos", ...Array.from(new Set(data.modules.map((courseModule) => courseModule.level)))];
  const visibleModules = useMemo(() => data.modules.filter((courseModule) => filter === "Todos" || courseModule.level === filter), [data.modules, filter]);
  const continuePractice = data.practices.find((practice) => practice.sessionStatus === "active") ?? data.practices.find((practice) => (practice.attemptsCount ?? 0) > 0);

  if (loading) return <div className="page-view practice-page"><div className="journey-loading">Preparando suas práticas...</div></div>;
  if (lessonId && detail) return <div className="page-view practice-page"><PracticeDetail practice={detail} onBack={onBackToHub} onStart={() => onStartSession(detail.id)} /></div>;

  return <div className="page-view practice-page"><section className="practice-hero"><div><span className="eyebrow">PRATICAR</span><h1>Transforme conteúdo em confiança.</h1><p>Escolha o que quer exercitar. Nenhuma questão começa antes de você decidir.</p></div><div className="practice-hero-mark"><MaterialIcon name="target" filled /><span><strong>{data.practices.length}</strong><small>práticas disponíveis</small></span></div></section>
    {continuePractice ? <section className="continue-practice-card"><PracticeArtwork practice={continuePractice} /><div><span className="eyebrow">CONTINUE PRATICANDO</span><h2>{continuePractice.title}</h2><p>{continuePractice.sessionStatus === "active" ? `${continuePractice.currentIndex ?? 0} de ${continuePractice.exerciseCount} exercícios` : `Último resultado: ${continuePractice.lastScore}/${continuePractice.lastTotal}`}</p><button onClick={() => continuePractice.sessionStatus === "active" ? onStartSession(continuePractice.id) : onOpenDetail(continuePractice.id)}>{continuePractice.sessionStatus === "active" ? "Continuar" : "Praticar novamente"}<MaterialIcon name="arrow_forward" /></button></div></section> : null}
    <div className="practice-toolbar"><div><span className="eyebrow">BIBLIOTECA DE PRÁTICAS</span><h2>Escolha um conteúdo</h2></div><div className="practice-filters">{levels.map((level) => <button className={filter === level ? "active" : ""} onClick={() => setFilter(level)} key={level}>{level}</button>)}</div></div>
    <div className="practice-levels">{visibleModules.map((courseModule) => {
      const sections = data.sections.filter((section) => section.moduleId === courseModule.id);
      const sectionIds = new Set(sections.map((section) => section.id));
      const practices = data.practices.filter((practice) => sectionIds.has(practice.sectionId));
      if (!practices.length) return null;
      return <section className="practice-level-block" key={courseModule.id}><header><span>{courseModule.level}</span><div><h2>{courseModule.title}</h2><p>{courseModule.description}</p></div><b>{practices.length} práticas</b></header>{sections.map((section) => { const sectionPractices = practices.filter((practice) => practice.sectionId === section.id); return sectionPractices.length ? <PracticeRail key={section.id} title={section.title} practices={sectionPractices} onOpen={onOpenDetail} /> : null; })}</section>;
    })}</div>
    {!data.practices.length ? <div className="practice-empty"><MaterialIcon name="hourglass_top" /><h2>Práticas em preparação</h2><p>Assim que os exercícios forem publicados pelo professor, eles aparecerão aqui.</p></div> : null}
  </div>;
}
