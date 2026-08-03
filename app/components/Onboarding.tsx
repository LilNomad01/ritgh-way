"use client";

import { useState } from "react";

type Profile = { fullName: string; email: string; level: string; placementScore: number };

const placementQuestions = [
  { question: "Complete: My name ___ Anna.", options: ["am", "is", "are"], correct: 1 },
  { question: "What is the opposite of ‘expensive’?", options: ["cheap", "large", "fast"], correct: 0 },
  { question: "Choose the correct sentence.", options: ["She work every day.", "She works every day.", "She working every day."], correct: 1 },
  { question: "I have lived here ___ five years.", options: ["since", "for", "during"], correct: 1 },
  { question: "If it rains, we ___ at home.", options: ["stay", "stayed", "will stay"], correct: 2 },
  { question: "Choose the natural expression.", options: ["I'm looking forward to meeting you.", "I'm looking forward meet you.", "I look forward for meet you."], correct: 0 },
  { question: "Had I known, I ___ differently.", options: ["would act", "would have acted", "acted"], correct: 1 },
  { question: "‘Albeit’ is closest in meaning to...", options: ["therefore", "although", "because"], correct: 1 },
];

export function Onboarding({ onComplete, onDemo }: { onComplete: (profile: Profile) => void; onDemo: () => void }) {
  const [step, setStep] = useState<"welcome" | "account" | "test" | "result">("welcome");
  const [form, setForm] = useState({ fullName: "", email: "" });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const score = answers.reduce((total, answer, index) => total + (answer === placementQuestions[index].correct ? 1 : 0), 0);
  const level = score <= 1 ? "Começando do zero" : score <= 3 ? "Básico" : score <= 6 ? "Intermediário" : "Avançado";

  function continueTest() {
    if (choice === null) return;
    const nextAnswers = [...answers, choice];
    setAnswers(nextAnswers);
    setChoice(null);
    if (questionIndex === placementQuestions.length - 1) setStep("result");
    else setQuestionIndex((value) => value + 1);
  }

  async function finish() {
    setSaving(true);
    const profile = { ...form, level, placementScore: score };
    try {
      await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "student", ...profile, status: "Ativo" }) });
    } finally {
      localStorage.setItem("rightway-profile", JSON.stringify(profile));
      setSaving(false);
      onComplete(profile);
    }
  }

  return (
    <div className="onboarding-shell">
      <header className="onboarding-brand"><div className="brand-icon"><img src="/right-way-brand.png" alt="" /></div><div><strong>RIGHT WAY</strong><small>ONLINE</small></div></header>
      <div className="onboarding-card">
        {step === "welcome" && <div className="welcome-step"><span className="welcome-badge">✦ SUA JORNADA COMEÇA AQUI</span><h1>Inglês para a vida real.<br/><em>No seu ritmo.</em></h1><p>Uma experiência personalizada que entende seu nível e evolui com você todos os dias.</p><button className="primary-button large" onClick={() => setStep("account")}>Criar minha conta <span>→</span></button><button className="text-button" onClick={onDemo}>Já tenho uma conta · Entrar na demonstração</button><div className="welcome-features"><span>✓ Teste de nível gratuito</span><span>✓ Plano personalizado</span><span>✓ Progresso salvo</span></div></div>}

        {step === "account" && <div className="account-step"><button className="back-link" onClick={() => setStep("welcome")}>← Voltar</button><span className="eyebrow">SEU PERFIL</span><h2>Como podemos chamar você?</h2><p>Essas informações serão usadas no seu plano e certificados.</p><label>Nome completo<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Seu nome" /></label><label>E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="voce@email.com" /></label><button className="primary-button large" disabled={!form.fullName.trim() || !form.email.includes("@")} onClick={() => setStep("test")}>Fazer teste de nível <span>→</span></button><small>Leva cerca de 3 minutos. Você não verá as respostas durante o teste.</small></div>}

        {step === "test" && <div className="placement-step"><div className="placement-top"><div><span className="eyebrow">TESTE DE NIVELAMENTO</span><strong>Questão {questionIndex + 1} de {placementQuestions.length}</strong></div><span>{Math.round(((questionIndex + 1) / placementQuestions.length) * 100)}%</span></div><div className="placement-progress"><span style={{ width: `${((questionIndex + 1) / placementQuestions.length) * 100}%` }} /></div><h2>{placementQuestions[questionIndex].question}</h2><div className="placement-options">{placementQuestions[questionIndex].options.map((option, index) => <button className={choice === index ? "selected" : ""} onClick={() => setChoice(index)} key={option}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div><button className="primary-button large" disabled={choice === null} onClick={continueTest}>{questionIndex === placementQuestions.length - 1 ? "Concluir teste" : "Próxima questão"} <span>→</span></button><small>Sem pressão: o resultado serve apenas para personalizar seu ponto de partida.</small></div>}

        {step === "result" && <div className="result-step"><div className="level-orbit"><span>{score}</span><small>de {placementQuestions.length}</small></div><span className="eyebrow">SEU NÍVEL ATUAL</span><h2>{level}</h2><p>{level === "Avançado" ? "Você já domina estruturas complexas. Vamos lapidar sua fluência e precisão." : level === "Intermediário" ? "Você já se comunica e está pronto para transformar conhecimento em conversa natural." : "Vamos construir uma base sólida e fazer você falar desde a primeira aula."}</p><div className="result-path"><span>Seu plano começa em</span><strong>{level === "Começando do zero" ? "Start speaking · Módulo 01" : `${level} · Módulo 01`}</strong></div><button className="primary-button large" disabled={saving} onClick={finish}>{saving ? "Salvando seu plano..." : "Entrar no meu painel"} <span>→</span></button></div>}
      </div>
      <p className="onboarding-footer">RIGHT WAY ONLINE · APRENDIZADO QUE ACOMPANHA VOCÊ</p>
    </div>
  );
}
