"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaterialIcon } from "./MaterialIcon";

type CourseModule = {
  id: number;
  title: string;
  level: string;
  state?: { unlocked: boolean; completed: boolean; completedSections: number; sectionCount: number; percent: number };
  imageKey: string | null;
  imageMobileKey: string | null;
};

type Summary = {
  completedLessons: number;
  totalLessons: number;
  practiceAttempts: number;
  accuracy: number | null;
  examAttempts: number;
  examAverage: number | null;
  modules: CourseModule[];
  resume: null | {
    title: string;
    description: string;
    sectionTitle: string;
    moduleTitle: string;
    imageKey: string | null;
    imageMobileKey: string | null;
    started: boolean;
    kind: string;
    position: number;
    total: number;
    href: string;
  };
};

function minutesAndSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function StudentDashboard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/dashboard", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Seu progresso está indisponível no momento.");
        return response.json() as Promise<Summary>;
      })
      .then(setData)
      .catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [retry]);

  if (error) return <section className="dashboard-error section-block" role="alert"><p>{error}</p><button className="outline-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></section>;
  if (!data) return <p className="journey-loading">Carregando seu progresso…</p>;

  const resume = data.resume;
  const progressPercent = resume?.started && resume.total > 0 ? Math.min(100, Math.max(0, Math.round(100 * resume.position / resume.total))) : 0;
  const resumeDetail = resume?.started
    ? resume.kind === "practice"
      ? `Prática em andamento · ${resume.position} de ${resume.total} respostas confirmadas`
      : `Vídeo em andamento · retomar em ${minutesAndSeconds(resume.position)}`
    : resume?.description || "Explore as aulas disponíveis e escolha o que estudar agora.";
  const nextModule = data.modules.find(module => module.state?.unlocked && !module.state.completed);
  const artwork = resume?.imageKey ?? nextModule?.imageKey;
  const mobileArtwork = resume?.imageMobileKey ?? nextModule?.imageMobileKey;

  const hero = <section className={`dashboard-hero${compact ? " dashboard-hero-compact" : ""}`} aria-label={resume?.started ? "Continue de onde parou" : "Seu próximo passo"}>
    <div className="dashboard-hero-copy">
      <span className="eyebrow">{resume?.started ? "CONTINUE DE ONDE PAROU" : "SEU PRÓXIMO PASSO"}</span>
      {resume && <p className="dashboard-hero-path">{resume.moduleTitle} <span>·</span> {resume.sectionTitle}</p>}
      <h2>{resume?.title ?? "Tudo pronto para continuar"}</h2>
      <p className="dashboard-hero-description">{resumeDetail}</p>
      {resume?.started && resume.total > 0 && <div className="dashboard-hero-progress" role="progressbar" aria-label="Progresso desta atividade" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progressPercent}%` }} /></div>}
      <button className="primary-button dashboard-hero-button" onClick={() => router.push(resume?.href ?? "/aulas")}>{resume?.started ? "Continuar de onde parei" : "Explorar aulas"}<MaterialIcon name="arrow_forward" /></button>
    </div>
    {!compact && <div className="dashboard-hero-visual" aria-hidden="true">
      {artwork ? <picture>{mobileArtwork && <source media="(max-width: 720px)" srcSet={`/api/media?key=${encodeURIComponent(mobileArtwork)}`} />}<img src={`/api/media?key=${encodeURIComponent(artwork)}`} alt="" /></picture> : <div className="dashboard-hero-brand"><img src="/right-way-brand-optimized.jpg" alt="" /></div>}
      <div className="dashboard-hero-visual-caption"><MaterialIcon name={resume?.kind === "practice" ? "edit_note" : "play_circle"} /><span>{resume?.started ? "Seu progresso foi salvo" : "Sua jornada começa aqui"}</span></div>
    </div>}
  </section>;

  if (compact) return <div className="real-dashboard compact">{hero}</div>;

  const stats = [
    { icon: "school", color: "red", label: "AULAS CONCLUÍDAS", value: `${data.completedLessons} / ${data.totalLessons}`, hint: "Vídeos e práticas finalizados" },
    { icon: "edit_note", color: "blue", label: "RESPOSTAS ENVIADAS", value: String(data.practiceAttempts), hint: "Tentativas registradas" },
    { icon: "task_alt", color: "green", label: "ACERTOS", value: data.accuracy === null ? "—" : `${data.accuracy}%`, hint: data.accuracy === null ? "Faça a primeira prática" : "Média das práticas" },
    { icon: "assignment_turned_in", color: "gold", label: "PROVAS", value: data.examAverage === null ? "—" : `${data.examAverage}%`, hint: data.examAttempts ? `Média de ${data.examAttempts} ${data.examAttempts === 1 ? "prova" : "provas"}` : "Nenhuma prova realizada" },
  ];

  return <div className="content-grid dashboard-home">
    <div className="primary-column">
      {hero}
      <section className="stats-grid dashboard-stats" aria-label="Seu progresso registrado">
        {stats.map(stat => <article className="stat-card" key={stat.label}><span className={`stat-icon ${stat.color}`}><MaterialIcon name={stat.icon} /></span><div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.hint}</p></div></article>)}
      </section>
      <section className="section-block dashboard-journey">
        <div className="section-heading"><div><span className="eyebrow">SUA JORNADA</span><h2>Inglês para a vida real</h2></div><button onClick={() => router.push("/aulas")}>Ver todas as aulas <MaterialIcon name="arrow_forward" /></button></div>
        {data.modules.length ? <div className="journey-list">{data.modules.slice(0, 4).map((module, index) => {
          const state = module.state;
          const status = state?.completed ? "complete" : state?.unlocked ? "current" : "locked";
          return <div className={`journey-item ${status}`} key={module.id}><span className="step-dot"><MaterialIcon name={state?.completed ? "check" : state?.unlocked ? "play_arrow" : "lock"} /></span><div><small>MÓDULO {String(index + 1).padStart(2, "0")} · {module.level.toUpperCase()}</small><h3>{module.title}</h3><p>{state?.completedSections ?? 0} de {state?.sectionCount ?? 0} matérias concluídas</p></div><span className={state?.completed ? "grade" : "percent"}>{state?.percent ?? 0}%</span></div>;
        })}</div> : <p className="dashboard-empty-course">Os módulos aparecerão aqui assim que forem publicados.</p>}
      </section>
    </div>
    <aside className="right-column dashboard-side" aria-label="Atalhos e progresso">
      <section className="coach-card dashboard-coach"><div className="coach-top"><div className="coach-avatar">M</div><div><small>SUA PROFESSORA VIRTUAL</small><strong>Maya</strong></div></div><p>Uma dica para hoje: ouça, escreva e compare sua resposta com a correção. É assim que você percebe onde pode melhorar.</p><button onClick={() => router.push("/praticar")}>Praticar agora <MaterialIcon name="arrow_forward" /></button></section>
      <section className="week-card dashboard-progress-card"><div className="dashboard-side-heading"><span className="dashboard-side-icon"><MaterialIcon name="trending_up" /></span><span>SEU PROGRESSO</span></div><strong>{data.completedLessons} de {data.totalLessons} aulas</strong><p>concluídas na sua conta</p><div className="dashboard-side-progress" role="progressbar" aria-label="Aulas concluídas" aria-valuenow={data.completedLessons} aria-valuemin={0} aria-valuemax={data.totalLessons || 1}><span style={{ width: `${data.totalLessons ? Math.round(100 * data.completedLessons / data.totalLessons) : 0}%` }} /></div><small>{data.totalLessons ? `${Math.round(100 * data.completedLessons / data.totalLessons)}% do conteúdo disponível` : "Aguardando aulas publicadas"}</small></section>
      {nextModule && <section className="ranking-card dashboard-module-card"><div className="dashboard-side-heading"><span className="dashboard-side-icon"><MaterialIcon name="menu_book" /></span><span>MÓDULO ATUAL</span></div><strong>{nextModule.title}</strong><p>{nextModule.level} · {nextModule.state?.completedSections ?? 0} de {nextModule.state?.sectionCount ?? 0} matérias concluídas</p><button onClick={() => router.push("/aulas")}>Explorar módulo <MaterialIcon name="arrow_forward" /></button></section>}
      <button className="daily-card dashboard-quick" onClick={() => router.push("/praticar")}><span><MaterialIcon name="bolt" /></span><div><small>UM PASSO DE CADA VEZ</small><strong>Revisar minhas respostas</strong></div><MaterialIcon name="arrow_forward" /></button>
    </aside>
  </div>;
}
