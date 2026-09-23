import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { assertSameOrigin, requireAdmin } from "../../../lib/auth";

export const dynamic = "force-dynamic";

const BRIDGE_URL = "https://xmkykvxeifanohmdghji.supabase.co/functions/v1/right-way-migration-bridge";
const STORAGE_ENDPOINT = "https://xmkykvxeifanohmdghji.storage.supabase.co/storage/v1/upload/resumable";
const STORAGE_BUCKET = "course-media";
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

const TABLES = [
  "students",
  "course_modules",
  "course_sections",
  "lessons",
  "lesson_exercises",
  "user_accounts",
  "auth_sessions",
  "login_attempts",
  "placement_attempts",
  "lesson_progress",
  "exercise_attempts",
  "practice_sessions",
  "video_progress",
  "section_exams",
  "section_exam_questions",
  "section_exam_attempts",
  "lesson_videos",
  "video_item_progress",
] as const;

type TableName = typeof TABLES[number];

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function bridge(token: string, payload: Record<string, unknown>) {
  const response = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-migration-token": token,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : `Supabase bridge failed with ${response.status}.`);
  }
  return result;
}

function encodeMetadata(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function startSignedTusUpload(
  token: string,
  key: string,
  size: number,
  contentType: string,
  cacheControl: string,
) {
  const signed = await bridge(token, { action: "sign-upload", key });
  const signature = typeof signed.token === "string" ? signed.token : "";
  if (!signature) throw new Error(`Supabase did not return an upload token for ${key}.`);

  const metadata = [
    `bucketName ${encodeMetadata(STORAGE_BUCKET)}`,
    `objectName ${encodeMetadata(key)}`,
    `contentType ${encodeMetadata(contentType)}`,
    `cacheControl ${encodeMetadata(cacheControl)}`,
  ].join(",");

  const response = await fetch(STORAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(size),
      "Upload-Metadata": metadata,
      "x-signature": signature,
      "x-upsert": "false",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not start upload for ${key}: ${response.status} ${await response.text()}.`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error(`Supabase did not return a TUS location for ${key}.`);
  return {
    signature,
    uploadUrl: new URL(location, STORAGE_ENDPOINT).toString(),
  };
}

async function uploadR2Object(token: string, key: string, size: number, contentType: string, cacheControl: string) {
  const info = await bridge(token, { action: "object-info", key });
  if (info.exists) {
    const targetSize = Number(info.size ?? 0);
    if (targetSize === size) return { skipped: true, bytes: size };
    throw new Error(`Target already contains ${key} with a different size (${targetSize} vs ${size}).`);
  }

  const bucket = env.VIDEOS as R2Bucket;
  const { signature, uploadUrl } = await startSignedTusUpload(token, key, size, contentType, cacheControl);

  let offset = 0;
  while (offset < size) {
    const length = Math.min(TUS_CHUNK_SIZE, size - offset);
    const source = await bucket.get(key, { range: { offset, length } });
    if (!source) throw new Error(`R2 object disappeared during migration: ${key}.`);
    const bytes = await source.arrayBuffer();
    if (bytes.byteLength !== length) {
      throw new Error(`Unexpected R2 range length for ${key}: ${bytes.byteLength} vs ${length}.`);
    }

    const response = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "x-signature": signature,
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new Error(`Upload failed for ${key} at ${offset}: ${response.status} ${await response.text()}.`);
    }

    const nextOffset = Number(response.headers.get("upload-offset") ?? offset + bytes.byteLength);
    if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
      throw new Error(`Invalid Supabase upload offset for ${key}.`);
    }
    offset = nextOffset;
  }

  const verify = await bridge(token, { action: "object-info", key });
  const targetSize = Number(verify.size ?? 0);
  if (!verify.exists || targetSize !== size) {
    throw new Error(`Upload verification failed for ${key}: target size ${targetSize}, expected ${size}.`);
  }
  return { skipped: false, bytes: size };
}

async function sourceSummary() {
  const db = getD1();
  const countStatements = TABLES.map(table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`));
  const counts = await db.batch(countStatements);
  const tableCounts = Object.fromEntries(
    TABLES.map((table, index) => [table, Number((counts[index].results[0] as { count?: number } | undefined)?.count ?? 0)])
  );

  const bucket = env.VIDEOS as R2Bucket;
  let cursor: string | undefined;
  let mediaObjects = 0;
  let mediaBytes = 0;
  let unexpectedObjects = 0;

  do {
    const page = await bucket.list({
      limit: 1000,
      cursor,
      include: ["httpMetadata", "customMetadata"],
    });
    for (const object of page.objects) {
      mediaObjects += 1;
      mediaBytes += object.size;
      if (!object.key.startsWith("lessons/") && !object.key.startsWith("covers/") && !object.key.startsWith("audio/")) {
        unexpectedObjects += 1;
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { tableCounts, mediaObjects, mediaBytes, unexpectedObjects };
}

async function migrateDatabase(token: string) {
  await bridge(token, { action: "health" });

  const db = getD1();
  const statements = TABLES.map(table => db.prepare(`SELECT * FROM ${table}`));
  const snapshot = await db.batch(statements);
  const migrated: Record<string, number> = {};

  for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex += 1) {
    const table = TABLES[tableIndex];
    const rows = snapshot[tableIndex].results as Record<string, unknown>[];
    migrated[table] = rows.length;

    for (let start = 0; start < rows.length; start += 100) {
      await bridge(token, {
        action: "rows",
        table,
        rows: rows.slice(start, start + 100),
      });
    }
  }

  return migrated;
}

async function migrateOneMediaObject(token: string, cursor?: string) {
  await bridge(token, { action: "health" });

  const bucket = env.VIDEOS as R2Bucket;
  const page = await bucket.list({
    limit: 1,
    cursor,
    include: ["httpMetadata", "customMetadata"],
  });

  const object = page.objects[0];
  if (!object) {
    return { done: true, cursor: null, migrated: null };
  }

  const key = object.key;
  if (!key.startsWith("lessons/") && !key.startsWith("covers/") && !key.startsWith("audio/")) {
    throw new Error(`Unexpected R2 object path found: ${key}. Migration stopped instead of silently skipping it.`);
  }

  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  const cacheControl = object.httpMetadata?.cacheControl || "3600";
  const uploaded = await uploadR2Object(token, key, object.size, contentType, cacheControl);

  return {
    done: !page.truncated,
    cursor: page.truncated ? page.cursor : null,
    migrated: {
      key,
      size: object.size,
      skipped: uploaded.skipped,
    },
  };
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return json({ error: "Origem não autorizada." }, 403);
    const auth = await requireAdmin(request);
    if (auth instanceof Response) return auth;

    const payload = await request.json() as {
      action?: string;
      token?: string;
      cursor?: string | null;
    };
    const token = payload.token?.trim() ?? "";
    if (!token) return json({ error: "Informe o token temporário da migração." }, 400);

    if (payload.action === "summary") {
      await bridge(token, { action: "health" });
      return json({ ok: true, source: await sourceSummary() });
    }

    if (payload.action === "database") {
      return json({ ok: true, migrated: await migrateDatabase(token) });
    }

    if (payload.action === "target") {
      return json({ ok: true, target: await bridge(token, { action: "target-summary" }) });
    }

    if (payload.action === "media") {
      return json({ ok: true, ...(await migrateOneMediaObject(token, payload.cursor ?? undefined)) });
    }

    return json({ error: "Ação de migração inválida." }, 400);
  } catch (error) {
    console.error("Right Way migration bridge failed", error);
    return json({ error: error instanceof Error ? error.message : "Falha na migração." }, 500);
  }
}
