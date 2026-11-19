import type { CourseData } from "./course";

export type SessionProfile = {
  fullName: string;
  email: string;
  level: string;
  placementScore: number;
  goal?: string;
  dailyMinutes?: number;
  role?: "admin" | "student";
  mustChangePassword?: boolean;
};

type SessionData = { profile: SessionProfile };

let sessionRequest: Promise<SessionData> | null = null;
let courseRequest: Promise<CourseData> | null = null;
let dashboardRequest: Promise<unknown> | null = null;
let sessionData: SessionData | null = null;
let courseData: CourseData | null = null;
let dashboardData: unknown = null;
let authGeneration = 0;
let refreshVersion = 0;
let refreshRequest: Promise<void> | null = null;

function assertCurrentSession(generation: number) {
  if (generation !== authGeneration) throw new Error("Sessão alterada. Tente novamente.");
}

function expireSession(notify: boolean): never {
  clearPrivateClientCache();
  if (notify && typeof window !== "undefined") window.dispatchEvent(new Event("rightway:session-expired"));
  throw new Error("Sua sessão expirou. Entre novamente para continuar.");
}

function refreshSession(generation: number, notify: boolean) {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const response = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      assertCurrentSession(generation);
      if (response.status === 401) expireSession(notify);
      if (!response.ok) throw new Error("Não foi possível renovar sua sessão. Tente novamente.");
      refreshVersion++;
    })().finally(() => { if (generation === authGeneration) refreshRequest = null; });
  }
  return refreshRequest;
}

export async function authenticatedFetch(url: string, init?: RequestInit) {
  const generation = authGeneration;
  const version = refreshVersion;
  const notify = url !== "/api/auth/session" || sessionData !== null;
  const options = { ...init, credentials: "same-origin" as const };
  let response = await fetch(url, options);
  assertCurrentSession(generation);
  if (response.status === 401) {
    init?.signal?.throwIfAborted();
    if (version === refreshVersion) await refreshSession(generation, notify);
    assertCurrentSession(generation);
    // Protected routes reject expired auth before any mutation; retry only once.
    response = await fetch(url, options);
    assertCurrentSession(generation);
    if (response.status === 401) expireSession(notify);
  }
  return response;
}

export async function readJson<T>(url: string): Promise<T> {
  const response = await authenticatedFetch(url, { cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof error?.error === "string" ? error.error : `Não foi possível carregar os dados (${response.status}). Tente novamente.`);
  }
  try { return await response.json() as T; }
  catch { throw new Error("O servidor retornou uma resposta inválida. Tente novamente."); }
}

export function loadSessionProfile() {
  const generation = authGeneration;
  if (!sessionRequest) sessionRequest = readJson<SessionData>("/api/auth/session").then(data => { assertCurrentSession(generation); return sessionData = data; }).catch(error => { if (generation === authGeneration) sessionRequest = null; throw error; });
  return sessionRequest;
}

export function loadCourseData() {
  const generation = authGeneration;
  if (!courseRequest) courseRequest = readJson<CourseData>("/api/content").then(data => { assertCurrentSession(generation); return courseData = data; }).catch(error => { if (generation === authGeneration) courseRequest = null; throw error; });
  return courseRequest;
}

export function loadDashboardData<T = unknown>() {
  const generation = authGeneration;
  if (!dashboardRequest) dashboardRequest = readJson<T>("/api/dashboard").then(data => { assertCurrentSession(generation); return dashboardData = data; }).catch(error => { if (generation === authGeneration) dashboardRequest = null; throw error; });
  return dashboardRequest as Promise<T>;
}

export const getCachedSessionProfile = () => sessionData;
export const getCachedCourseData = () => courseData;
export const getCachedDashboardData = <T = unknown>() => dashboardData as T | null;

export function clearLearningClientCache() {
  courseRequest = null;
  courseData = null;
  dashboardRequest = null;
  dashboardData = null;
}

export function clearPrivateClientCache() {
  authGeneration++;
  refreshRequest = null;
  sessionRequest = null;
  sessionData = null;
  clearLearningClientCache();
}
