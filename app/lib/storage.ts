import { assertSupabase, getStorageBucket, getSupabase } from "../../db/supabase";

export async function uploadObject(key: string, body: Blob | ArrayBuffer | Uint8Array | ReadableStream, contentType: string) {
  return assertSupabase(await getSupabase().storage.from(getStorageBucket()).upload(key, body, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  }));
}

export async function removeObject(key: string) {
  await removeStorageObject(key);
}

export async function removeStorageObject(key: string) {
  await getSupabase().storage.from(getStorageBucket()).remove([key]);
}

export async function objectInfo(key: string) {
  return assertSupabase(await getSupabase().storage.from(getStorageBucket()).info(key));
}

export async function serveObject(request: Request, key: string, cacheControl: string) {
  const storage = getSupabase().storage.from(getStorageBucket());
  const signed = await storage.createSignedUrl(key, 300);
  if (!signed.error) {
    const range = request.headers.get("range");
    const upstream = await fetch(signed.data.signedUrl, { headers: range ? { range } : undefined });
    if (upstream.ok) {
      const headers = new Headers();
      for (const name of ["accept-ranges", "content-length", "content-range", "content-type", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("cache-control", cacheControl);
      headers.set("x-content-type-options", "nosniff");
      return new Response(upstream.body, { status: upstream.status, headers });
    }
  }

  return null;
}
