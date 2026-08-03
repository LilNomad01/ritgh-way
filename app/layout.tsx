import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og-expanded.png`;

  return {
    title: "Right Way Online — Sua jornada no inglês",
    description: "Aulas, prática, nivelamento e evolução em uma experiência completa de inglês online.",
    icons: { icon: "/right-way-brand.png", shortcut: "/right-way-brand.png" },
    openGraph: {
      title: "Right Way Online — Inglês para a vida real",
      description: "Aulas, prática e evolução em um só lugar.",
      type: "website",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Right Way Online — Inglês para a vida real" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Right Way Online — Inglês para a vida real",
      description: "Aulas, prática e evolução em um só lugar.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
