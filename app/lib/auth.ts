import { env } from "cloudflare:workers";
import { getD1 } from "../../db";

const encoder = new TextEncoder();
const ACCESS_COOKIE = "rw_access";
const REFRESH_COOKIE = "rw_refresh";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SCHEME = "pbkdf2-sha256";

type RuntimeSecrets = {
  AUTH_JWT_SECRET?: string;
  ROOT_ADMIN_EMAIL?: string;
  ROOT_ADMIN_PASSWORD_HASH?: string;
  ROOT_ADMIN_PASSWORD_SALT?: string;
};

export type AuthClaims = {
  sub: number;
  email: string;
  fullName: string;
  role: "admin" | "student";
  ver: number;
  iat: number;
  exp: number;
  jti: string;
};

function secrets() {
  return env as unknown as RuntimeSecrets;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToString(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return decodeURIComponent(Array.from(atob(normalized)).map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
}

async function hmac(value: string) {
  const secret = secrets().AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not configured.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function signAccessToken(input: Omit<AuthClaims, "iat" | "exp" | "jti">) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthClaims = { ...input, iat: now, exp: now + ACCESS_TTL_SECONDS, jti: crypto.randomUUID() };
  const unsigned = `${stringToBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${stringToBase64Url(JSON.stringify(payload))}`;
  return `${unsigned}.${bytesToBase64Url(await hmac(unsigned))}`;
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyAccessToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const signature = bytesToBase64Url(await hmac(`${parts[0]}.${parts[1]}`));
  if (!safeEqual(signature, parts[2])) return null;
  try {
    const claims = JSON.parse(base64UrlToString(parts[1])) as AuthClaims;
    if (!claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

async function derivePasswordHash(password: string, salt: string, iterations: number) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations }, material, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export function passwordPolicyError(password: string) {
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.";
  }
  return null;
}

export async function hashPassword(password: string, salt: string) {
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${hash}`;
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const parts = expectedHash.split("$");
  const encoded = parts.length === 3 && parts[0] === PASSWORD_SCHEME;
  const iterations = encoded ? Number(parts[1]) : PASSWORD_ITERATIONS;
  const hash = encoded ? parts[2] : expectedHash;
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PASSWORD_ITERATIONS || !hash) return false;
  try {
    return safeEqual(await derivePasswordHash(password, salt, iterations), hash);
  } catch {
    return false;
  }
}

export function randomSecret(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashToken(value: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function parseCookies(request: Request) {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return cookies;
}

export function getRefreshToken(request: Request) {
  return parseCookies(request).get(REFRESH_COOKIE) ?? "";
}

export async function getAuthUser(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer ?? parseCookies(request).get(ACCESS_COOKIE);
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const account = await getD1().prepare("SELECT token_version AS tokenVersion, status FROM user_accounts WHERE id = ? LIMIT 1").bind(claims.sub).first<{ tokenVersion: number; status: string }>();
  if (!account || account.status !== "active" || account.tokenVersion !== claims.ver) return null;
  return claims;
}

export async function requireAuth(request: Request) {
  const user = await getAuthUser(request);
  return user ?? Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
}

export async function requireAdmin(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  return user;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return new URL(origin).host === new URL(request.url).host;
}

export async function ensureAuthSchema() {
  // Schema changes are deployed from versioned migrations, never from request handlers.
  return getD1();
}

export async function issueSession(request: Request, account: { id: number; email: string; fullName: string; role: "admin" | "student"; tokenVersion: number }) {
  const db = await ensureAuthSchema();
  const accessToken = await signAccessToken({ sub: account.id, email: account.email, fullName: account.fullName, role: account.role, ver: account.tokenVersion });
  const sessionId = crypto.randomUUID();
  const refreshSecret = randomSecret(40);
  const refreshToken = `${sessionId}.${refreshSecret}`;
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const ipHash = await hashToken(`${ip}:${secrets().AUTH_JWT_SECRET ?? ""}`);
  await db.prepare("INSERT INTO auth_sessions (id, user_id, refresh_token_hash, ip_hash, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(sessionId, account.id, await hashToken(refreshToken), ipHash, (request.headers.get("user-agent") ?? "").slice(0, 300), expiresAt, new Date().toISOString()).run();
  return {
    accessToken,
    refreshToken,
    cookies: [
      `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ACCESS_TTL_SECONDS}`,
      `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${REFRESH_TTL_SECONDS}`,
    ],
  };
}

export function clearSessionCookies() {
  return [`${ACCESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`, `${REFRESH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`];
}

export function rootAdminConfig() {
  const runtime = secrets();
  return { email: runtime.ROOT_ADMIN_EMAIL?.toLowerCase() ?? "", passwordHash: runtime.ROOT_ADMIN_PASSWORD_HASH ?? "", passwordSalt: runtime.ROOT_ADMIN_PASSWORD_SALT ?? "" };
}
