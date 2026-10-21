import { env } from "cloudflare:workers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function hasSupabase() {
  const values = env as unknown as Record<string, string | undefined>;
  return Boolean(values.SUPABASE_URL && values.SUPABASE_SECRET_KEY);
}

export function getSupabase() {
  if (client) return client;
  const values = env as unknown as Record<string, string | undefined>;
  const url = values.SUPABASE_URL;
  const secret = values.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("O Supabase não está configurado no ambiente do servidor.");
  client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "right-way-online" } },
  });
  return client;
}

export function getStorageBucket() {
  const values = env as unknown as Record<string, string | undefined>;
  return values.SUPABASE_STORAGE_BUCKET || "course-media";
}

export function getStorageUploadEndpoint() {
  const values = env as unknown as Record<string, string | undefined>;
  const url = new URL(values.SUPABASE_URL || "https://invalid.supabase.co");
  const projectId = url.hostname.split(".")[0];
  if (!values.SUPABASE_URL || !projectId) throw new Error("O Supabase Storage não está configurado.");
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
}

export function assertSupabase<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`);
  return result.data;
}
