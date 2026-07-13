// Simple localStorage-backed store for the CrowdVision demo.
// In production, swap for Lovable Cloud (Supabase) tables.

export type RiskLevel = "Low" | "Medium" | "High";

export interface Analysis {
  id: string;
  fileName: string;
  fileType: "image" | "video";
  imageDataUrl: string; // preview thumbnail (data URL)
  peopleCount: number;
  density: number; // people per 100 sq units
  densityLabel: RiskLevel;
  risk: RiskLevel;
  riskScore: number; // 0-100
  zones: { id: string; count: number; level: RiskLevel }[];
  prediction: { horizonMin: number; expectedCount: number; expectedRisk: RiskLevel };
  recommendations: string[];
  createdAt: string; // ISO
}

export interface User {
  email: string;
  name: string;
  role: "admin" | "user";
}

const KEYS = {
  user: "cv_user",
  analyses: "cv_analyses",
  theme: "cv_theme",
};

const isBrowser = typeof window !== "undefined";

export function getUser(): User | null {
  if (!isBrowser) return null;
  const raw = localStorage.getItem(KEYS.user);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function setUser(u: User | null) {
  if (!isBrowser) return;
  if (u) localStorage.setItem(KEYS.user, JSON.stringify(u));
  else localStorage.removeItem(KEYS.user);
}

export function getAnalyses(): Analysis[] {
  if (!isBrowser) return [];
  const raw = localStorage.getItem(KEYS.analyses);
  return raw ? (JSON.parse(raw) as Analysis[]) : [];
}

export function saveAnalysis(a: Analysis) {
  if (!isBrowser) return;
  const all = getAnalyses();
  all.unshift(a);
  // keep last 100
  localStorage.setItem(KEYS.analyses, JSON.stringify(all.slice(0, 100)));
}

export function clearAnalyses() {
  if (!isBrowser) return;
  localStorage.removeItem(KEYS.analyses);
}

export function getTheme(): "light" | "dark" {
  if (!isBrowser) return "light";
  return (localStorage.getItem(KEYS.theme) as "light" | "dark") || "light";
}

export function setTheme(t: "light" | "dark") {
  if (!isBrowser) return;
  localStorage.setItem(KEYS.theme, t);
  document.documentElement.classList.toggle("dark", t === "dark");
}
