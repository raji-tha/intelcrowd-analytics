"""
CrowdVision AI — image feature extraction (Python port of the reference
browser pipeline).

Extracts the eight descriptors used by the ensemble classifier:
    edge, entropy, midtone, brightness, variance, contrast (Sobel-lite),
    orient (HOG-lite gradient-orientation isotropy),
    lbp   (Local Binary Pattern non-uniform ratio).

Only numpy + Pillow are required, so the module runs anywhere (no native
OpenCV / CUDA build needed).
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, asdict

import numpy as np
from PIL import Image

MAX_SIDE = 480


@dataclass
class Features:
    edge: float
    entropy: float
    midtone: float
    brightness: float
    variance: float
    contrast: float
    orient: float
    lbp: float

    def as_dict(self) -> dict:
        return {k: round(v, 4) for k, v in asdict(self).items()}


def load_gray(data: bytes) -> np.ndarray:
    """Decode image bytes into a downscaled float32 luminance array."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    scale = min(1.0, MAX_SIDE / max(img.size))
    if scale < 1.0:
        img = img.resize(
            (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
            Image.BILINEAR,
        )
    arr = np.asarray(img, dtype=np.float32)
    return 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]


def _entropy(hist: np.ndarray) -> float:
    total = hist.sum()
    if total <= 0:
        return 0.0
    p = hist[hist > 0] / total
    return float(-(p * np.log2(p)).sum())


def extract_features(gray: np.ndarray) -> Features:
    h, w = gray.shape
    if h < 5 or w < 5:
        return Features(0, 0, 0, float(gray.mean() / 255), 0, 0, 0, 0)

    mean = float(gray.mean())
    variance = float(gray.var())
    midtone = float(((gray > 55) & (gray < 210)).mean())
    hist, _ = np.histogram(gray, bins=32, range=(0, 256))
    entropy = _entropy(hist.astype(np.float64))

    # --- Sobel-lite gradients (central differences, stride 2) ---
    g = gray[::2, ::2]
    dx = np.zeros_like(g)
    dy = np.zeros_like(g)
    dx[:, 1:-1] = g[:, 2:] - g[:, :-2]
    dy[1:-1, :] = g[2:, :] - g[:-2, :]
    mag = np.abs(dx) + np.abs(dy)

    n = mag.size or 1
    edge_sum = float(mag[mag > 40].sum())
    local_contrast = float(mag.sum())

    # --- HOG-lite: 8-bin unsigned orientation histogram, magnitude weighted ---
    mask = mag > 25
    if mask.any():
        ang = np.arctan2(dy[mask], dx[mask])
        ang = np.where(ang < 0, ang + math.pi, ang)
        bins = np.clip((ang / math.pi * 8).astype(int), 0, 7)
        oh = np.bincount(bins, weights=mag[mask], minlength=8)
        orient_entropy = _entropy(oh)
    else:
        orient_entropy = 0.0

    # --- LBP (8 neighbours): ratio of non-uniform (busy) patterns ---
    c = gray[1:-1, 1:-1]
    neigh = [
        gray[:-2, :-2], gray[:-2, 1:-1], gray[:-2, 2:], gray[1:-1, 2:],
        gray[2:, 2:], gray[2:, 1:-1], gray[2:, :-2], gray[1:-1, :-2],
    ]
    bits = [(nb >= c).astype(np.int8) for nb in neigh]
    transitions = np.zeros_like(c, dtype=np.int16)
    for k in range(8):
        transitions += (bits[k] != bits[(k + 1) % 8]).astype(np.int16)
    lbp = float((transitions > 2).mean()) if transitions.size else 0.0

    return Features(
        edge=min(1.0, edge_sum / (n * 120)),
        entropy=min(1.0, entropy / 5),
        midtone=midtone,
        brightness=mean / 255,
        variance=min(1.0, variance / 4000),
        contrast=min(1.0, local_contrast / (n * 90)),
        orient=min(1.0, orient_entropy / 3),
        lbp=lbp,
    )


def estimate_scale(gray: np.ndarray) -> float:
    """
    Multi-scale (Laplacian-pyramid style) object-scale estimate.
    Slow edge-density decay across strides => large, near subjects.
    Fast decay => fine repeated structure => dense distant crowd.
    """

    def density(stride: int) -> float:
        g = gray
        h, w = g.shape
        if h <= 2 * stride + 1 or w <= 2 * stride + 1:
            return 0.0
        core = g[stride:-stride:stride, stride:-stride:stride]
        right = g[stride:-stride:stride, 2 * stride::stride][:, : core.shape[1]]
        left = g[stride:-stride:stride, 0 : -2 * stride : stride][:, : core.shape[1]]
        down = g[2 * stride :: stride, stride:-stride:stride][: core.shape[0], :]
        up = g[0 : -2 * stride : stride, stride:-stride:stride][: core.shape[0], :]
        rows = min(core.shape[0], down.shape[0], up.shape[0])
        cols = min(core.shape[1], right.shape[1], left.shape[1])
        if rows == 0 or cols == 0:
            return 0.0
        m = np.abs(right[:rows, :cols] - left[:rows, :cols]) + np.abs(
            down[:rows, :cols] - up[:rows, :cols]
        )
        return float((m > 35).mean())

    d1, d2, d4 = density(1), density(2), density(4)
    decay = (d1 - d4) / (d1 + 1e-6)
    mid_ratio = d2 / (d1 + 1e-6)
    return max(0.15, min(1.0, 0.5 * (1 - decay) + 0.5 * mid_ratio))
