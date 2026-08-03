import type { Metadata } from "next";
import { headers } from "next/headers";
import { PwaRegister } from "./components/PwaSupport";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/right-way-secure-app.png`;

  return {
    title: "Right Way Online — Sua jornada no inglês",
    description: "Aprenda inglês com exercícios inteligentes, progresso real e acesso seguro no celular.",
    icons: { icon: "/app-icon.svg", shortcut: "/app-icon.svg", apple: "/app-icon.svg" },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Right Way" },
    openGraph: {
      title: "Right Way Online — Inglês para a vida real",
      description: "Inglês de verdade. Progresso seguro.",
      type: "website",
      images: [{ url: socialImage, width: 1729, height: 910, alt: "Right Way Online — Inglês de verdade com progresso seguro" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Right Way Online — Inglês para a vida real",
      description: "Inglês de verdade. Progresso seguro.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}><PwaRegister />{children}</body>
    </html>
  );
}
