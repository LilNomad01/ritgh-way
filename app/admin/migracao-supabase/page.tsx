"use client";

import { useState } from "react";

type SourceSummary = {
  tableCounts: Record<string, number>;
  mediaObjects: number;
  mediaBytes: number;
  unexpectedObjects: number;
};

type MigrationResponse = {
  ok?: boolean;
  error?: string;
  source?: SourceSummary;
  target?: { tableCounts?: Record<string, number> };
  migrated?: Record<string, number> | { key: string; size: number; skipped: boolean } | null;
  cursor?: string | null;
  done?: boolean;
};

async function requestMigration(token: string, action: string, cursor?: string | null) {
  const response = await fetch("/api/admin/migration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, action, cursor }),
    cache: "no-store",
  });
  const body = await response.json() as MigrationResponse;
  if (!response.ok || body.error) throw new Error(body.error || `Falha HTTP ${response.status}`);
  return body;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export default function SupabaseMigrationPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("Aguardando.");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SourceSummary | null>(null);
  const [mediaDone, setMediaDone] = useState(0);
  const [mediaBytes, setMediaBytes] = useState(0);

  async function verify() {
    if (!token.trim()) throw new Error("Informe o token temporário.");
    setStatus("Conferindo D1 e R2 de origem...");
    const response = await requestMigration(token.trim(), "summary");
    if (!response.source) throw new Error("A origem não retornou o inventário.");
    setSummary(response.source);
    setStatus(`Origem confirmada: ${Object.values(response.source.tableCounts).reduce((a, b) => a + b, 0)} linhas e ${response.source.mediaObjects} arquivos (${formatBytes(response.source.mediaBytes)}).`);
    return response.source;
  }

  async function migrateDatabase() {
    setStatus("Criando snapshot consistente do D1 e copiando para o Supabase...");
    const response = await requestMigration(token.trim(), "database");
    const migrated = response.migrated && !("key" in response.migrated) ? response.migrated : {};
    const rows = Object.values(migrated ?? {}).reduce((a, b) => a + Number(b), 0);
    setStatus(`Banco copiado: ${rows} linhas enviadas ao Supabase.`);
  }

  async function verifyTargetDatabase(expected: SourceSummary) {
    setStatus("Validando contagens do banco no Supabase...");
    const response = await requestMigration(token.trim(), "target");
    const targetCounts = response.target?.tableCounts;
    if (!targetCounts) throw new Error("O Supabase não retornou as contagens de destino.");

    const mismatches = Object.entries(expected.tableCounts)
      .filter(([table, count]) => Number(targetCounts[table] ?? -1) !== count)
      .map(([table, count]) => `${table}: origem ${count}, destino ${targetCounts[table] ?? "ausente"}`);

    if (mismatches.length) {
      throw new Error(`Contagens divergentes no Supabase: ${mismatches.join("; ")}`);
    }
    setStatus("Banco validado: as 18 tabelas têm exatamente as mesmas contagens da origem.");
  }

  async function migrateMedia(expected: SourceSummary) {
    let cursor: string | null | undefined = undefined;
    let count = 0;
    let bytes = 0;

    do {
      setStatus(`Copiando mídias: ${count}/${expected.mediaObjects} — ${formatBytes(bytes)}...`);
      const response = await requestMigration(token.trim(), "media", cursor);
      const migrated = response.migrated && "key" in response.migrated ? response.migrated : null;
      if (migrated) {
        count += 1;
        bytes += Number(migrated.size) || 0;
        setMediaDone(count);
        setMediaBytes(bytes);
      }
      cursor = response.cursor ?? null;
      if (response.done) break;
    } while (cursor);

    if (count !== expected.mediaObjects || bytes !== expected.mediaBytes) {
      throw new Error(`A cópia de mídia não bateu com a origem: ${count}/${expected.mediaObjects} arquivos e ${bytes}/${expected.mediaBytes} bytes.`);
    }
    setStatus(`Mídias copiadas: ${count} arquivos (${formatBytes(bytes)}).`);
  }

  async function runAll() {
    if (running) return;
    setRunning(true);
    setMediaDone(0);
    setMediaBytes(0);
    try {
      const source = await verify();
      if (source.unexpectedObjects > 0) {
        throw new Error(`Existem ${source.unexpectedObjects} objetos fora dos caminhos conhecidos. A migração foi interrompida para não perder nada.`);
      }
      await migrateDatabase();
      await verifyTargetDatabase(source);
      await migrateMedia(source);
      await verifyTargetDatabase(source);
      setStatus("Cópia e validação concluídas. O banco bate 1:1 e todas as mídias foram verificadas por tamanho.");
    } catch (error) {
      setStatus(`ERRO: ${error instanceof Error ? error.message : "Falha desconhecida."}`);
    } finally {
      setRunning(false);
    }
  }

  async function runVerify() {
    if (running) return;
    setRunning(true);
    try {
      await verify();
    } catch (error) {
      setStatus(`ERRO: ${error instanceof Error ? error.message : "Falha desconhecida."}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Migração Right Way → Supabase</h1>
      <p>Ferramenta temporária. A origem D1/R2 é somente leitura e não é apagada.</p>

      <label style={{ display: "block", marginTop: 24, fontWeight: 700 }}>
        Token temporário
      </label>
      <input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        autoComplete="off"
        disabled={running}
        style={{ width: "100%", padding: 12, marginTop: 8 }}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        <button onClick={runVerify} disabled={running || !token.trim()} style={{ padding: "12px 18px" }}>
          Conferir origem
        </button>
        <button onClick={runAll} disabled={running || !token.trim()} style={{ padding: "12px 18px", fontWeight: 700 }}>
          {running ? "Migrando..." : "Executar migração completa"}
        </button>
      </div>

      <section style={{ marginTop: 28, padding: 18, border: "1px solid #ddd", borderRadius: 10 }}>
        <strong>Status</strong>
        <p style={{ whiteSpace: "pre-wrap" }}>{status}</p>
        {summary && (
          <>
            <p>
              Origem: {Object.values(summary.tableCounts).reduce((a, b) => a + b, 0)} linhas • {summary.mediaObjects} arquivos • {formatBytes(summary.mediaBytes)}
            </p>
            <p>
              Mídia processada: {mediaDone}/{summary.mediaObjects} • {formatBytes(mediaBytes)}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
