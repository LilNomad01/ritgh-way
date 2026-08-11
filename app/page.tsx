"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPanel } from "./components/AdminPanel";
import { ExercisePlayer } from "./components/ExercisePlayer";
import { JourneyView } from "./components/JourneyView";
import { LessonsLibrary } from "./components/LessonsLibrary";
import { MaterialIcon } from "./components/MaterialIcon";
import { Onboarding } from "./components/Onboarding";
import { PasswordChange } from "./components/PasswordChange";
import { PracticeHub } from "./components/PracticeHub";

type Profile = { fullName: string; email: string; level: string; placementScore: number; goal?: string; dailyMinutes?: number; role?: "admin" | "student"; mustChangePassword?: boolean };

const navItems = [
  { label: "Início", icon: "home" },
  { label: "Aulas", icon: "play_circle" },
  { label: "Jornada", icon: "route" },
  { label: "Praticar", icon: "target" },
  { label: "Conquistas", icon: "workspace_premium" },
];

const week = [
  { day: "S", done: true }, { day: "T", done: true }, { day: "Q", done: true },
  { day: "Q", done: true }, { day: "S", done: true }, { day: "S", done: false }, { day: "D", done: false },
];

const demoProfile: Profile = { fullName: "Alex Martins", email: "alex@rightway.com", level: "Intermediário", placementScore: 6 };

function Dashboard({ onContinueLesson, onPractice, onNavigate }: { onContinueLesson: () => void; onPractice: () => void; onNavigate: (view: string) => void }) {
  return (
    <div className="content-grid">
      <div className="primary-column">
        <section className="continue-card">
          <div className="card-content"><span className="eyebrow">CONTINUE DE ONDE PAROU</span><p className="lesson-meta">Módulo 02 · Aula 07</p><h2>At the coffee shop</h2><p className="lesson-copy">Peça seu café com confiança e pratique expressões que você realmente vai usar.</p><div className="progress-row"><div className="progress-track"><span style={{ width: "68%" }} /></div><strong>68%</strong></div><button className="primary-button" onClick={onContinueLesson}>Continuar aula <span>→</span></button></div>
          <div className="lesson-visual" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="cup"><span /></div><div className="phrase-card"><small>TRY SAYING</small><strong>“Could I have a latte?”</strong><div><i /><i /><i /><i /><i /></div></div><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span></div>
        </section>

        <section className="stats-grid" aria-label="Resumo de progresso">
          <article className="stat-card"><span className="stat-icon red">🔥</span><div><small>SEQUÊNCIA</small><strong>5 dias</strong><p>Seu recorde: 12</p></div></article>
          <article className="stat-card"><span className="stat-icon blue">✦</span><div><small>XP TOTAL</small><strong>1.840</strong><p><b>+120</b> esta semana</p></div></article>
          <article className="stat-card"><span className="stat-icon gold">◷</span><div><small>TEMPO ESTUDADO</small><strong>24h 30m</strong><p>+2h esta semana</p></div></article>
          <article className="stat-card"><span className="stat-icon green">✓</span><div><small>NOTA MÉDIA</small><strong>9,2</strong><p>Excelente desempenho</p></div></article>
        </section>

        <section className="section-block journey-section"><div className="section-heading"><div><span className="eyebrow">SUA JORNADA</span><h2>Inglês para a vida real</h2></div><button onClick={() => onNavigate("Aulas")}>Ver todas as aulas <span>→</span></button></div><div className="journey-list"><article className="journey-item complete"><span className="step-dot">✓</span><div><small>MÓDULO 01</small><h3>Everyday foundations</h3><p>12 aulas · Concluído</p></div><span className="grade">Nota 9,4</span></article><article className="journey-item current"><span className="step-dot">02</span><div><small>VOCÊ ESTÁ AQUI</small><h3>Real conversations</h3><p>7 de 12 aulas concluídas</p><div className="mini-progress"><span /></div></div><span className="percent">58%</span></article><article className="journey-item locked"><span className="step-dot">03</span><div><small>PRÓXIMO</small><h3>Confident communication</h3><p>12 aulas · Bloqueado</p></div><span>◉</span></article></div></section>
      </div>

      <aside className="right-column">
        <section className="coach-card"><div className="coach-top"><div className="coach-avatar">M<span>✦</span></div><div><small>SUA PROFESSORA VIRTUAL</small><strong>Maya</strong></div><span className="online-dot" /></div><blockquote>“Cinco dias seguidos! Hoje vamos transformar vocabulário em conversa de verdade.”</blockquote><button onClick={onPractice}>Praticar com Maya <span>→</span></button></section>
        <section className="week-card"><div className="week-title"><div><small>META SEMANAL</small><h3>5 de 7 dias</h3></div><span>72%</span></div><div className="week-days">{week.map((item, index) => <div key={index}><span className={item.done ? "done" : ""}>{item.done ? "✓" : index + 1}</span><small>{item.day}</small></div>)}</div><p>Mais <strong>2 dias</strong> para bater sua meta.</p></section>
        <section className="ranking-card"><div className="ranking-head"><div><small>RANKING PESSOAL</small><h3>Você subiu 3 posições</h3></div><span>↗</span></div><div className="ranking-position"><span>#</span><strong>18</strong><small>entre 842 alunos</small></div><div className="ranking-bar"><span /></div><p>Você está no <strong>top 3%</strong> esta semana.</p></section>
        <section className="daily-card"><span>✦</span><div><small>DESAFIO RÁPIDO</small><strong>5 exercícios variados</strong></div><button onClick={onPractice} aria-label="Abrir desafio">→</button></section>
      </aside>
    </div>
  );
}

function Achievements() {
  const items = [{ icon: "🔥", title: "Em chamas", text: "5 dias seguidos", earned: true }, { icon: "★", title: "Primeiros 1.000 XP", text: "Meta superada", earned: true }, { icon: "☕", title: "Coffee master", text: "Conclua Coffee shop", earned: false }, { icon: "◈", title: "Sem legendas", text: "Complete 10 listenings", earned: false }, { icon: "✓", title: "Nota máxima", text: "Acerte uma prática inteira", earned: true }, { icon: "◇", title: "Imparável", text: "30 dias de sequência", earned: false }];
  return <div className="achievements-page page-view"><div className="page-hero achievements-hero"><div><span className="eyebrow">SUAS CONQUISTAS</span><h1>Cada passo merece ser celebrado.</h1><p>3 de 12 medalhas conquistadas · Continue avançando.</p></div><div className="trophy">★<span>3</span></div></div><div className="achievement-grid">{items.map((item) => <article className={item.earned ? "earned" : "locked"} key={item.title}><span>{item.icon}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><b>{item.earned ? "Conquistada" : "Bloqueada"}</b></article>)}</div></div>;
}

type AppView = "Início" | "Aulas" | "Jornada" | "Praticar" | "Conquistas";

export function RightWayApp({ adminEntry = false, initialView = "Início", practiceLessonId, practiceSession = false }: { adminEntry?: boolean; initialView?: AppView; practiceLessonId?: number; practiceSession?: boolean }) {
  const router = useRouter();
  const [dark, setDark] = useState(() => typeof window !== "undefined" && localStorage.getItem("rightway-theme") === "dark");
  const [active, setActive] = useState<string>(adminEntry ? "Admin" : initialView);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [profile, setProfile] = useState<Profile>(demoProfile);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("anonymous");
      const result = await response.json() as { profile: Profile };
      setProfile(result.profile);
      setShowOnboarding(false);
      setActive(result.profile.role === "admin" && adminEntry ? "Admin" : initialView);
    }).catch(() => setShowOnboarding(true)).finally(() => setCheckingSession(false));
  }, [adminEntry, initialView]);

  function toggleTheme() {
    setDark((value) => { localStorage.setItem("rightway-theme", value ? "light" : "dark"); return !value; });
  }

  function selectNav(label: string) {
    setMobileMenuOpen(false);
    const destinations: Record<string, string> = { Início: "/", Aulas: "/aulas", Jornada: "/jornada", Praticar: "/praticar", Conquistas: "/conquistas", Admin: "/admin" };
    router.push(destinations[label] ?? "/");
  }

  function finishOnboarding(nextProfile: Profile) {
    setProfile(nextProfile);
    setShowOnboarding(false);
    setActive(nextProfile.role === "admin" ? "Admin" : "Início");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setShowOnboarding(true);
    setActive("Início");
  }

  if (checkingSession) return <div className="app-loading"><div className="brand-icon"><img src="/right-way-brand.png" alt="" /></div><strong>RIGHT WAY</strong><span /></div>;
  if (showOnboarding) return <Onboarding onComplete={finishOnboarding} initialStep={adminEntry ? "login" : "home"} />;

  const firstName = profile.fullName.split(" ")[0] || "Aluno";
  const initials = profile.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className={dark ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><img src="/right-way-brand.png" alt="" /></div><div><span>RIGHT WAY</span><small>ONLINE</small></div></div>
        <nav className="side-nav"><p>SEU ESPAÇO</p>{navItems.map((item) => <button key={item.label} className={active === item.label ? "nav-item active" : "nav-item"} onClick={() => selectNav(item.label)}><MaterialIcon name={item.icon} filled={active === item.label} />{item.label}</button>)}{profile.role === "admin" && <><p className="nav-section">GESTÃO SEGURA</p><button className={active === "Admin" ? "nav-item active admin-nav" : "nav-item admin-nav"} onClick={() => selectNav("Admin")}><MaterialIcon name="admin_panel_settings" filled={active === "Admin"} />Painel admin</button></>}</nav>
        <div className="side-footer"><div className="plan-row"><span className="mini-avatar">{initials}</span><div><strong>{profile.fullName}</strong><small>{profile.role === "admin" ? "Administrador raiz" : `Plano ${profile.level}`}</small></div><button onClick={logout} aria-label="Sair da conta">↪</button></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="mobile-brand"><button className="mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu" aria-expanded={mobileMenuOpen}><MaterialIcon name="menu" /></button><div className="brand-icon" aria-hidden="true"><img src="/right-way-brand.png" alt="" /></div><div><strong>RIGHT WAY</strong><small>{active}</small></div></div><div className="greeting"><p>DOMINGO, 2 DE AGOSTO</p><h1>{active === "Início" ? `Bom dia, ${firstName}!` : active} <span aria-hidden="true">{active === "Início" ? "👋" : ""}</span></h1></div><div className="top-actions"><button className="streak-pill" aria-label="Sequência de cinco dias"><MaterialIcon name="local_fire_department" filled /><strong>5</strong><small>dias</small></button><button className="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema"><MaterialIcon name={dark ? "light_mode" : "dark_mode"} /></button><button className="avatar" onClick={() => profile.role === "admin" && selectNav("Admin")} aria-label={profile.role === "admin" ? "Abrir painel administrativo" : "Perfil do aluno"}>{initials}<span /></button></div></header>

        {active === "Início" && <Dashboard onContinueLesson={() => router.push("/aulas")} onPractice={() => router.push("/praticar")} onNavigate={selectNav} />}
        {active === "Aulas" && <LessonsLibrary onPracticeLesson={(lessonId) => router.push(`/praticar/${lessonId}`)} />}
        {active === "Jornada" && <JourneyView onContinue={() => router.push("/aulas")} />}
        {active === "Praticar" && <PracticeHub lessonId={practiceLessonId} onOpenDetail={(lessonId) => router.push(`/praticar/${lessonId}`)} onStartSession={(lessonId) => router.push(`/praticar/${lessonId}/sessao`)} onBackToHub={() => router.push("/praticar")} />}
        {active === "Conquistas" && <Achievements />}
        {active === "Admin" && profile.role === "admin" && <><div className="admin-security-banner"><MaterialIcon name="verified_user" filled /><div><strong>Sessão administrativa protegida</strong><small>JWT de curta duração, cookie HTTP-only e renovação segura.</small></div>{profile.mustChangePassword && <button onClick={() => setPasswordChangeOpen(true)}>Trocar senha inicial</button>}</div><AdminPanel /></>}
      </section>

      {mobileMenuOpen && <div className="mobile-menu-layer" role="presentation" onClick={() => setMobileMenuOpen(false)}>
        <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu de navegação" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-drawer-head"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><img src="/right-way-brand.png" alt="" /></div><div><span>RIGHT WAY</span><small>ONLINE</small></div></div><button onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><MaterialIcon name="close" /></button></div>
          <nav>{navItems.map((item) => <button key={item.label} className={active === item.label ? "active" : ""} onClick={() => selectNav(item.label)}><MaterialIcon name={item.icon} filled={active === item.label} /><span>{item.label}</span><MaterialIcon name="chevron_right" /></button>)}{profile.role === "admin" && <button className={active === "Admin" ? "active admin" : "admin"} onClick={() => selectNav("Admin")}><MaterialIcon name="admin_panel_settings" filled /><span>Painel admin</span><MaterialIcon name="chevron_right" /></button>}</nav>
          <div className="mobile-drawer-account"><span>{initials}</span><div><strong>{profile.fullName}</strong><small>{profile.role === "admin" ? "Administrador raiz" : profile.level}</small></div><button onClick={logout} aria-label="Sair da conta"><MaterialIcon name="logout" /></button></div>
        </aside>
      </div>}
      {practiceSession && practiceLessonId && <ExercisePlayer lessonId={practiceLessonId} onClose={() => router.push(`/praticar/${practiceLessonId}`)} />}
      {passwordChangeOpen && <PasswordChange onClose={() => setPasswordChangeOpen(false)} onChanged={() => { setProfile((current) => ({ ...current, mustChangePassword: false })); setPasswordChangeOpen(false); }} />}
    </main>
  );
}

export default function Home() {
  return <RightWayApp />;
}
