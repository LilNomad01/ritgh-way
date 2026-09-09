"use client";

import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";

export function ListeningAudio({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => () => {
    generation.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  function play(rate: number) {
    if (!text || !("speechSynthesis" in window)) { setError("Áudio indisponível neste aparelho. Tente abrir a prática no Chrome atualizado."); return; }
    const token = ++generation.current;
    window.speechSynthesis.cancel();
    setError("");
    setPlaying(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.voice = window.speechSynthesis.getVoices().find(voice => voice.lang === "en-US") ?? null;
    utterance.rate = rate;
    utterance.onend = () => { if (generation.current === token) { setPlaying(false); setHeard(true); } };
    utterance.onerror = () => { if (generation.current === token) { setPlaying(false); setError("Não foi possível reproduzir. Confira o volume e tente novamente."); } };
    window.speechSynthesis.speak(utterance);
  }

  return <div className="listening-controls">
    <button type="button" className="listen-button" onClick={() => play(0.9)} aria-label={playing ? "Reiniciar áudio" : "Ouvir áudio"}>
      <MaterialIcon name={playing ? "graphic_eq" : "volume_up"} /><div><strong>{playing ? "Reproduzindo…" : heard ? "Ouvir novamente" : "Ouvir áudio"}</strong><small>Escute e escreva o que ouviu</small></div>
    </button>
    <button type="button" className="outline-button" onClick={() => play(0.65)}><MaterialIcon name="slow_motion_video" />Ouvir mais devagar</button>
    {error ? <p role="alert" className="practice-save-error">{error}</p> : null}
  </div>;
}
