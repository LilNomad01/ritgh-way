"use client";

import { useState } from "react";

const navItems = [
  { label: "Início", icon: "⌂" },
  { label: "Jornada", icon: "◫" },
  { label: "Praticar", icon: "◎" },
  { label: "Conquistas", icon: "◇" },
];

const week = [
  { day: "S", done: true },
  { day: "T", done: true },
  { day: "Q", done: true },
  { day: "Q", done: true },
  { day: "S", done: true },
  { day: "S", done: false },
  { day: "D", done: false },
];

export default function Home() {
  const [dark, setDark] = useState(false);
  const [active, setActive] = useState("Início");
  const [lessonOpen, setLessonOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function selectNav(label: string) {
    setActive(label);
    if (label !== "Início") {
      setNotice(`${label} estará disponível na próxima etapa do protótipo.`);
      window.setTimeout(() => setNotice(null), 2400);
    }
  }

  return (
    <main className={dark ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <img src="/right-way-brand.png" alt="" />
          </div>
          <div>
            <span>RIGHT WAY</span>
            <small>ONLINE</small>
          </div>
        </div>

        <nav className="side-nav">
          <p>SEU ESPAÇO</p>
          {navItems.map((item) => (
            <button
              key={item.label}
              className={active === item.label ? "nav-item active" : "nav-item"}
              onClick={() => selectNav(item.label)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <p className="nav-section">CONTA</p>
          <button className="nav-item" onClick={() => selectNav("Certificados")}>
            <span aria-hidden="true">▣</span> Certificados
          </button>
          <button className="nav-item" onClick={() => selectNav("Configurações")}>
            <span aria-hidden="true">⚙</span> Configurações
          </button>
        </nav>

        <div className="side-footer">
          <div className="plan-row">
            <span className="mini-avatar">AM</span>
            <div><strong>Alex Martins</strong><small>Plano Intermediário</small></div>
            <button aria-label="Mais opções">•••</button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-icon" aria-hidden="true"><img src="/right-way-brand.png" alt="" /></div>
            <strong>RIGHT WAY</strong>
          </div>
          <div className="greeting">
            <p>DOMINGO, 2 DE AGOSTO</p>
            <h1>Bom dia, Alex! <span aria-hidden="true">👋</span></h1>
          </div>
          <div className="top-actions">
            <button className="streak-pill" aria-label="Sequência de cinco dias"><span>🔥</span><strong>5</strong><small>dias</small></button>
            <button className="theme-toggle" onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? "☀" : "☾"}</button>
            <button className="avatar" aria-label="Perfil de Alex Martins">AM<span /></button>
          </div>
        </header>

        <div className="content-grid">
          <div className="primary-column">
            <section className="continue-card">
              <div className="card-content">
                <span className="eyebrow">CONTINUE DE ONDE PAROU</span>
                <p className="lesson-meta">Módulo 02 · Aula 07</p>
                <h2>At the coffee shop</h2>
                <p className="lesson-copy">Peça seu café com confiança e pratique expressões que você realmente vai usar.</p>
                <div className="progress-row">
                  <div className="progress-track"><span style={{ width: "68%" }} /></div>
                  <strong>68%</strong>
                </div>
                <button className="primary-button" onClick={() => { setAnswer(null); setLessonOpen(true); }}>
                  Continuar aula <span>→</span>
                </button>
              </div>
              <div className="lesson-visual" aria-hidden="true">
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <div className="cup"><span /></div>
                <div className="phrase-card"><small>TRY SAYING</small><strong>“Could I have a latte?”</strong><div><i /><i /><i /><i /><i /></div></div>
                <span className="spark spark-one">✦</span>
                <span className="spark spark-two">✦</span>
              </div>
            </section>

            <section className="stats-grid" aria-label="Resumo de progresso">
              <article className="stat-card"><span className="stat-icon red">🔥</span><div><small>SEQUÊNCIA</small><strong>5 dias</strong><p>Seu recorde: 12</p></div></article>
              <article className="stat-card"><span className="stat-icon blue">✦</span><div><small>XP TOTAL</small><strong>1.840</strong><p><b>+120</b> esta semana</p></div></article>
              <article className="stat-card"><span className="stat-icon gold">◷</span><div><small>TEMPO ESTUDADO</small><strong>24h 30m</strong><p>+2h esta semana</p></div></article>
              <article className="stat-card"><span className="stat-icon green">✓</span><div><small>NOTA MÉDIA</small><strong>9,2</strong><p>Excelente desempenho</p></div></article>
            </section>

            <section className="section-block journey-section">
              <div className="section-heading">
                <div><span className="eyebrow">SUA JORNADA</span><h2>Inglês para a vida real</h2></div>
                <button onClick={() => selectNav("Jornada")}>Ver jornada completa <span>→</span></button>
              </div>
              <div className="journey-list">
                <article className="journey-item complete">
                  <span className="step-dot">✓</span>
                  <div><small>MÓDULO 01</small><h3>Everyday foundations</h3><p>12 aulas · Concluído</p></div>
                  <span className="grade">Nota 9,4</span>
                </article>
                <article className="journey-item current">
                  <span className="step-dot">02</span>
                  <div><small>VOCÊ ESTÁ AQUI</small><h3>Real conversations</h3><p>7 de 12 aulas concluídas</p><div className="mini-progress"><span /></div></div>
                  <span className="percent">58%</span>
                </article>
                <article className="journey-item locked">
                  <span className="step-dot">03</span>
                  <div><small>PRÓXIMO</small><h3>Confident communication</h3><p>12 aulas · Bloqueado</p></div>
                  <span>◉</span>
                </article>
              </div>
            </section>
          </div>

          <aside className="right-column">
            <section className="coach-card">
              <div className="coach-top">
                <div className="coach-avatar">M<span>✦</span></div>
                <div><small>SUA PROFESSORA VIRTUAL</small><strong>Maya</strong></div>
                <span className="online-dot" />
              </div>
              <blockquote>“Cinco dias seguidos! Hoje vamos transformar vocabulário em conversa de verdade.”</blockquote>
              <button onClick={() => setLessonOpen(true)}>Praticar com Maya <span>→</span></button>
            </section>

            <section className="week-card">
              <div className="week-title"><div><small>META SEMANAL</small><h3>5 de 7 dias</h3></div><span>72%</span></div>
              <div className="week-days">
                {week.map((item, index) => <div key={index}><span className={item.done ? "done" : ""}>{item.done ? "✓" : index + 1}</span><small>{item.day}</small></div>)}
              </div>
              <p>Mais <strong>2 dias</strong> para bater sua meta.</p>
            </section>

            <section className="ranking-card">
              <div className="ranking-head"><div><small>RANKING PESSOAL</small><h3>Você subiu 3 posições</h3></div><span>↗</span></div>
              <div className="ranking-position"><span>#</span><strong>18</strong><small>entre 842 alunos</small></div>
              <div className="ranking-bar"><span /></div>
              <p>Você está no <strong>top 3%</strong> esta semana.</p>
            </section>

            <section className="daily-card">
              <span>✦</span><div><small>DESAFIO RÁPIDO</small><strong>3 minutos de listening</strong></div><button onClick={() => setLessonOpen(true)} aria-label="Abrir desafio">→</button>
            </section>
          </aside>
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Navegação móvel">
        {navItems.map((item) => (
          <button key={item.label} className={active === item.label ? "active" : ""} onClick={() => selectNav(item.label)}>
            <span>{item.icon}</span><small>{item.label}</small>
          </button>
        ))}
      </nav>

      {lessonOpen && (
        <div className="lesson-overlay" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
          <section className="lesson-modal">
            <div className="modal-top">
              <button onClick={() => setLessonOpen(false)} aria-label="Fechar aula">×</button>
              <div className="modal-progress"><span /></div>
              <small>7 / 10</small>
            </div>
            <div className="modal-content">
              <div className="maya-tip"><div className="coach-avatar small">M</div><p><strong>Dica da Maya</strong>Escute a intenção: a pessoa está fazendo um pedido educado.</p></div>
              <span className="eyebrow">COMPREENSÃO · COFFEE SHOP</span>
              <h2 id="lesson-title">Choose the most natural phrase.</h2>
              <p>Você quer pedir um café com leite de maneira educada. O que diria?</p>
              <div className="answers">
                {["Give me a latte.", "Could I have a latte, please?", "I want latte now."].map((option, index) => {
                  const selected = answer === option;
                  const correct = index === 1;
                  const state = selected ? (correct ? "correct" : "wrong") : "";
                  return <button key={option} className={state} onClick={() => setAnswer(option)}><span>{String.fromCharCode(65 + index)}</span>{option}{selected && <b>{correct ? "✓" : "×"}</b>}</button>;
                })}
              </div>
              {answer && <div className={answer.includes("Could") ? "feedback success" : "feedback error"}><strong>{answer.includes("Could") ? "Mandou bem!" : "Quase lá!"}</strong><p>{answer.includes("Could") ? "“Could I have...” soa natural e educado para fazer pedidos." : "Para soar mais natural, use “Could I have...” e finalize com “please”."}</p></div>}
            </div>
            <div className="modal-footer"><span>+20 XP ao concluir</span><button disabled={!answer} onClick={() => setLessonOpen(false)}>{answer?.includes("Could") ? "Continuar" : "Verificar"} <span>→</span></button></div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
