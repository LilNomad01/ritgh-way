import { Buffer } from "node:buffer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const STORAGE_CHUNK_SIZE = 6 * 1024 * 1024;

type ResumableState = {
  url: string;
  key: string;
  size: number;
};

const globalStorage = globalThis as typeof globalThis & {
  __rightWaySupabase?: SupabaseClient;
};

function config() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "course-media";
  if (!url || !secret) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured.");
  }
  return { url, secret, bucket };
}

function client() {
  const { url, secret } = config();
  globalStorage.__rightWaySupabase ??= createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return globalStorage.__rightWaySupabase;
}

function apiHeaders() {
  const { secret } = config();
  const headers: Record<string, string> = { apikey: secret };
  if (secret.startsWith("eyJ")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function storageOrigin() {
  const { url } = config();
  if (process.env.SUPABASE_STORAGE_URL) {
    return process.env.SUPABASE_STORAGE_URL.replace(/\/$/, "");
  }
  const parsed = new URL(url);
  const projectRef = parsed.hostname.split(".")[0];
  return `https://${projectRef}.storage.supabase.co`;
}

function encodeMetadata(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function encodeState(state: ResumableState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function decodeState(value: string): ResumableState {
  try {
    const state = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ResumableState;
    if (!state.url || !state.key || !Number.isFinite(state.size)) throw new Error("invalid state");
    return state;
  } catch {
    throw new Error("Upload resumível inválido ou expirado.");
  }
}

export async function uploadObject(
  key: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
  cacheControl = "3600"
) {
  const { bucket } = config();
  const { error } = await client().storage.from(bucket).upload(key, body, {
    contentType,
    cacheControl,
    upsert: false,
  });
  if (error) throw error;
}

export async function deleteObject(key: string) {
  const { bucket } = config();
  const { error } = await client().storage.from(bucket).remove([key]);
  if (error) throw error;
}

export async function signedObjectUrl(key: string, expiresIn = 300) {
  const { bucket } = config();
  const { data, error } = await client().storage.from(bucket).createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error("Arquivo não encontrado.");
  return data.signedUrl;
}

export async function fetchObject(key: string, range?: string | null) {
  const signedUrl = await signedObjectUrl(key, 300);
  const headers = new Headers();
  if (range) headers.set("range", range);
  return fetch(signedUrl, { headers, redirect: "follow", cache: "no-store" });
}

export async function createResumableUpload(
  key: string,
  size: number,
  contentType: string,
  cacheControl = "3600"
) {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Tamanho de arquivo inválido.");
  const { bucket } = config();
  const endpoint = `${storageOrigin()}/storage/v1/upload/resumable`;
  const metadata = [
    `bucketName ${encodeMetadata(bucket)}`,
    `objectName ${encodeMetadata(key)}`,
    `contentType ${encodeMetadata(contentType)}`,
    `cacheControl ${encodeMetadata(cacheControl)}`,
  ].join(",");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(size),
      "Upload-Metadata": metadata,
      "x-upsert": "false",
    },
  });

  if (!response.ok) {
    throw new Error(`Não foi possível iniciar o upload: ${response.status} ${await response.text()}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("O Supabase não retornou a URL do upload.");

  return {
    uploadId: encodeState({
      url: new URL(location, endpoint).toString(),
      key,
      size,
    }),
    chunkSize: STORAGE_CHUNK_SIZE,
  };
}

export async function uploadResumablePart(
  uploadId: string,
  partNumber: number,
  body: ReadableStream<Uint8Array> | ArrayBuffer | Blob
) {
  const state = decodeState(uploadId);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1) throw new Error("Parte de upload inválida.");

  const expectedOffset = (partNumber - 1) * STORAGE_CHUNK_SIZE;
  const response = await fetch(state.url, {
    method: "PATCH",
    headers: {
      ...apiHeaders(),
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": String(expectedOffset),
      "Content-Type": "application/offset+octet-stream",
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!response.ok) {
    throw new Error(`Falha ao enviar parte do arquivo: ${response.status} ${await response.text()}`);
  }

  const offset = Number(response.headers.get("upload-offset") || expectedOffset);
  return { partNumber, etag: String(offset) };
}

export async function completeResumableUpload(uploadId: string) {
  const state = decodeState(uploadId);
  const response = await fetch(state.url, {
    method: "HEAD",
    headers: {
      ...apiHeaders(),
      "Tus-Resumable": "1.0.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Não foi possível validar o upload: ${response.status}`);
  }

  const offset = Number(response.headers.get("upload-offset") || 0);
  if (offset !== state.size) {
    throw new Error(`Upload incompleto: ${offset} de ${state.size} bytes enviados.`);
  }

  return { key: state.key, size: state.size };
}

export async function abortResumableUpload(uploadId: string) {
  const state = decodeState(uploadId);
  const response = await fetch(state.url, {
    method: "DELETE",
    headers: {
      ...apiHeaders(),
      "Tus-Resumable": "1.0.0",
    },
  });
  if (!response.ok && ![404, 405, 410].includes(response.status)) {
    throw new Error(`Não foi possível cancelar o upload: ${response.status}`);
  }
}
