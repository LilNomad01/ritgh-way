"use client";

import { useState } from "react";
import { InstallAppButton } from "./PwaSupport";

type Profile = { fullName: string; email: string; level: string; placementScore: number; goal?: string; dailyMinutes?: number; role?: "admin" | "student"; mustChangePassword?: boolean };
type Step = "home" | "login" | "signup" | "goal" | "daily" | "test-intro" | "test" | "result";

const placementQuestions = [
  { prompt: "Complete a frase", question: "My name ___ Anna.", options: ["am", "is", "are"], correct: 1 },
  { prompt: "Escolha a tradução", question: "‘Barato’ em inglês é...", options: ["cheap", "large", "fast"], correct: 0 },
  { prompt: "Qual frase está correta?", question: "Ela trabalha todos os dias.", options: ["She work every day.", "She works every day.", "She working every day."], correct: 1 },
  { prompt: "Complete a frase", question: "I have lived here ___ five years.", options: ["since", "for", "during"], correct: 1 },
  { prompt: "Escolha a melhor opção", question: "If it rains, we ___ at home.", options: ["stay", "stayed", "will stay"], correct: 2 },
  { prompt: "Qual expressão soa natural?", question: "Você está ansioso para conhecer alguém.", options: ["I'm looking forward to meeting you.", "I'm looking forward meet you.", "I look forward for meet you."], correct: 0 },
  { prompt: "Complete a estrutura avançada", question: "Had I known, I ___ differently.", options: ["would act", "would have acted", "acted"], correct: 1 },
  { prompt: "Vocabulário avançado", question: "‘Albeit’ significa algo próximo de...", options: ["therefore", "although", "because"], correct: 1 },
];

const goals = [
  { icon: "✈", title: "Viajar com confiança", text: "Me comunicar em qualquer lugar" },
  { icon: "◫", title: "Crescer na carreira", text: "Inglês para trabalho e entrevistas" },
  { icon: "●", title: "Conversar de verdade", text: "Falar com naturalidade no dia a dia" },
  { icon: "★", title: "Desafio pessoal", text: "Aprender algo novo e evoluir" },
];

const dailyGoals = [
  { minutes: 5, label: "Leve", note: "Um passo por dia" },
  { minutes: 10, label: "Regular", note: "Recomendado" },
  { minutes: 15, label: "Focado", note: "Resultados mais rápidos" },
  { minutes: 20, label: "Intenso", note: "Para quem quer acelerar" },
];

export function Onboarding({ onComplete }: { onComplete: (profile: Profile) => void }) {
  const [step, setStep] = useState<Step>("home");
  const [form, setForm] = useState({ fullName: "", email: "" });
  const [password, setPassword] = useState("");
  const [goal, setGoal] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(10);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [manualLevel, setManualLevel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");

  const score = answers.reduce((total, answer, index) => total + (answer === placementQuestions[index].correct ? 1 : 0), 0);
  const level = manualLevel ?? (score <= 1 ? "Começando do zero" : score <= 3 ? "Básico" : score <= 6 ? "Intermediário" : "Avançado");
  const flowSteps: Step[] = ["signup", "goal", "daily", "test-intro", "test", "result"];
  const flowIndex = flowSteps.indexOf(step);
  const flowProgress = step === "test" ? 55 + ((questionIndex + 1) / placementQuestions.length) * 35 : Math.max(0, ((flowIndex + 1) / flowSteps.length) * 100);

  function back() {
    const map: Partial<Record<Step, Step>> = { login: "home", signup: "home", goal: "signup", daily: "goal", "test-intro": "daily", test: "test-intro", result: "test-intro" };
    setStep(map[step] ?? "home");
  }

  function continueTest() {
    if (choice === null) return;
    const nextAnswers = [...answers, choice];
    setAnswers(nextAnswers);
    setChoice(null);
    if (questionIndex === placementQuestions.length - 1) setStep("result");
    else setQuestionIndex((value) => value + 1);
  }

  async function login() {
    if (!loginEmail.includes("@") || !loginPassword) return;
    setSaving(true);
    setLoginError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      const result = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok || !result.profile) throw new Error(result.error ?? "Não foi possível entrar.");
      onComplete(result.profile);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setSignupError("");
    const profile = { ...form, level, placementScore: manualLevel ? 0 : score, goal, dailyMinutes };
    try {
      const response = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register", ...profile, password, answers }) });
      const result = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok || !result.profile) throw new Error(result.error ?? "Não foi possível criar sua conta.");
      onComplete(result.profile);
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : "Não foi possível criar sua conta.");
    } finally {
      setSaving(false);
    }
  }

  if (step === "home") {
    return (
      <div className="entry-shell">
        <header className="entry-header"><div className="entry-brand"><div className="brand-icon"><img src="/right-way-brand.png" alt="" /></div><div><strong>RIGHT WAY</strong><small>ONLINE</small></div></div><button onClick={() => setStep("login")}>ENTRAR</button></header>
        <main className="entry-main">
          <section className="entry-visual" aria-hidden="true"><div className="entry-orbit orbit-a" /><div className="entry-orbit orbit-b" /><div className="entry-eagle"><img src="/right-way-brand.png" alt="" /></div><div className="floating-word word-one"><span>✓</span>Hello!</div><div className="floating-word word-two"><span>🔥</span>+10 XP</div><div className="floating-word word-three"><span>▶</span>Speaking</div></section>
          <section className="entry-copy"><span className="entry-kicker">APRENDA. PRATIQUE. EVOLUA.</span><h1>Seu inglês começa<br/>do <em>jeito certo.</em></h1><p>Aulas curtas, prática todos os dias e uma jornada feita para o seu nível.</p><button className="entry-primary" onClick={() => setStep("signup")}>COMEÇAR AGORA</button><button className="entry-secondary" onClick={() => setStep("login")}>JÁ TENHO UMA CONTA</button><InstallAppButton /><small>Leva menos de 3 minutos para descobrir seu nível.</small></section>
        </main>
        <footer className="entry-trust"><span>✓ Teste gratuito</span><span>✓ Sem compromisso</span><span>✓ Plano personalizado</span></footer>
      </div>
    );
  }

  if (step === "login") {
    return (
      <div className="flow-shell login-shell"><header className="flow-header"><button onClick={back}>←</button><div className="entry-brand"><div className="brand-icon"><img src="/right-way-brand.png" alt="" /></div><div><strong>RIGHT WAY</strong><small>ONLINE</small></div></div><span /></header><main className="login-card"><div className="flow-mascot small"><div className="entry-eagle"><img src="/right-way-brand.png" alt="" /></div></div><span className="flow-kicker">BEM-VINDO DE VOLTA</span><h1>Continue de onde parou.</h1><p>Entre com suas credenciais para acessar sua conta.</p><label>E-mail<input autoFocus type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="voce@email.com" /></label><label>Senha<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && login()} placeholder="Sua senha" /></label>{loginError && <div className="login-error">{loginError}</div>}<button className="flow-primary" disabled={!loginEmail.includes("@") || !loginPassword || saving} onClick={login}>{saving ? "ENTRANDO..." : "ENTRAR COM SEGURANÇA"}</button><div className="security-note"><span>⌾</span> Sessão protegida por token seguro e cookie HTTP-only</div><button className="flow-text" onClick={() => setStep("signup")}>Ainda não tenho uma conta</button></main></div>
    );
  }

  return (
    <div className="flow-shell">
      <header className="flow-header"><button onClick={back}>←</button><div className="flow-progress"><span style={{ width: `${flowProgress}%` }} /></div><button className="flow-close" onClick={() => setStep("home")}>×</button></header>
      <main className="flow-main">
        {step === "signup" && <section className="flow-panel"><div className="flow-mascot"><div className="entry-eagle"><img src="/right-way-brand.png" alt="" /></div><div className="coach-bubble">Primeiro, quero conhecer você!</div></div><span className="flow-kicker">CRIE SUA CONTA</span><h1>Como podemos chamar você?</h1><p>Seu nome vai aparecer nas aulas e nos certificados.</p><div className="flow-fields"><label>Nome completo<input autoFocus value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Seu nome" /></label><label>E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="voce@email.com" /></label><label>Senha<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="12+ caracteres, número e símbolo" /></label></div>{signupError && <div className="login-error">{signupError}</div>}<button className="flow-primary" disabled={!form.fullName.trim() || !form.email.includes("@") || password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)} onClick={() => setStep("goal")}>CONTINUAR</button><button className="flow-text" onClick={() => setStep("login")}>Já tenho uma conta</button></section>}

        {step === "goal" && <section className="flow-panel choice-panel"><div className="flow-mascot"><div className="entry-eagle"><img src="/right-way-brand.png" alt="" /></div><div className="coach-bubble">Legal, {form.fullName.split(" ")[0]}! Qual é o seu objetivo?</div></div><span className="flow-kicker">SEU OBJETIVO</span><h1>Por que você quer aprender inglês?</h1><p>Assim podemos deixar suas aulas mais relevantes.</p><div className="goal-grid">{goals.map((item) => <button className={goal === item.title ? "selected" : ""} onClick={() => setGoal(item.title)} key={item.title}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.text}</small></div><i>›</i></button>)}</div><button className="flow-primary" disabled={!goal} onClick={() => setStep("daily")}>CONTINUAR</button></section>}

        {step === "daily" && <section className="flow-panel choice-panel"><div className="flow-mascot"><div className="entry-eagle"><img src="/right-way-brand.png" alt="" /></div><div className="coach-bubble">Consistência vale mais que pressa.</div></div><span className="flow-kicker">META DIÁRIA</span><h1>Quanto tempo cabe no seu dia?</h1><p>Você pode mudar sua meta quando quiser.</p><div className="daily-choice-grid">{dailyGoals.map((item) => <button className={dailyMinutes === item.minutes ? "selected" : ""} onClick={() => setDailyMinutes(item.minutes)} key={item.minutes}><span>{item.minutes}<small>min</small></span><div><strong>{item.label}</strong><small>{item.note}</small></div>{item.minutes === 10 && <b>POPULAR</b>}</button>)}</div><button className="flow-primary" onClick={() => setStep("test-intro")}>CONTINUAR</button></section>}

        {step === "test-intro" && <section className="flow-panel test-intro-panel"><div className="test-shield">?</div><span className="flow-kicker">TESTE DE NIVELAMENTO</span><h1>Vamos encontrar o ponto certo para você.</h1><p>São apenas 8 perguntas. Não mostramos as respostas durante o teste, então seu resultado fica mais preciso.</p><div className="test-benefits"><div><span>◷</span><p><strong>3 minutos</strong>Bem rapidinho</p></div><div><span>◎</span><p><strong>Seu nível real</strong>Do zero ao avançado</p></div><div><span>✦</span><p><strong>Trilha personalizada</strong>Sem repetir o que já sabe</p></div></div><button className="flow-primary" onClick={() => { setManualLevel(null); setStep("test"); }}>COMEÇAR O TESTE</button><button className="flow-outline" onClick={() => { setManualLevel("Começando do zero"); setStep("result"); }}>NÃO SEI NADA DE INGLÊS</button></section>}

        {step === "test" && <section className="flow-panel placement-flow"><div className="question-count"><span>QUESTÃO {questionIndex + 1}</span><small>{questionIndex + 1} de {placementQuestions.length}</small></div><span className="flow-kicker">{placementQuestions[questionIndex].prompt}</span><h1>{placementQuestions[questionIndex].question}</h1><div className="placement-flow-options">{placementQuestions[questionIndex].options.map((option, index) => <button className={choice === index ? "selected" : ""} onClick={() => setChoice(index)} key={option}><span>{String.fromCharCode(65 + index)}</span>{option}<i>{choice === index ? "✓" : ""}</i></button>)}</div><button className="flow-primary" disabled={choice === null} onClick={continueTest}>{questionIndex === placementQuestions.length - 1 ? "VER MEU RESULTADO" : "CONTINUAR"}</button><small className="test-note">A resposta correta só será considerada no resultado final.</small></section>}

        {step === "result" && <section className="flow-panel result-flow"><div className="result-celebration"><i>✦</i><div className="result-ring"><span>{manualLevel ? "✓" : score}</span><small>{manualLevel ? "PRONTO" : `DE ${placementQuestions.length}`}</small></div><i>✦</i></div><span className="flow-kicker">SEU PONTO DE PARTIDA</span><h1>{level}</h1><p>{level === "Avançado" ? "Você já domina estruturas complexas. Sua trilha vai focar fluência, nuance e precisão." : level === "Intermediário" ? "Você já tem uma boa base. Agora vamos transformar conhecimento em conversas mais naturais." : level === "Básico" ? "Você já reconhece estruturas essenciais. Vamos fortalecer sua base e fazer você falar mais." : "Perfeito. Vamos começar do primeiro passo, sem pressa e sem deixar nenhuma dúvida para trás."}</p><div className="path-preview"><div><span>1</span><p><small>PRIMEIRA TRILHA</small><strong>{level === "Avançado" ? "Fluent thinking" : level === "Intermediário" ? "Real conversations" : "Start speaking"}</strong></p></div><b>{dailyMinutes} min por dia</b></div>{signupError && <div className="login-error">{signupError}</div>}<button className="flow-primary" disabled={saving} onClick={finish}>{saving ? "CRIANDO SUA TRILHA..." : "CRIAR CONTA E COMEÇAR"}</button><button className="flow-text" onClick={() => { setAnswers([]); setQuestionIndex(0); setManualLevel(null); setStep("test-intro"); }}>Refazer o teste</button></section>}
      </main>
    </div>
  );
}
