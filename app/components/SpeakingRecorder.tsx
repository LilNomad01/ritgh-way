"use client";

import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";
import type { SpeakingEvaluation } from "../lib/speech";
import { SpeakingFeedback } from "./SpeakingFeedback";
import { authenticatedFetch } from "../lib/client-data";
import { normalizeRecording } from "../lib/speech-capture";
import { speechRequestOutcome } from "../lib/speech-client";

type SpeakingResponse = { attemptId: number; attemptNumber: number; result: SpeakingEvaluation };
type RecorderState = "ready" | "permission" | "recording" | "preparing" | "review" | "processing" | "result";

function supportedMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function SpeakingRecorder({ exerciseId, targetText, onConfirmed, onReset }: { exerciseId: number; targetText: string; onConfirmed: (response: SpeakingResponse) => void; onReset: () => void }) {
  const [state, setState] = useState<RecorderState>("ready");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<SpeakingResponse | null>(null);
  const [recovering, setRecovering] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const mounted = useRef(true);
  const requestId = useRef("");
  const requestPending = useRef(false);
  const starting = useRef(false);
  const confirming = useRef(false);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(Math.min(60, elapsed));
      if (elapsed >= 60 && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state !== "inactive") recorder.current.stop(); }
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  function reset() {
    onReset();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    requestId.current = ""; requestPending.current = false;
    setRecovering(false);
    setAudioUrl(""); setBlob(null); setResponse(null); setSeconds(0); setError(""); setState("ready");
  }

  async function start() {
    if (starting.current) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Este navegador não oferece gravação compatível. Atualize o navegador ou use Chrome/Safari recente."); return; }
    starting.current = true; setState("permission");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; chunks.current = [];
      const mimeType = supportedMime();
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = instance;
      instance.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      instance.onstop = async () => {
        const elapsed = (Date.now() - startedAt.current) / 1000;
        const recorded = new Blob(chunks.current, { type: instance.mimeType || mimeType || "audio/webm" });
        media.getTracks().forEach(track => track.stop()); stream.current = null;
        if (recorded.size < 800 || elapsed < 0.7) { setError("A gravação ficou muito curta. Fale a frase completa e tente novamente."); setState("ready"); return; }
        setState("preparing");
        try {
          const normalized = await normalizeRecording(recorded);
          if (!mounted.current) return;
          requestId.current = crypto.randomUUID(); requestPending.current = false;
          setSeconds(normalized.duration); setBlob(normalized.blob); setAudioUrl(URL.createObjectURL(normalized.blob)); setState("review");
        } catch {
          if (!mounted.current) return;
          setError("Não foi possível preparar o áudio. Grave novamente em um ambiente silencioso, falando perto do microfone."); setState("ready");
        }
      };
      startedAt.current = Date.now(); setSeconds(0); instance.start(250); setState("recording");
    } catch (cause) {
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (!mounted.current) return;
      const denied = cause instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(cause.name);
      setError(denied ? "O acesso ao microfone foi negado. Libere o microfone nas configurações do navegador e tente novamente." : "Não foi possível ativar o microfone. Verifique se outro aplicativo está usando a gravação.");
      setState("ready");
    } finally { starting.current = false; }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function confirm() {
    if (!blob || confirming.current) return;
    confirming.current = true;
    setState("processing"); setError("");
    try {
      const form = new FormData();
      form.set("audio", new File([blob], "speaking.wav", { type: "audio/wav" }));
      form.set("exerciseId", String(exerciseId)); form.set("targetText", targetText); form.set("durationSeconds", String(Math.max(1, seconds)));
      form.set("requestId", requestId.current);
      const url = `/api/speaking?requestId=${encodeURIComponent(requestId.current)}`;
      const recover = requestPending.current;
      requestPending.current = true;
      let request = recover
        ? await authenticatedFetch(url, { signal: AbortSignal.timeout(15_000) })
        : await authenticatedFetch("/api/speaking", { method: "POST", body: form, signal: AbortSignal.timeout(75_000) });
      // An unknown network outcome is recovered by ID, never by starting another paid job.
      for (let poll = 0; request.status === 202 && poll < 25; poll++) {
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        if (!mounted.current) return;
        request = await authenticatedFetch(url, { signal: AbortSignal.timeout(15_000) });
      }
      const data = await request.json() as SpeakingResponse & { error?: string; status?: string };
      const outcome = speechRequestOutcome(request.status, data);
      requestPending.current = outcome === "pending";
      if (outcome === "failed") requestId.current = crypto.randomUUID();
      if (!request.ok || request.status === 202 || !data.attemptId || !data.result) throw new Error(data.error || "A análise ainda não terminou. Consulte novamente em alguns segundos.");
      if (!mounted.current) return;
      setResponse(data); setState("result"); onConfirmed(data);
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? "A análise ainda pode estar em andamento. Sua gravação foi mantida; consulte novamente sem gerar outra análise." : cause instanceof Error ? cause.message : "A conexão falhou. Consulte o resultado novamente; sua gravação foi mantida.");
      setRecovering(requestPending.current);
      setState("review");
    } finally { confirming.current = false; }
  }

  return <section className={`speaking-recorder state-${state}`} aria-live="polite">
    <header><span><MaterialIcon name="mic" filled /></span><div><small>SPEAKING</small><strong>{state === "recording" ? "Gravando sua resposta" : state === "processing" ? "Analisando sua fala" : state === "result" ? "Sua fala" : "Grave sua resposta"}</strong></div>{state === "recording" && <b>● {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</b>}</header>
    {state === "ready" && <><p>Toque no botão quando estiver pronto. O microfone só será ativado com sua permissão.</p><button type="button" className="speaking-primary" onClick={() => void start()}><MaterialIcon name="mic" />Gravar resposta</button></>}
    {state === "permission" && <p role="status">Aguardando permissão para usar o microfone…</p>}
    {state === "recording" && <><div className="speaking-wave" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div><p>Fale com naturalidade. A gravação não será enviada sem sua confirmação.</p><button type="button" className="speaking-stop" onClick={stop}><MaterialIcon name="stop" filled />Parar gravação</button></>}
    {state === "preparing" && <p role="status">Preparando sua gravação no dispositivo…</p>}
    {state === "review" && <><p>Ouça antes de confirmar. A análise envia o áudio à OpenAI; não armazenamos sua gravação permanentemente.</p><audio src={audioUrl} controls preload="metadata" /><div className="speaking-actions"><button type="button" className="outline-button" onClick={reset}><MaterialIcon name="refresh" />Gravar novamente</button><button type="button" className="speaking-primary" onClick={() => void confirm()}><MaterialIcon name="check" />{recovering ? "Consultar análise" : "Confirmar gravação e analisar"}</button></div></>}
    {state === "processing" && <div className="speaking-processing"><MaterialIcon name="progress_activity" /><strong>Analisando conteúdo e pronúncia…</strong><small>O áudio bruto não é armazenado pelo aplicativo.</small></div>}
    {state === "result" && response && <><SpeakingFeedback evaluation={response.result} targetText={targetText} exerciseId={exerciseId} studentAudioUrl={audioUrl} /><button type="button" className="outline-button" onClick={reset}><MaterialIcon name="refresh" />Praticar novamente</button></>}
    {error && <p className="speaking-error" role="alert"><MaterialIcon name="error" />{error}</p>}
  </section>;
}
