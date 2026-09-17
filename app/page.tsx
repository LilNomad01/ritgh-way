"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MaterialIcon } from "./components/MaterialIcon";
import { Onboarding } from "./components/Onboarding";
import { StudentDashboard } from "./components/StudentDashboard";
import { PasswordChange } from "./components/PasswordChange";
import { InstallAppButton } from "./components/PwaSupport";

const AdminPanel = dynamic(() => import("./components/AdminPanel").then((module) => module.AdminPanel));
const ExercisePlayer = dynamic(() => import("./components/ExercisePlayer").then((module) => module.ExercisePlayer));
const JourneyView = dynamic(() => import("./components/JourneyView").then((module) => module.JourneyView));
const LessonsLibrary = dynamic(() => import("./components/LessonsLibrary").then((module) => module.LessonsLibrary));
const PracticeHub = dynamic(() => import("./components/PracticeHub").then((module) => module.PracticeHub));
const SectionExam = dynamic(() => import("./components/SectionExam").then((module) => module.SectionExam));

type Profile = { fullName: string; email: string; level: string; placementScore: number; goal?: string; dailyMinutes?: number; role?: "admin" | "student"; mustChangePassword?: boolean };

const navItems = [
  { label: "Início", icon: "home" },
  { label: "Aulas", icon: "play_circle" },
  { label: "Jornada", icon: "route" },
  { label: "Praticar", icon: "target" },
  { label: "Conquistas", icon: "workspace_premium" },
];


const demoProfile: Profile = { fullName: "Alex Martins", email: "alex@rightway.com", level: "Intermediário", placementScore: 6 };

async function fetchSessionProfile() {
  const sessionResponse = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (sessionResponse.ok) return sessionResponse.json() as Promise<{ profile: Profile }>;

  if (sessionResponse.status === 401) {
    const refreshResponse = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (refreshResponse.ok) {
      const retriedSession = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (retriedSession.ok) return retriedSession.json() as Promise<{ profile: Profile }>;
    }
  }

  throw new Error("anonymous");
}

function Achievements() { return <div className="page-view"><section className="section-block"><span className="eyebrow">SUAS CONQUISTAS</span><h1>Seu progresso, sem números inventados.</h1><p>As medalhas ainda estão em preparação. Acompanhe abaixo as atividades realmente concluídas.</p></section><StudentDashboard /></div>; }

type AppView = "Início" | "Aulas" | "Jornada" | "Praticar" | "Conquistas";

export function RightWayApp({ adminEntry = false, initialView = "Início", lessonId, practiceLessonId, practiceSession = false, examSectionId, examSession = false }: { adminEntry?: boolean; initialView?: AppView; lessonId?: number; practiceLessonId?: number; practiceSession?: boolean; examSectionId?: number; examSession?: boolean }) {
  const router = useRouter();
  const [dark, setDark] = useState(() => typeof window !== "undefined" && localStorage.getItem("rightway-theme") === "dark");
  const [active, setActive] = useState<string>(adminEntry ? "Admin" : initialView);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [profile, setProfile] = useState<Profile>(demoProfile);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchSessionProfile().then((result) => {
      setProfile(result.profile);
      setShowOnboarding(false);
      setPasswordChangeOpen(Boolean(result.profile.mustChangePassword));
      setActive(result.profile.role === "admin" && adminEntry ? "Admin" : initialView);
    }).catch(() => setShowOnboarding(true)).finally(() => setCheckingSession(false));
  }, [adminEntry, initialView]);

  function toggleTheme() {
    setDark((value) => { localStorage.setItem("rightway-theme", value ? "light" : "dark"); return !value; });
  }

  function selectNav(label: string) {
    setMobileMenuOpen(false);
    setActive(label);
    const destinations: Record<string, string> = { Início: "/", Aulas: "/aulas", Jornada: "/jornada", Praticar: "/praticar", Conquistas: "/conquistas", Admin: "/admin" };
    router.push(destinations[label] ?? "/");
  }

  function finishOnboarding(nextProfile: Profile) {
    setProfile(nextProfile);
    setShowOnboarding(false);
    setPasswordChangeOpen(Boolean(nextProfile.mustChangePassword));
    setActive(nextProfile.role === "admin" ? "Admin" : "Início");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setShowOnboarding(true);
    setActive("Início");
  }

  if (checkingSession) return <div className="app-loading"><div className="brand-icon"><img src="/right-way-brand-optimized.jpg" alt="" /></div><strong>RIGHT WAY</strong><span /></div>;
  if (showOnboarding) return <Onboarding onComplete={finishOnboarding} initialStep={adminEntry ? "login" : "home"} />;

  const firstName = profile.fullName.split(" ")[0] || "Aluno";
  const initials = profile.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className={dark ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><img src="/right-way-brand-optimized.jpg" alt="" /></div><div><span>RIGHT WAY</span><small>ONLINE</small></div></div>
        <nav className="side-nav"><p>SEU ESPAÇO</p>{navItems.map((item) => <button key={item.label} className={active === item.label ? "nav-item active" : "nav-item"} onClick={() => selectNav(item.label)}><MaterialIcon name={item.icon} filled={active === item.label} />{item.label}</button>)}{profile.role === "admin" && <><p className="nav-section">GESTÃO SEGURA</p><button className={active === "Admin" ? "nav-item active admin-nav" : "nav-item admin-nav"} onClick={() => selectNav("Admin")}><MaterialIcon name="admin_panel_settings" filled={active === "Admin"} />Painel admin</button></>}</nav>
        <div className="side-footer"><div className="plan-row"><span className="mini-avatar">{initials}</span><div><strong>{profile.fullName}</strong><small>{profile.role === "admin" ? "Administrador raiz" : `Plano ${profile.level}`}</small></div><button onClick={logout} aria-label="Sair da conta">↪</button></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="mobile-brand"><button className="mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu" aria-expanded={mobileMenuOpen}><MaterialIcon name="menu" /></button><div className="brand-icon" aria-hidden="true"><img src="/right-way-brand-optimized.jpg" alt="" /></div><div><strong>RIGHT WAY</strong><small>{active}</small></div></div><div className="greeting"><p>{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase()}</p><h1>{active === "Início" ? `Olá, ${firstName}!` : active} <span aria-hidden="true">{active === "Início" ? "👋" : ""}</span></h1></div><div className="top-actions"><InstallAppButton variant="compact" /><button className="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema"><MaterialIcon name={dark ? "light_mode" : "dark_mode"} /></button><button className="avatar" onClick={() => profile.role === "admin" && selectNav("Admin")} aria-label={profile.role === "admin" ? "Abrir painel administrativo" : "Perfil do aluno"}>{initials}<span /></button></div></header>

        {active === "Início" && <StudentDashboard />}
        {active === "Aulas" && examSectionId ? <SectionExam sectionId={examSectionId} session={examSession} onBack={() => router.push("/aulas")} onStart={() => router.push(`/prova/${examSectionId}/sessao`)} onNextSection={(href) => router.push(href)} /> : null}
        {active === "Aulas" && !examSectionId && <LessonsLibrary lessonId={lessonId} onOpenLesson={(nextLessonId) => router.push(`/aulas/${nextLessonId}`)} onBack={() => router.push("/aulas")} onPracticeLesson={(nextLessonId) => router.push(`/praticar/${nextLessonId}`)} onOpenExam={(sectionId) => router.push(`/prova/${sectionId}`)} onContinue={(href) => router.push(href)} />}
        {active === "Jornada" && <JourneyView onContinue={(nextLesson) => router.push(`/aulas/${nextLesson.id}`)} onOpenExam={(sectionId) => router.push(`/prova/${sectionId}`)} />}
        {active === "Praticar" && <PracticeHub lessonId={practiceLessonId} onOpenDetail={(lessonId) => router.push(`/praticar/${lessonId}`)} onStartSession={(lessonId) => router.push(`/praticar/${lessonId}/sessao`)} onBackToHub={() => router.push("/praticar")} />}
        {active === "Conquistas" && <Achievements />}
        {active === "Admin" && profile.role === "admin" && <><div className="admin-security-banner"><MaterialIcon name="verified_user" filled /><div><strong>Sessão administrativa protegida</strong><small>JWT de curta duração, cookie HTTP-only e renovação segura.</small></div><button onClick={() => setPasswordChangeOpen(true)}>{profile.mustChangePassword ? "Trocar senha inicial" : "Alterar minha senha"}</button></div><AdminPanel /></>}
      </section>

      {mobileMenuOpen && <div className="mobile-menu-layer" role="presentation" onClick={() => setMobileMenuOpen(false)}>
        <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu de navegação" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-drawer-head"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><img src="/right-way-brand-optimized.jpg" alt="" /></div><div><span>RIGHT WAY</span><small>ONLINE</small></div></div><button onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><MaterialIcon name="close" /></button></div>
          <nav>{navItems.map((item) => <button key={item.label} className={active === item.label ? "active" : ""} onClick={() => selectNav(item.label)}><MaterialIcon name={item.icon} filled={active === item.label} /><span>{item.label}</span><MaterialIcon name="chevron_right" /></button>)}{profile.role === "admin" && <button className={active === "Admin" ? "active admin" : "admin"} onClick={() => selectNav("Admin")}><MaterialIcon name="admin_panel_settings" filled /><span>Painel admin</span><MaterialIcon name="chevron_right" /></button>}</nav>
          <div className="mobile-drawer-account"><span>{initials}</span><div><strong>{profile.fullName}</strong><small>{profile.role === "admin" ? "Administrador raiz" : profile.level}</small></div><button onClick={logout} aria-label="Sair da conta"><MaterialIcon name="logout" /></button></div>
        </aside>
      </div>}
      {practiceSession && practiceLessonId && <ExercisePlayer lessonId={practiceLessonId} onClose={() => router.push(`/praticar/${practiceLessonId}`)} />}
      {passwordChangeOpen && <PasswordChange required={Boolean(profile.mustChangePassword)} onClose={() => setPasswordChangeOpen(false)} onChanged={() => { setProfile((current) => ({ ...current, mustChangePassword: false })); setPasswordChangeOpen(false); }} />}
    </main>
  );
}

export default function Home() {
  return <RightWayApp />;
}
