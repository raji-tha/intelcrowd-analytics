// Simple localStorage-backed store for the CrowdVision demo, with a small
// pub/sub layer so components re-render when analyses/user/theme change.
// In production, swap for Lovable Cloud (Supabase) tables.

import { useEffect, useState } from "react";

export type RiskLevel = "Low" | "Medium" | "High";

export interface Analysis {
  id: string;
  fileName: string;
  fileType: "image" | "video";
  imageDataUrl: string;
  peopleCount: number;
  density: number;
  densityLabel: RiskLevel;
  risk: RiskLevel;
  riskScore: number;
  zones: { id: string; count: number; level: RiskLevel }[];
  prediction: { horizonMin: number; expectedCount: number; expectedRisk: RiskLevel };
  recommendations: string[];
  createdAt: string;
  // Optional metadata surfaced by the ensemble analyzer.
  confidence?: number;
  features?: { edge: number; entropy: number; midtone: number; brightness: number };
  model?: string;
  // Explainability breakdown (Phase 2).
  explain?: {
    subModels: { rf: number; xgb: number; dt: number };
    contributions: Record<string, number>;
    features: {
      edge: number;
      entropy: number;
      midtone: number;
      brightness: number;
      variance: number;
      contrast: number;
    };
  };
  // Real AI vision verification (Phase 1).
  verified?: boolean;
  aiCount?: number;
  aiDescription?: string;
  aiConfidence?: number;
  aiDensity?: RiskLevel;
  // Scene-context calibration (operator-entered text data).
  scaleEstimate?: number;
  personsPerSqm?: number;
  occupancy?: number;
  losGrade?: "A" | "B" | "C" | "D" | "E" | "F";
  losLabel?: string;
  context?: import("./context").SceneContext;
  // CPRI — Crowd Pressure & Risk Index (novel algorithm).
  cpri?: number;
  cpriBand?: import("./alerts").CpriBand;
  cpriSub?: { density: number; turbulence: number; egress: number; occupancy: number };
  alerts?: string[];
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

// ---- tiny reactive layer ----
type Key = keyof typeof KEYS;
const listeners = new Map<Key, Set<() => void>>();
function emit(k: Key) {
  listeners.get(k)?.forEach((fn) => fn());
}
function subscribe(k: Key, fn: () => void) {
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(fn);
  return () => listeners.get(k)!.delete(fn);
}
if (isBrowser) {
  window.addEventListener("storage", (e) => {
    if (e.key === KEYS.user) emit("user");
    if (e.key === KEYS.analyses) emit("analyses");
    if (e.key === KEYS.theme) emit("theme");
  });
}

// ---- user ----
export function getUser(): User | null {
  if (!isBrowser) return null;
  const raw = localStorage.getItem(KEYS.user);
  return raw ? (JSON.parse(raw) as User) : null;
}
export function setUser(u: User | null) {
  if (!isBrowser) return;
  if (u) localStorage.setItem(KEYS.user, JSON.stringify(u));
  else localStorage.removeItem(KEYS.user);
  emit("user");
}
export function useUser() {
  // Start null so SSR and the first client render match, then hydrate.
  const [u, setU] = useState<User | null>(null);
  useEffect(() => {
    setU(getUser());
    const un = subscribe("user", () => setU(getUser()));
    return () => { un(); };
  }, []);
  return u;
}

// ---- analyses ----
export function getAnalyses(): Analysis[] {
  if (!isBrowser) return [];
  const raw = localStorage.getItem(KEYS.analyses);
  return raw ? (JSON.parse(raw) as Analysis[]) : [];
}
export function saveAnalysis(a: Analysis) {
  if (!isBrowser) return;
  const all = getAnalyses();
  all.unshift(a);
  localStorage.setItem(KEYS.analyses, JSON.stringify(all.slice(0, 100)));
  emit("analyses");
}
export function deleteAnalysis(id: string) {
  if (!isBrowser) return;
  const all = getAnalyses().filter((a) => a.id !== id);
  localStorage.setItem(KEYS.analyses, JSON.stringify(all));
  emit("analyses");
}
export function updateAnalysis(id: string, patch: Partial<Analysis>) {
  if (!isBrowser) return;
  const all = getAnalyses();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  localStorage.setItem(KEYS.analyses, JSON.stringify(all));
  emit("analyses");
}
export function clearAnalyses() {
  if (!isBrowser) return;
  localStorage.removeItem(KEYS.analyses);
  emit("analyses");
}
export function useAnalyses() {
  // Start empty so SSR and the first client render match, then hydrate.
  const [a, setA] = useState<Analysis[]>([]);
  useEffect(() => {
    setA(getAnalyses());
    const un = subscribe("analyses", () => setA(getAnalyses()));
    return () => { un(); };
  }, []);
  return a;
}

// ---- theme ----
export function getTheme(): "light" | "dark" {
  if (!isBrowser) return "light";
  return (localStorage.getItem(KEYS.theme) as "light" | "dark") || "light";
}
export function setTheme(t: "light" | "dark") {
  if (!isBrowser) return;
  localStorage.setItem(KEYS.theme, t);
  document.documentElement.classList.toggle("dark", t === "dark");
  emit("theme");
}
