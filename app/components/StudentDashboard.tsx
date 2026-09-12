"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaterialIcon } from "./MaterialIcon";

type Summary = { completedLessons: number; totalLessons: number; practiceAttempts: number; accuracy: number | null; examAttempts: number; examAverage: number | null; resume: null | { title: string; description: string; started: boolean; kind: string; position: number; total: number; href: string } };
export function StudentDashboard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  useEffect(() => { const controller = new AbortController(); setError(''); fetch('/api/dashboard', { cache: 'no-store', signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Seu progresso está indisponível no momento.'); return response.json(); }).then(setData).catch(error => { if (!controller.signal.aborted) setError(error.message); }); return () => controller.abort(); }, [retry]);
  if (error) return <section className="section-block" role="alert"><p>{error}</p><button className="outline-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></section>;
  if (!data) return <p className="journey-loading">Carregando seu progresso…</p>;
  const resume = data.resume;
  return <div className={compact ? 'real-dashboard compact' : 'real-dashboard page-view'}>
    <section className="continue-learning-card"><div><span className="eyebrow">{resume?.started ? 'CONTINUE DE ONDE PAROU' : 'SEU PRÓXIMO PASSO'}</span><h2>{resume?.title ?? 'Você está em dia'}</h2><p>{resume?.started ? resume.kind === 'practice' ? `Prática · ${resume.position} de ${resume.total} respostas confirmadas` : `Vídeo · retomar em ${Math.floor(resume.position / 60)}:${String(resume.position % 60).padStart(2, '0')}` : resume?.description || 'Consulte as aulas disponíveis para estudar ou revisar.'}</p></div><button onClick={() => router.push(resume?.href ?? '/aulas')}>{resume?.started ? 'Continuar' : 'Ver aulas'}<MaterialIcon name="arrow_forward" /></button></section>
    {!compact && <><section className="stats-grid" aria-label="Seu progresso registrado">{[
      ['school', 'AULAS CONCLUÍDAS', `${data.completedLessons} / ${data.totalLessons}`, 'Vídeos e exercícios finalizados'],
      ['quiz', 'PRÁTICAS FINALIZADAS', data.practiceAttempts, 'Tentativas salvas na sua conta'],
      ['check_circle', 'ACERTOS NAS PRÁTICAS', data.accuracy === null ? '—' : `${data.accuracy}%`, data.accuracy === null ? 'Faça sua primeira prática' : 'Todas as tentativas concluídas'],
      ['assignment', 'MÉDIA NAS PROVAS', data.examAverage === null ? '—' : `${data.examAverage}%`, `${data.examAttempts} provas realizadas`],
    ].map(([icon, label, value, hint]) => <article className="stat-card" key={String(label)}><span className="stat-icon blue"><MaterialIcon name={String(icon)} /></span><div><small>{label}</small><strong>{value}</strong><p>{hint}</p></div></article>)}</section><section className="section-block"><span className="eyebrow">ESTUDE COM INTENÇÃO</span><h2>Ouça, escreva e aplique.</h2><p>Revise as correções das suas respostas e leve o conteúdo para situações reais.</p><button className="outline-button" onClick={() => router.push('/praticar')}>Abrir minhas práticas<MaterialIcon name="arrow_forward" /></button></section></>}
  </div>;
}
