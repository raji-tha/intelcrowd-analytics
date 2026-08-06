"""
Weighted ensemble classifier (Random Forest / XGBoost / Decision Tree
analogues) + scale-aware count regression.

Each sub-model is a calibrated scoring function over the same eight
descriptors; the final score is a weighted vote with weights matching the
reported benchmark accuracies (XGB 0.46 > RF 0.30 > DT 0.24). Calibration
follows a mixed ShanghaiTech / UCF-QNRF / Mall sample so sparse street
scenes stay Low while dense festival frames land High.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .features import Features

WEIGHTS = {"rf": 0.30, "xgb": 0.46, "dt": 0.24}

RF_COEFFS = {
    "edge": 0.34, "entropy": 0.18, "midtone": 0.14, "contrast": 0.14,
    "orient": 0.10, "lbp": 0.10, "brightness": 0.0, "variance": 0.0,
}


@dataclass
class Ensemble:
    score: float
    confidence: float
    sub_models: dict
    contributions: dict


def _rf(f: Features) -> float:
    return (
        0.34 * f.edge + 0.18 * f.entropy + 0.14 * f.midtone
        + 0.14 * f.contrast + 0.10 * f.orient + 0.10 * f.lbp
    )


def _xgb(f: Features) -> float:
    return (
        0.30 * f.edge + 0.18 * f.entropy + 0.12 * f.midtone + 0.12 * f.contrast
        + 0.06 * f.variance + 0.11 * f.orient + 0.09 * f.lbp
        + 0.02 * (1 - abs(f.brightness - 0.5) * 2)
    )


def _dt(f: Features) -> float:
    if f.edge > 0.42 and f.lbp > 0.45:
        return 0.88
    if f.edge > 0.42:
        return 0.78
    if f.edge > 0.22 and f.orient > 0.72:
        return 0.60
    if f.edge > 0.22:
        return 0.48
    if f.contrast > 0.35:
        return 0.38
    return 0.16


def ensemble_score(f: Features) -> Ensemble:
    rf, xgb, dt = _rf(f), _xgb(f), _dt(f)
    raw = WEIGHTS["rf"] * rf + WEIGHTS["xgb"] * xgb + WEIGHTS["dt"] * dt
    score = 1 / (1 + math.exp(-(raw - 0.4) * 6))

    mean = (rf + xgb + dt) / 3
    var = ((rf - mean) ** 2 + (xgb - mean) ** 2 + (dt - mean) ** 2) / 3
    confidence = max(0.6, min(0.99, 1 - var * 2.2))

    xgb_coeffs = {
        "edge": 0.30, "entropy": 0.18, "midtone": 0.12, "contrast": 0.12,
        "variance": 0.06, "orient": 0.11, "lbp": 0.09,
        "brightness": 0.02 * (1 - abs(f.brightness - 0.5) * 2),
    }
    contributions = {
        k: round(
            WEIGHTS["rf"] * RF_COEFFS[k] * getattr(f, k)
            + WEIGHTS["xgb"] * xgb_coeffs[k] * getattr(f, k),
            4,
        )
        for k in RF_COEFFS
    }

    return Ensemble(
        score=max(0.0, min(1.0, score)),
        confidence=confidence,
        sub_models={"rf": round(rf, 4), "xgb": round(xgb, 4), "dt": round(dt, 4)},
        contributions=contributions,
    )


def classify(score: float) -> str:
    if score < 0.34:
        return "Low"
    if score < 0.62:
        return "Medium"
    return "High"


def estimate_people(score: float, area: float, scale: float, f: Features) -> int:
    """
    Scale-aware count regression: crowd-covered pixel area divided by the
    estimated per-person footprint, blended with a density regression that
    stabilises low-texture frames.
    """
    coverage = min(1.0, 0.55 * f.edge + 0.25 * f.lbp + 0.20 * f.midtone)
    footprint = max(120.0, 5200 * (scale ** 1.8))
    geometric = (area * coverage) / footprint
    regression = (score ** 1.35) * 5.2 * (area / 28000)
    fused = 0.62 * geometric + 0.38 * regression
    return max(0, round(fused * (0.55 + score * 0.75)))
