import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Right Way Online",
    short_name: "Right Way",
    description: "Inglês para a vida real, com trilhas personalizadas e prática diária.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#f8fafc",
    theme_color: "#071b43",
    categories: ["education", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Minhas aulas", short_name: "Aulas", description: "Continuar sua trilha de inglês", url: "/aulas", icons: [{ src: "/app-icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Praticar", short_name: "Praticar", description: "Abrir os exercícios disponíveis", url: "/praticar", icons: [{ src: "/app-icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
