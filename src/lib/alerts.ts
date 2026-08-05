/**
 * CPRI — Crowd Pressure & Risk Index (novel algorithm, CrowdVision AI).
 *
 * Existing crowd-safety literature either counts people (YOLO-family
 * detectors) or grades static density (Fruin Level-of-Service). Neither
 * captures the *compound* nature of a crush: a hazard emerges when high
 * density, unstable motion texture, weak egress and over-occupancy occur
 * together, not when any single one is high.
 *
 * CPRI therefore aggregates four normalised sub-indices with a WEIGHTED
 * GEOMETRIC MEAN instead of the usual weighted sum. A geometric mean is
 * multiplicatively penalising: a near-zero sub-index pulls the whole index
 * down (a sparse crowd cannot crush), while a single critical sub-index is
 * not averaged away by three benign ones once it approaches 1. An
 * escalation term derived from the short-horizon growth forecast then
 * shifts the index forward in time, so the alert fires before the venue
 * actually reaches the critical state.
 *
 *   D  Density stress      = min(1, persons_per_sqm / 4.0)      (Fruin LOS F ≈ 4)
 *   T  Kinetic turbulence  = isotropy x micro-texture busyness  (HOG-lite x LBP)
 *   E  Egress deficit      = min(1, people / (exits x 250))     (egress guideline)
 *   O  Occupancy load      = min(1, people / safe_capacity)
 *
 *   CPRI = 100 x ( Π (eps + Si)^wi ) x (1 + 0.25 x escalation)
 *
 * Weights (w) are renormalised over the sub-indices actually observable for
 * a given frame, so CPRI degrades gracefully when the operator supplies no
 * scene-context text data.
 */

export type CpriBand = "Safe" | "Watch" | "Elevated" | "Critical" | "Red";

export interface CpriInput {
  personsPerSqm: number | null;
  occupancy: number | null; // 0..n (1 = at capacity)
  people: number;
  exits: number | null;
  orient: number; // HOG-lite isotropy 0..1
  lbp: number; // LBP busyness 0..1
  visionScore: number; // fused vision/ensemble risk 0..1
  growth: number; // predicted multiplier over horizon (e.g. 1.2)
}

export interface CpriResult {
  cpri: number; // 0..100
  band: CpriBand;
  sub: { density: number; turbulence: number; egress: number; occupancy: number };
  escalation: number;
}

const EPS = 0.06;

export function computeCpri(i: CpriInput): CpriResult {
  const density =
    i.personsPerSqm != null
      ? Math.min(1, i.personsPerSqm / 4)
      : Math.min(1, i.visionScore); // vision fallback
  const turbulence = Math.min(1, Math.sqrt(Math.max(0, i.orient * i.lbp)) * 1.15);
  const egress =
    i.exits && i.exits > 0 ? Math.min(1, i.people / (i.exits * 250)) : null;
  const occupancy = i.occupancy != null ? Math.min(1.2, i.occupancy) / 1.2 : null;

  const terms: { v: number; w: number }[] = [
    { v: density, w: 0.4 },
    { v: turbulence, w: 0.2 },
  ];
  if (egress != null) terms.push({ v: egress, w: 0.2 });
  if (occupancy != null) terms.push({ v: occupancy, w: 0.2 });

  const wSum = terms.reduce((s, t) => s + t.w, 0);
  let logSum = 0;
  for (const t of terms) logSum += (t.w / wSum) * Math.log(EPS + t.v);
  const geo = Math.exp(logSum);

  const escalation = Math.max(0, Math.min(1, i.growth - 1));
  const cpri = Math.max(
    0,
    Math.min(100, Math.round(geo * 100 * (1 + 0.25 * escalation))),
  );

  return {
    cpri,
    band: cpriBand(cpri),
    sub: {
      density: +density.toFixed(3),
      turbulence: +turbulence.toFixed(3),
      egress: egress != null ? +egress.toFixed(3) : 0,
      occupancy: occupancy != null ? +occupancy.toFixed(3) : 0,
    },
    escalation: +escalation.toFixed(3),
  };
}

export function cpriBand(cpri: number): CpriBand {
  if (cpri < 20) return "Safe";
  if (cpri < 40) return "Watch";
  if (cpri < 60) return "Elevated";
  if (cpri < 78) return "Critical";
  return "Red";
}

// ---------------- Alert / recommendation catalogue ----------------

export const ALERTS = {
  redAlert: "🚨 Red Alert Activated",
  suspendEntry: "🚷 Suspend Entry Immediately",
  evacuate: "🚪 Emergency Evacuation Required",
  protectLife: "🛡️ Protect Human Life",
  security: "👮 Rapid Security Deployment",
  medical: "🚑 Medical Response Activated",
  broadcast: "📢 Emergency Broadcast Initiated",
  redirect: "↔️ Redirect to Safe Zone",
  zoneSecured: "🚧 Critical Zone Secured",
  lifeFirst: "❤️ Life Safety First",
} as const;

export interface AlertContext {
  risk: "Low" | "Medium" | "High";
  cpri: number;
  band: CpriBand;
  personsPerSqm: number | null;
  occupancy: number | null;
  losGrade?: string;
  exitsDeficit: boolean;
  escalating: boolean;
  people: number;
}

/**
 * Rule-based decision-support layer on top of CPRI. Every alert string is
 * emitted with the exact operator-facing wording used in the field SOP so
 * the console, PDF report and CSV export stay consistent.
 */
export function buildAlerts(c: AlertContext): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };

  if (c.band === "Red" || (c.risk === "High" && c.cpri >= 70)) {
    push(ALERTS.redAlert);
    push(ALERTS.suspendEntry);
    push(ALERTS.evacuate);
    push(ALERTS.protectLife);
    push(ALERTS.security);
    push(ALERTS.medical);
    push(ALERTS.broadcast);
    push(ALERTS.redirect);
    push(ALERTS.zoneSecured);
    push(ALERTS.lifeFirst);
    return out;
  }

  if (c.band === "Critical" || c.risk === "High") {
    push(ALERTS.redAlert);
    push(ALERTS.suspendEntry);
    push(ALERTS.security);
    push(ALERTS.medical);
    push(ALERTS.redirect);
    push(ALERTS.lifeFirst);
  }

  if (c.losGrade === "E" || c.losGrade === "F") {
    push(ALERTS.suspendEntry);
    push(ALERTS.protectLife);
  }
  if (c.personsPerSqm != null && c.personsPerSqm >= 4) {
    push(ALERTS.evacuate);
    push(ALERTS.zoneSecured);
  }
  if (c.occupancy != null && c.occupancy > 1) {
    push(ALERTS.suspendEntry);
    push(ALERTS.broadcast);
  }
  if (c.exitsDeficit) {
    push(ALERTS.redirect);
    push(ALERTS.zoneSecured);
  }
  if (c.escalating && (c.band === "Elevated" || c.risk === "Medium")) {
    push(ALERTS.broadcast);
    push(ALERTS.security);
  }
  if (c.band === "Elevated" || c.risk === "Medium") {
    push(ALERTS.security);
    push(ALERTS.redirect);
  }

  if (out.length === 0) push(ALERTS.lifeFirst);
  return out;
}

/**
 * Full recommendation text for each alert, used in the report body.
 */
export const ALERT_ACTIONS: Record<string, string> = {
  [ALERTS.redAlert]:
    "🚨 Red Alert Activated — crowd pressure index has crossed the critical threshold; activate the incident command protocol and notify local authorities now.",
  [ALERTS.suspendEntry]:
    "🚷 Suspend Entry Immediately — close all inbound gates and turnstiles until measured density falls below 2.0 persons/m².",
  [ALERTS.evacuate]:
    "🚪 Emergency Evacuation Required — begin phased evacuation from the highest-density zones along pre-planned dispersal routes.",
  [ALERTS.protectLife]:
    "🛡️ Protect Human Life — prioritise decompression of the crush zone over event continuity; stop the programme if necessary.",
  [ALERTS.security]:
    "👮 Rapid Security Deployment — move additional marshals to the hotspot zones and form lateral relief lanes.",
  [ALERTS.medical]:
    "🚑 Medical Response Activated — position ambulance and first-aid teams at the nearest access point with a clear extraction corridor.",
  [ALERTS.broadcast]:
    "📢 Emergency Broadcast Initiated — issue calm, repeated PA and digital-signage instructions directing movement away from the pressure point.",
  [ALERTS.redirect]:
    "↔️ Redirect to Safe Zone — open alternate exits and guide flow toward the designated low-density holding areas.",
  [ALERTS.zoneSecured]:
    "🚧 Critical Zone Secured — barrier off the affected zone and prevent re-entry until conditions normalise.",
  [ALERTS.lifeFirst]:
    "❤️ Life Safety First — maintain continuous monitoring; every decision is taken with life safety as the overriding priority.",
};
