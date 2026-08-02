// Scene context ("text data") captured alongside each frame.
// Used by the analyzer to calibrate counts into real-world density
// (persons/m²) and to apply Fruin Level-of-Service risk grading.

import { useEffect, useState } from "react";

export type EventType =
  | "unspecified"
  | "religious"
  | "concert"
  | "sports"
  | "transit"
  | "market"
  | "protest"
  | "street";

export interface SceneContext {
  venue: string;
  eventType: EventType;
  areaSqm: number | null; // observed area covered by the frame, m²
  capacity: number | null; // safe capacity of that area
  exits: number | null;
  timeOfDay: string; // free text, e.g. "18:30 peak hour"
  weather: string;
  notes: string; // free-form observations from the operator
}

export const EVENT_TYPES: { id: EventType; label: string; risk: number }[] = [
  { id: "unspecified", label: "Unspecified", risk: 0 },
  { id: "religious", label: "Religious gathering", risk: 0.1 },
  { id: "concert", label: "Concert / festival", risk: 0.12 },
  { id: "sports", label: "Sports event", risk: 0.08 },
  { id: "transit", label: "Transit hub", risk: 0.06 },
  { id: "market", label: "Market / bazaar", risk: 0.04 },
  { id: "protest", label: "Protest / rally", risk: 0.14 },
  { id: "street", label: "Street / public space", risk: 0.02 },
];

export const emptyContext: SceneContext = {
  venue: "",
  eventType: "unspecified",
  areaSqm: null,
  capacity: null,
  exits: null,
  timeOfDay: "",
  weather: "",
  notes: "",
};

const KEY = "cv_context";
const isBrowser = typeof window !== "undefined";

export function getContext(): SceneContext {
  if (!isBrowser) return emptyContext;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyContext, ...JSON.parse(raw) } : emptyContext;
  } catch {
    return emptyContext;
  }
}

export function saveContext(c: SceneContext) {
  if (!isBrowser) return;
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function useSceneContext() {
  const [ctx, setCtx] = useState<SceneContext>(emptyContext);
  useEffect(() => setCtx(getContext()), []);
  const update = (patch: Partial<SceneContext>) =>
    setCtx((c) => {
      const next = { ...c, ...patch };
      saveContext(next);
      return next;
    });
  return [ctx, update] as const;
}

export function hasContext(c?: SceneContext | null) {
  if (!c) return false;
  return Boolean(
    c.venue || c.notes || c.areaSqm || c.capacity || c.eventType !== "unspecified",
  );
}

/** Fruin Level of Service band from persons per square metre. */
export function fruinLos(personsPerSqm: number): {
  grade: "A" | "B" | "C" | "D" | "E" | "F";
  label: string;
} {
  if (personsPerSqm < 0.31) return { grade: "A", label: "Free flow" };
  if (personsPerSqm < 0.43) return { grade: "B", label: "Comfortable" };
  if (personsPerSqm < 0.72) return { grade: "C", label: "Constrained" };
  if (personsPerSqm < 1.08) return { grade: "D", label: "Restricted" };
  if (personsPerSqm < 2.17) return { grade: "E", label: "Congested" };
  return { grade: "F", label: "Critical / crush risk" };
}
