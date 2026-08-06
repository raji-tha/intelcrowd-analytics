"""
CPRI — Crowd Pressure & Risk Index (novel compound algorithm).

Instead of a weighted sum, CPRI aggregates four normalised sub-indices with
a WEIGHTED GEOMETRIC MEAN, which is multiplicatively penalising: a sparse
crowd cannot crush (near-zero sub-index drags the index down), while a
single critical sub-index is not averaged away once it approaches 1. A
forecast-derived escalation term shifts the index forward in time so alerts
fire before the venue actually reaches the critical state.

    D  Density stress     = min(1, persons_per_sqm / 4.0)   (Fruin LOS F ~ 4)
    T  Kinetic turbulence = sqrt(HOG-lite isotropy x LBP busyness) * 1.15
    E  Egress deficit     = min(1, people / (exits x 250))
    O  Occupancy load     = min(1, people / safe_capacity)

    CPRI = 100 * PROD (eps + Si)^wi * (1 + 0.25 * escalation)

Weights renormalise over the sub-indices actually observable for a frame,
so CPRI degrades gracefully when no scene-context text data is supplied.
"""

from __future__ import annotations

import math

EPS = 0.06

ALERTS = {
    "redAlert": "\U0001F6A8 Red Alert Activated",
    "suspendEntry": "\U0001F6B7 Suspend Entry Immediately",
    "evacuate": "\U0001F6AA Emergency Evacuation Required",
    "protectLife": "\U0001F6E1\uFE0F Protect Human Life",
    "security": "\U0001F46E Rapid Security Deployment",
    "medical": "\U0001F691 Medical Response Activated",
    "broadcast": "\U0001F4E2 Emergency Broadcast Initiated",
    "redirect": "\u2194\uFE0F Redirect to Safe Zone",
    "zoneSecured": "\U0001F6A7 Critical Zone Secured",
    "lifeFirst": "\u2764\uFE0F Life Safety First",
}

ALERT_ACTIONS = {
    ALERTS["redAlert"]: "Red Alert Activated - crowd pressure index has crossed the critical threshold; activate the incident command protocol and notify local authorities now.",
    ALERTS["suspendEntry"]: "Suspend Entry Immediately - close all inbound gates and turnstiles until measured density falls below 2.0 persons/m2.",
    ALERTS["evacuate"]: "Emergency Evacuation Required - begin phased evacuation from the highest-density zones along pre-planned dispersal routes.",
    ALERTS["protectLife"]: "Protect Human Life - prioritise decompression of the crush zone over event continuity; stop the programme if necessary.",
    ALERTS["security"]: "Rapid Security Deployment - move additional marshals to the hotspot zones and form lateral relief lanes.",
    ALERTS["medical"]: "Medical Response Activated - position ambulance and first-aid teams at the nearest access point with a clear extraction corridor.",
    ALERTS["broadcast"]: "Emergency Broadcast Initiated - issue calm, repeated PA and digital-signage instructions directing movement away from the pressure point.",
    ALERTS["redirect"]: "Redirect to Safe Zone - open alternate exits and guide flow toward the designated low-density holding areas.",
    ALERTS["zoneSecured"]: "Critical Zone Secured - barrier off the affected zone and prevent re-entry until conditions normalise.",
    ALERTS["lifeFirst"]: "Life Safety First - maintain continuous monitoring; every decision is taken with life safety as the overriding priority.",
}


def cpri_band(cpri: float) -> str:
    if cpri < 20:
        return "Safe"
    if cpri < 40:
        return "Watch"
    if cpri < 60:
        return "Elevated"
    if cpri < 78:
        return "Critical"
    return "Red"


def compute_cpri(
    persons_per_sqm, occupancy, people: int, exits, orient: float,
    lbp: float, vision_score: float, growth: float,
) -> dict:
    density = (
        min(1.0, persons_per_sqm / 4.0)
        if persons_per_sqm is not None
        else min(1.0, vision_score)
    )
    turbulence = min(1.0, math.sqrt(max(0.0, orient * lbp)) * 1.15)
    egress = min(1.0, people / (exits * 250)) if exits else None
    occ = min(1.2, occupancy) / 1.2 if occupancy is not None else None

    terms = [(density, 0.4), (turbulence, 0.2)]
    if egress is not None:
        terms.append((egress, 0.2))
    if occ is not None:
        terms.append((occ, 0.2))

    w_sum = sum(w for _, w in terms)
    log_sum = sum((w / w_sum) * math.log(EPS + v) for v, w in terms)
    geo = math.exp(log_sum)

    escalation = max(0.0, min(1.0, growth - 1))
    cpri = max(0, min(100, round(geo * 100 * (1 + 0.25 * escalation))))

    return {
        "cpri": cpri,
        "band": cpri_band(cpri),
        "sub": {
            "density": round(density, 3),
            "turbulence": round(turbulence, 3),
            "egress": round(egress, 3) if egress is not None else 0,
            "occupancy": round(occ, 3) if occ is not None else 0,
        },
        "escalation": round(escalation, 3),
    }


def build_alerts(
    risk: str, cpri: float, band: str, persons_per_sqm, occupancy,
    los_grade, exits_deficit: bool, escalating: bool,
) -> list[str]:
    """Rule-based decision-support layer on top of CPRI."""
    out: list[str] = []

    def push(key: str) -> None:
        s = ALERTS[key]
        if s not in out:
            out.append(s)

    if band == "Red" or (risk == "High" and cpri >= 70):
        for k in ("redAlert", "suspendEntry", "evacuate", "protectLife",
                  "security", "medical", "broadcast", "redirect",
                  "zoneSecured", "lifeFirst"):
            push(k)
        return out

    if band == "Critical" or risk == "High":
        for k in ("redAlert", "suspendEntry", "security", "medical",
                  "redirect", "lifeFirst"):
            push(k)

    if los_grade in ("E", "F"):
        push("suspendEntry")
        push("protectLife")
    if persons_per_sqm is not None and persons_per_sqm >= 4:
        push("evacuate")
        push("zoneSecured")
    if occupancy is not None and occupancy > 1:
        push("suspendEntry")
        push("broadcast")
    if exits_deficit:
        push("redirect")
        push("zoneSecured")
    if escalating and (band == "Elevated" or risk == "Medium"):
        push("broadcast")
        push("security")
    if band == "Elevated" or risk == "Medium":
        push("security")
        push("redirect")

    if not out:
        push("lifeFirst")
    return out
