"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../lib/client-data";
import { MaterialIcon } from "./MaterialIcon";
import styles from "./SpeakingFeedback.module.css";

export function SpeakingReference({ exerciseId, targetText, studentAudioUrl }: { exerciseId: number; targetText: string; studentAudioUrl?: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comparing, setComparing] = useState(false);
  const player = useRef<HTMLAudioElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function listen() {
    if (busy) return;
    setError("");
    if (url && player.current) { player.current.currentTime = 0; await player.current.play().catch(() => setError("Toque no player para ouvir a referência.")); return; }
    setBusy(true);
    try {
      const response = await authenticatedFetch(`/api/audio?exerciseId=${exerciseId}&targetText=${encodeURIComponent(targetText)}`, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok || response.status === 202 || !response.headers.get("content-type")?.startsWith("audio/")) {
        throw new Error(response.status === 409 ? "Esta alternativa ainda não tem áudio de referência. Você pode continuar a prática." : "A professora ainda não enviou uma referência disponível para esta atividade. Você pode continuar a prática.");
      }
      const blob = await response.blob();
      if (alive.current) setUrl(URL.createObjectURL(blob));
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Referência indisponível. Você pode continuar."); }
    finally { if (alive.current) setBusy(false); }
  }

  return <section className={styles.reference} aria-label="Áudio de referência">
    <div className="speaking-actions"><button type="button" className="outline-button" disabled={busy} onClick={() => void listen()}><MaterialIcon name="volume_up" />{busy ? "Preparando referência…" : url ? "Ouvir novamente" : "Ouvir pronúncia de referência"}</button>{studentAudioUrl && <button type="button" className="outline-button" aria-expanded={comparing} onClick={() => setComparing(value => !value)}><MaterialIcon name="compare_arrows" />Comparar</button>}</div>
    {url && <div className={styles.track}><span>Áudio de referência enviado pela professora</span><audio ref={player} src={url} controls preload="metadata" autoPlay /></div>}
    {comparing && studentAudioUrl && <div className={styles.track}><span>Sua gravação · disponível nesta sessão</span><audio src={studentAudioUrl} controls preload="metadata" onPlay={() => player.current?.pause()} /></div>}
    <small>O áudio enviado é reutilizado. Ouvir novamente não gera voz nem consome tokens de IA.</small>
    {error && <p className={styles.referenceError} role="status">{error}</p>}
  </section>;
}
