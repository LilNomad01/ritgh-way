"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    const update = () => registration?.update().catch(() => undefined);

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((result) => {
      registration = result;
      update();
    }).catch(() => undefined);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return null;
}

export function InstallAppButton({ variant = "default" }: { variant?: "default" | "compact" }) {
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandalone());
  const [hint, setHint] = useState("");

  useEffect(() => {
    const promptHandler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPrompt);
      setHint("");
    };
    const installedHandler = () => {
      setInstalled(true);
      setPromptEvent(null);
      setHint("");
    };
    window.addEventListener("beforeinstallprompt", promptHandler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      if (choice.outcome === "accepted") setInstalled(true);
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    setHint(isIOS ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início." : isAndroid ? "No Chrome, abra o menu ⋮ e toque em Instalar aplicativo ou Adicionar à tela inicial." : "Abra o menu do navegador e escolha Instalar aplicativo.");
  }

  if (installed) return variant === "default" ? <div className="install-app installed"><span>✓</span><strong>APLICATIVO INSTALADO</strong></div> : null;

  return <div className={`install-app ${variant}`}><button onClick={install} aria-label="Instalar Right Way no celular"><span aria-hidden="true">↓</span>{variant === "compact" ? "Instalar app" : "INSTALAR NO ANDROID"}</button>{hint && <small role="status">{hint}</small>}</div>;
}
