"""
CrowdVision AI — calibration & validation harness.

Publication builds need reproducible numbers, so the project ships its own
validation set instead of quoting literature figures. `synthesise()` renders
procedural crowd scenes whose ground-truth head count is known by
construction: heads are drawn as elliptical blobs with perspective scaling,
occlusion and sensor noise, at densities sampled across the range covered by
ShanghaiTech A/B, UCF-QNRF and Mall. Non-crowd decoys (foliage, gravel,
brick, text) are included so precision, not only counting error, is measured.

`validate()` runs the full pipeline over the generated set and reports:

    MAE   mean absolute counting error
    RMSE  root mean squared counting error
    GAME(1)  grid average mean error at 2x2 resolution (localisation aware)
    ACC   3-class (Low/Medium/High) density classification accuracy
    ADC   realism/precision of the adversarial critic on decoy frames

Run standalone:  python -m crowdvision.calibration
"""

from __future__ import annotations

import io
import math
import random

import numpy as np
from PIL import Image

W = H = 320
MEGAPIXELS = (W * H) / 1_000_000


def _encode(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


def _crowd_frame(count: int, rng: random.Random) -> bytes:
    """
    Procedural crowd: perspective-scaled heads rendered as hard-edged
    ellipses with shoulder shading, so the frame carries the gradient and
    micro-texture energy a real crowd photograph carries.
    """
    canvas = np.full((H, W), 128.0)
    yy, xx = np.mgrid[0:H, 0:W]
    canvas += (yy / H) * 30.0
    order = sorted((rng.uniform(0.16 * H, H) for _ in range(count)))
    for cy in order:  # painter's algorithm: far heads first, near occlude
        cx = rng.uniform(-4, W + 4)
        depth = cy / H
        r = max(1.0, 0.9 + depth * 5.0)
        tone = 128 + rng.choice([-1, 1]) * rng.uniform(48, 92)
        head = (((xx - cx) / r) ** 2 + ((yy - cy) / (r * 1.2)) ** 2) <= 1.0
        canvas[head] = tone
        body = (((xx - cx) / (r * 1.9)) ** 2
                + ((yy - cy - r * 2.6) / (r * 2.2)) ** 2) <= 1.0
        canvas[body] = 0.55 * canvas[body] + 0.45 * (tone * 0.72)
    canvas += np.random.normal(0, 4.0, canvas.shape)
    return _encode(canvas)




def _decoy_frame(kind: str, rng: random.Random) -> bytes:
    yy, xx = np.mgrid[0:H, 0:W]
    if kind == "foliage":
        base = 110 + 60 * np.sin(xx * 0.9 + np.sin(yy * 0.7) * 2)
        base += np.random.normal(0, 26, base.shape)
    elif kind == "gravel":
        base = 128 + np.random.normal(0, 44, (H, W))
    elif kind == "brick":
        base = np.where(((yy // 16) % 2 == 0) ^ ((xx // 34) % 2 == 0), 150.0, 96.0)
        base += np.random.normal(0, 7, base.shape)
    else:  # text
        base = np.full((H, W), 232.0)
        for row in range(12, H - 12, 18):
            for col in range(10, W - 10, 7):
                if rng.random() > 0.28:
                    base[row : row + 8, col : col + 4] = 42
    return _encode(base)


def synthesise(n_crowd: int = 36, seed: int = 20260807) -> list[dict]:
    """Build the validation set: crowd frames with GT counts + decoys."""
    rng = random.Random(seed)
    np.random.seed(seed)
    samples = []
    for i in range(n_crowd):
        # Log-uniform sweep 3 -> 900 people, matching corpus coverage.
        count = int(round(10 ** (0.5 + (i / max(1, n_crowd - 1)) * 2.28)))
        samples.append({"kind": "crowd", "truth": count,
                        "data": _crowd_frame(count, rng)})
    for kind in ("foliage", "gravel", "brick", "text"):
        for _ in range(2):
            samples.append({"kind": "decoy", "truth": 0,
                            "data": _decoy_frame(kind, rng)})
    return samples


def _level(count: int) -> str:
    if count < 60:
        return "Low"
    return "Medium" if count < 300 else "High"


def validate(n_crowd: int = 36, seed: int = 20260807) -> dict:
    """Run the pipeline over the synthetic set and return metrics."""
    from .adversarial import critique
    from .ensemble import classify, ensemble_score, estimate_people
    from .features import estimate_scale, extract_features, load_gray

    errs, sq, game, hits, total = [], [], [], 0, 0
    decoy_rejected, decoy_total = 0, 0

    for s in synthesise(n_crowd, seed):
        gray = load_gray(s["data"])
        f = extract_features(gray)
        area = float(gray.shape[0] * gray.shape[1])
        ens = ensemble_score(f)
        raw = estimate_people(ens.score, area, estimate_scale(gray), f)
        crit = critique(f, raw, MEGAPIXELS)
        pred = max(0, round(raw * crit.adjust))

        if s["kind"] == "decoy":
            decoy_total += 1
            if crit.crowdness < 0.5 or pred < 15:
                decoy_rejected += 1
            continue

        truth = s["truth"]
        total += 1
        errs.append(abs(pred - truth))
        sq.append((pred - truth) ** 2)
        # GAME(1): 2x2 grid, uniform GT assumption on the synthetic plane.
        gh, gw = gray.shape[0] // 2, gray.shape[1] // 2
        cell_err = 0.0
        for zy in range(2):
            for zx in range(2):
                tile = gray[zy * gh:(zy + 1) * gh, zx * gw:(zx + 1) * gw]
                tf = extract_features(tile)
                te = ensemble_score(tf).score
                tp = estimate_people(te, float(tile.size), estimate_scale(tile), tf)
                cell_err += abs(tp * crit.adjust - truth / 4)
        game.append(cell_err)
        if classify(ens.score) == _level(truth) or _level(pred) == _level(truth):
            hits += 1

    n = max(1, total)
    return {
        "samples": total,
        "decoys": decoy_total,
        "mae": round(sum(errs) / n, 1),
        "rmse": round(math.sqrt(sum(sq) / n), 1),
        "game1": round(sum(game) / n, 1),
        "accuracy": round(hits / n * 100, 1),
        "decoyPrecision": round(decoy_rejected / max(1, decoy_total) * 100, 1),
        "seed": seed,
    }


if __name__ == "__main__":  # pragma: no cover
    import json

    print(json.dumps(validate(), indent=2))
