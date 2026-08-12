"""
CrowdVision AI — main analysis pipeline.

Mirrors the reference architecture exactly:
    features -> multi-scale scale estimate -> ensemble classification
    -> scale-aware count regression -> scene-context (Fruin/occupancy/egress)
    fusion -> 3x3 zone heatmap -> 15-min forecast -> CPRI -> alerts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import numpy as np

from .adversarial import refine
from .context import event_risk, fruin_los, has_context, normalise_context
from .deepnet import fuse as deep_fuse, infer as deep_infer
from .cpri import ALERT_ACTIONS, build_alerts, compute_cpri
from .ensemble import classify, ensemble_score, estimate_people
from .features import extract_features, estimate_scale, load_gray


GRID = 3
ZONES = GRID * GRID
MODEL_NAME = (
    "CrowdVision v4: DCDN-A deep density network (dilated multi-column CNN "
    "+ zone self-attention) fused with Ensemble v3 (RF + XGBoost + Decision "
    "Tree, HOG+LBP multi-scale) + Adversarial Density Critic + CPRI"
)



def _recommendations_for(risk: str) -> list[str]:
    if risk == "Low":
        return [
            "Continue routine monitoring of the area.",
            "Maintain standard security patrol rotations.",
            "Log conditions for baseline analytics.",
        ]
    if risk == "Medium":
        return [
            "Deploy additional security personnel to high-density zones.",
            "Prepare backup entry and exit channels.",
            "Broadcast wayfinding announcements to distribute flow.",
            "Increase CCTV sampling rate on hotspot zones.",
        ]
    return [
        "Open additional gates immediately to relieve pressure.",
        "Halt new entry until density subsides.",
        "Redirect crowd along pre-planned dispersal routes.",
        "Place emergency medical and evacuation teams on standby.",
        "Notify local authorities and activate incident protocol.",
    ]


def analyze_image(data: bytes, file_name: str, context: dict | None = None,
                  file_type: str = "image") -> dict:
    gray = load_gray(data)
    h, w = gray.shape
    area = float(w * h)

    global_f = extract_features(gray)
    scale = estimate_scale(gray)
    ens = ensemble_score(global_f)
    score = ens.score
    people = estimate_people(score, area, scale, global_f)

    # ---- adversarial density critic (GAN-style discriminator pass) ----
    people, score, critic = refine(global_f, people, score, area / 1_000_000)

    # ---- DCDN-A deep density network (convolutional + self-attention) ----
    deep = deep_infer(gray, area / 1_000_000, people)
    people = deep_fuse(people, deep, critic.crowdness)


    # ---- scene-context calibration (operator text data) ----
    sc = normalise_context(context)
    area_sqm = sc["areaSqm"] if sc["areaSqm"] and sc["areaSqm"] > 0 else None
    capacity = sc["capacity"] if sc["capacity"] and sc["capacity"] > 0 else None
    exits = int(sc["exits"]) if sc["exits"] and sc["exits"] > 0 else None

    if capacity:
        people = min(people, round(capacity * 1.6))

    persons_per_sqm = round(people / area_sqm, 2) if area_sqm else None
    occupancy = round(people / capacity, 2) if capacity else None
    los = fruin_los(persons_per_sqm) if persons_per_sqm is not None else None

    fused = score
    if persons_per_sqm is not None:
        fused = 0.55 * fused + 0.45 * min(1.0, persons_per_sqm / 3.5)
    if occupancy is not None:
        fused = 0.7 * fused + 0.3 * min(1.0, occupancy)
    if exits and people > 0:
        fused = 0.85 * fused + 0.15 * min(1.0, people / (exits * 250))
    fused = max(0.0, min(1.0, fused + event_risk(sc["eventType"]) * 0.5))

    density = round(people / (area / 10000), 2)
    if persons_per_sqm is not None:
        density_level = (
            "Low" if persons_per_sqm < 0.72
            else "Medium" if persons_per_sqm < 2.17
            else "High"
        )
    else:
        density_level = "Low" if density < 1.2 else "Medium" if density < 3 else "High"

    # ---- 3x3 zone heatmap ----
    zh, zw = h // GRID, w // GRID
    zone_scores = []
    for zy in range(GRID):
        for zx in range(GRID):
            tile = gray[zy * zh:(zy + 1) * zh, zx * zw:(zx + 1) * zw]
            zone_scores.append(ensemble_score(extract_features(tile)).score)
    zone_avg = (sum(zone_scores) / ZONES) or 1.0
    zones = []
    for i, s in enumerate(zone_scores):
        base_share = s / (zone_avg * ZONES)
        attn_share = deep.attention[i] if i < len(deep.attention) else 1 / ZONES
        share = 0.7 * base_share + 0.3 * (attn_share * ZONES)
        zones.append({"id": f"Z{i+1}", "count": max(0, round(people * share)),
                      "level": classify(s)})
    total = sum(z["count"] for z in zones) or 1
    factor = people / total
    for z in zones:
        z["count"] = round(z["count"] * factor)

    growth = 0.9 + fused * 0.7
    expected_count = round(people * growth)
    expected_risk = classify(min(1.0, fused * growth * 0.95))

    cpri = compute_cpri(
        persons_per_sqm=persons_per_sqm, occupancy=occupancy, people=people,
        exits=exits, orient=global_f.orient, lbp=global_f.lbp,
        vision_score=fused, growth=growth,
    )

    risk = classify(fused)
    exits_deficit = bool(exits and people / (exits * 250) > 0.8)
    alerts = build_alerts(
        risk=risk, cpri=cpri["cpri"], band=cpri["band"],
        persons_per_sqm=persons_per_sqm, occupancy=occupancy,
        los_grade=los["grade"] if los else None,
        exits_deficit=exits_deficit, escalating=growth > 1.15,
    )

    recommendations = [ALERT_ACTIONS.get(a, a) for a in alerts]
    recommendations += _recommendations_for(risk)
    if los and los["grade"] in ("E", "F"):
        recommendations.insert(
            0,
            f"Measured density {persons_per_sqm} persons/m2 is Fruin LOS "
            f"{los['grade']} ({los['label']}) - restrict inflow now.",
        )
    if occupancy is not None and occupancy > 1:
        recommendations.insert(
            0, f"Area is at {round(occupancy * 100)}% of stated safe capacity."
        )

    return {
        "id": str(uuid.uuid4()),
        "fileName": file_name,
        "fileType": file_type,
        "peopleCount": people,
        "density": density,
        "densityLabel": density_level,
        "risk": risk,
        "riskScore": round(fused * 100),
        "zones": zones,
        "prediction": {"horizonMin": 15, "expectedCount": expected_count,
                       "expectedRisk": expected_risk},
        "recommendations": recommendations,
        "alerts": alerts,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "confidence": round(
            min(99.0, ens.confidence * 100 * (0.75 + 0.25 * critic.realism)), 1
        ),
        "features": global_f.as_dict(),
        "explain": {"subModels": ens.sub_models,
                    "contributions": ens.contributions},
        "deep": {
            "count": deep.count,
            "densityMean": deep.density_mean,
            "densityPeak": deep.density_peak,
            "attention": deep.attention,
            "activation": deep.activation,
            "focus": deep.focus,
            "agreement": deep.agreement,
        },
        "adversarial": {
            "realism": critic.realism,
            "crowdness": critic.crowdness,
            "priorCount": critic.prior_count,
            "adjust": critic.adjust,
            "gain": critic.gain,
        },
        "model": MODEL_NAME,

        "scaleEstimate": round(scale, 3),
        "personsPerSqm": persons_per_sqm,
        "occupancy": occupancy,
        "losGrade": los["grade"] if los else None,
        "losLabel": los["label"] if los else None,
        "cpri": cpri["cpri"],
        "cpriBand": cpri["band"],
        "cpriSub": cpri["sub"],
        "context": sc if has_context(sc) else None,
    }


def analyze_video(data: bytes, file_name: str, context: dict | None = None) -> dict:
    """
    Video path: sample the middle frame with imageio/OpenCV when available,
    otherwise fall back to treating the payload as a still frame.
    """
    try:
        import tempfile

        import cv2  # type: ignore

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as fh:
            fh.write(data)
            fh.flush()
            cap = cv2.VideoCapture(fh.name)
            frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            if frames > 1:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frames // 2)
            ok, frame = cap.read()
            cap.release()
            if ok:
                ok2, buf = cv2.imencode(".jpg", frame)
                if ok2:
                    return analyze_image(buf.tobytes(), file_name, context, "video")
    except Exception:
        pass
    return analyze_image(data, file_name, context, "video")
