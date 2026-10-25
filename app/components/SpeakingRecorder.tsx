"use client";

import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";
import type { SpeakingEvaluation } from "../lib/speech";
import { SpeakingFeedback } from "./SpeakingFeedback";

type SpeakingResponse = { attemptId: number; attemptNumber: number; result: SpeakingEvaluation };
type RecorderState = "ready" | "recording" | "review" | "processing" | "result";

function supportedMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function SpeakingRecorder({ exerciseId, targetText, onConfirmed }: { exerciseId: number; targetText: string; onConfirmed: (response: SpeakingResponse) => void }) {
  const [state, setState] = useState<RecorderState>("ready");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<SpeakingResponse | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [state]);
  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(""); setBlob(null); setResponse(null); setSeconds(0); setError(""); setState("ready");
  }

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Este navegador não oferece gravação compatível. Atualize o navegador ou use Chrome/Safari recente."); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      stream.current = media; chunks.current = [];
      const mimeType = supportedMime();
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = instance;
      instance.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      instance.onstop = () => {
        const elapsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        const recorded = new Blob(chunks.current, { type: instance.mimeType || mimeType || "audio/webm" });
        media.getTracks().forEach(track => track.stop()); stream.current = null;
        if (recorded.size < 800 || elapsed < 1) { setError("A gravação ficou muito curta. Fale a frase completa e tente novamente."); setState("ready"); return; }
        setSeconds(elapsed); setBlob(recorded); setAudioUrl(URL.createObjectURL(recorded)); setState("review");
      };
      startedAt.current = Date.now(); setSeconds(0); instance.start(250); setState("recording");
    } catch (cause) {
      const denied = cause instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(cause.name);
      setError(denied ? "O acesso ao microfone foi negado. Libere o microfone nas configurações do navegador e tente novamente." : "Não foi possível ativar o microfone. Verifique se outro aplicativo está usando a gravação.");
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function confirm() {
    if (!blob) return;
    setState("processing"); setError("");
    try {
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("wav") ? "wav" : "webm";
      const form = new FormData();
      form.set("audio", new File([blob], `speaking.${extension}`, { type: blob.type }));
      form.set("exerciseId", String(exerciseId)); form.set("targetText", targetText); form.set("durationSeconds", String(Math.max(1, seconds)));
      const request = await fetch("/api/speaking", { method: "POST", body: form });
      const data = await request.json() as SpeakingResponse & { error?: string };
      if (!request.ok) throw new Error(data.error || "Falha ao processar a gravação.");
      setResponse(data); setState("result"); onConfirmed(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A conexão falhou. Sua gravação não foi confirmada; tente enviar novamente.");
      setState("review");
    }
  }

  return <section className={`speaking-recorder state-${state}`} aria-live="polite">
    <header><span><MaterialIcon name="mic" filled /></span><div><small>SPEAKING</small><strong>{state === "recording" ? "Gravando sua resposta" : state === "processing" ? "Analisando sua fala" : state === "result" ? "Sua fala" : "Grave sua resposta"}</strong></div>{state === "recording" && <b>● {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</b>}</header>
    {state === "ready" && <><p>Toque no botão quando estiver pronto. O microfone só será ativado com sua permissão.</p><button type="button" className="speaking-primary" onClick={() => void start()}><MaterialIcon name="mic" />Gravar resposta</button></>}
    {state === "recording" && <><div className="speaking-wave" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div><p>Fale com naturalidade. A gravação não será enviada sem sua confirmação.</p><button type="button" className="speaking-stop" onClick={stop}><MaterialIcon name="stop" filled />Parar gravação</button></>}
    {state === "review" && <><p>Ouça antes de confirmar. Você pode gravar novamente sem enviar esta versão.</p><audio src={audioUrl} controls preload="metadata" /><div className="speaking-actions"><button type="button" className="outline-button" onClick={reset}><MaterialIcon name="refresh" />Gravar novamente</button><button type="button" className="speaking-primary" onClick={() => void confirm()}><MaterialIcon name="check" />Confirmar resposta</button></div></>}
    {state === "processing" && <div className="speaking-processing"><MaterialIcon name="progress_activity" /><strong>Transcrevendo e analisando o conteúdo…</strong><small>O áudio bruto não é armazenado.</small></div>}
    {state === "result" && response && <><SpeakingFeedback evaluation={response.result} targetText={targetText} /><button type="button" className="outline-button" onClick={reset}><MaterialIcon name="refresh" />Fazer nova tentativa</button></>}
    {error && <p className="speaking-error" role="alert"><MaterialIcon name="error" />{error}</p>}
  </section>;
}
