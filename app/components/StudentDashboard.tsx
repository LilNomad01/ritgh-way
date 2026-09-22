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
    duration: string | null;
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

  if (error) return <section className="dashboard-error section-block" role="alert"><p>{error}</p><button className="outline-button" onClick={() => { setError(""); setRetry(value => value + 1); }}>Tentar novamente</button></section>;
  if (!data) return <p className="journey-loading">Carregando seu progresso…</p>;

  const resume = data.resume;
  const progressPercent = resume?.started && resume.total > 0 ? Math.min(100, Math.max(0, Math.round(100 * resume.position / resume.total))) : 0;
  const resumeDetail = resume?.started
    ? resume.kind === "practice"
      ? `Prática em andamento · ${resume.position} de ${resume.total} respostas confirmadas`
      : `Vídeo em andamento · retomar em ${minutesAndSeconds(resume.position)}`
    : resume?.description || "Explore as aulas disponíveis e escolha o que estudar agora.";
  const nextModule = data.modules.find(module => module.state?.unlocked && !module.state.completed);
  const overallPercent = data.totalLessons ? Math.round(100 * data.completedLessons / data.totalLessons) : 0;
  const nextActionLabel = resume?.kind === "exam" ? "Abrir avaliação" : resume?.kind === "review" ? "Revisar meus pontos fracos" : resume?.kind === "complete" ? "Ver jornada" : resume?.kind === "pending" ? "Revisar aulas concluídas" : resume?.started ? "Continuar de onde parei" : resume?.kind === "practice" ? "Continuar prática" : "Começar próxima aula";
  const artwork = resume?.imageKey ?? nextModule?.imageKey;
  const mobileArtwork = resume?.imageMobileKey ?? nextModule?.imageMobileKey;

  const hero = <section className={`dashboard-hero${compact ? " dashboard-hero-compact" : ""}`} aria-label={resume?.started ? "Continue de onde parou" : "Seu próximo passo"}>
    <div className="dashboard-hero-copy">
      <div className="dashboard-hero-kicker"><span className="eyebrow">{resume?.started ? "CONTINUE DE ONDE PAROU" : "SEU PRÓXIMO PASSO"}</span><span className="dashboard-hero-kind"><MaterialIcon name={resume?.kind === "exam" ? "assignment" : resume?.kind === "review" ? "rate_review" : resume?.kind === "practice" ? "edit_note" : "play_circle"} />{resume?.kind === "exam" ? "Prova" : resume?.kind === "review" ? "Revisão" : resume?.kind === "practice" ? "Prática" : "Aula"}</span></div>
      {resume && <p className="dashboard-hero-path">{resume.moduleTitle} <span>·</span> {resume.sectionTitle}</p>}
      <h2>{resume?.title ?? "Tudo pronto para continuar"}</h2>
      <p className="dashboard-hero-description">{resumeDetail}</p>
      <div className="dashboard-hero-facts"><span><MaterialIcon name="menu_book" />{nextModule?.title ?? resume?.moduleTitle ?? "Trilha de inglês"}</span>{resume?.kind === "video" && resume.duration && <span><MaterialIcon name="schedule" />{resume.duration}</span>}</div>
      {resume?.started && resume.total > 0 && <div className="dashboard-hero-activity"><div><span>Atividade em andamento</span><strong>{progressPercent}%</strong></div><div className="dashboard-hero-progress" role="progressbar" aria-label="Progresso desta atividade" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progressPercent}%` }} /></div></div>}
      <button className="primary-button dashboard-hero-button" onClick={() => router.push(resume?.href ?? "/aulas")}>{resume ? nextActionLabel : "Explorar aulas"}<MaterialIcon name="arrow_forward" /></button>
    </div>
    {!compact && <div className="dashboard-hero-visual" aria-hidden="true">
      {artwork ? <picture>{mobileArtwork && <source media="(max-width: 720px)" srcSet={`/api/media?key=${encodeURIComponent(mobileArtwork)}`} />}<img src={`/api/media?key=${encodeURIComponent(artwork)}`} alt="" /></picture> : <div className="dashboard-hero-brand"><img src="/right-way-brand-optimized.jpg" alt="" /></div>}
      <div className="dashboard-hero-visual-caption"><span>PROGRESSO GERAL</span><strong>{overallPercent}%</strong><small>{data.completedLessons} de {data.totalLessons} aulas concluídas</small><div className="dashboard-hero-progress"><span style={{ width: `${overallPercent}%` }} /></div></div>
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
      <section className="dashboard-overview" aria-label="Seu progresso registrado">
        <div className="dashboard-overview-heading"><div><span className="eyebrow">EM RESUMO</span><h2>Seu progresso até aqui</h2></div><span>Atualizado com suas atividades</span></div>
        <div className="stats-grid dashboard-stats">{stats.map(stat => <article className="stat-card" key={stat.label}><span className={`stat-icon ${stat.color}`}><MaterialIcon name={stat.icon} /></span><div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.hint}</p></div></article>)}</div>
      </section>
      <section className="section-block dashboard-journey">
        <div className="section-heading"><div><span className="eyebrow">SUA JORNADA</span><h2>Onde você está na trilha</h2></div><button onClick={() => router.push("/jornada")}>Ver jornada completa <MaterialIcon name="arrow_forward" /></button></div>
        {data.modules.length ? <div className="journey-list">{data.modules.slice(0, 4).map((module, index) => {
          const state = module.state;
          const status = state?.completed ? "complete" : state?.unlocked ? "current" : "locked";
          return <div className={`journey-item ${status}`} key={module.id}><span className="step-dot"><MaterialIcon name={state?.completed ? "check" : state?.unlocked ? "play_arrow" : "lock"} /></span><div><small>MÓDULO {String(index + 1).padStart(2, "0")} · {module.level.toUpperCase()}</small><h3>{module.title}</h3><p>{state?.completedSections ?? 0} de {state?.sectionCount ?? 0} matérias · {state?.completed ? "Concluído" : state?.unlocked ? "Disponível" : "Bloqueado"}</p><div className="dashboard-journey-row-progress"><span style={{ width: `${state?.percent ?? 0}%` }} /></div></div><span className={state?.completed ? "grade" : "percent"}>{state?.percent ?? 0}%</span></div>;
        })}</div> : <p className="dashboard-empty-course">Os módulos aparecerão aqui assim que forem publicados.</p>}
      </section>
    </div>
    <aside className="right-column dashboard-side" aria-label="Atalhos e progresso">
      <section className="dashboard-focus-card"><div className="dashboard-side-heading"><span className="dashboard-side-icon"><MaterialIcon name="route" /></span><span>SEU FOCO AGORA</span></div><strong>{nextModule?.title ?? "Sua trilha de inglês"}</strong><p>{nextModule ? `${nextModule.level} · ${nextModule.state?.completedSections ?? 0} de ${nextModule.state?.sectionCount ?? 0} matérias concluídas` : "Explore o conteúdo disponível e continue no seu ritmo."}</p><div className="dashboard-focus-progress"><div><span>Progresso do módulo</span><strong>{nextModule?.state?.percent ?? 0}%</strong></div><div className="dashboard-side-progress" role="progressbar" aria-label="Progresso do módulo atual" aria-valuenow={nextModule?.state?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${nextModule?.state?.percent ?? 0}%` }} /></div></div><button className="dashboard-focus-action" onClick={() => router.push(resume?.href ?? "/aulas")}>{resume ? nextActionLabel : "Ver aulas"}<MaterialIcon name="arrow_forward" /></button><div className="dashboard-focus-coach"><span className="coach-avatar">M</span><div><small>DICA DA MAYA</small><p>Ouça com atenção, escreva e revise a correção para fixar o que aprendeu.</p></div></div><button className="dashboard-review-link" onClick={() => router.push("/praticar")}><MaterialIcon name="history_edu" />Revisar minhas respostas<MaterialIcon name="arrow_forward" /></button></section>
    </aside>
  </div>;
}
