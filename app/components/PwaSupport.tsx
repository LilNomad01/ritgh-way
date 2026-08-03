"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null);
  const [hint, setHint] = useState("");

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setHint(isIOS ? "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”." : "Abra o menu do navegador e escolha “Instalar aplicativo”.");
  }

  return <div className="install-app"><button onClick={install}><span>↓</span> INSTALAR NO CELULAR</button>{hint && <small>{hint}</small>}</div>;
}
