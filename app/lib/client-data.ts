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

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function sessionProfile() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (response.ok) return response.json() as Promise<SessionData>;
  if (response.status !== 401) throw new Error(`Request failed: ${response.status}`);
  const refresh = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  if (!refresh.ok) throw new Error("anonymous");
  return readJson<SessionData>("/api/auth/session");
}

export function loadSessionProfile() {
  if (!sessionRequest) sessionRequest = sessionProfile().then(data => (sessionData = data)).catch(error => { sessionRequest = null; throw error; });
  return sessionRequest;
}

export function loadCourseData() {
  if (!courseRequest) courseRequest = readJson<CourseData>("/api/content").then(data => (courseData = data)).catch(error => { courseRequest = null; throw error; });
  return courseRequest;
}

export function loadDashboardData<T = unknown>() {
  if (!dashboardRequest) dashboardRequest = readJson<T>("/api/dashboard").then(data => (dashboardData = data)).catch(error => { dashboardRequest = null; throw error; });
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
  sessionRequest = null;
  sessionData = null;
  clearLearningClientCache();
}
