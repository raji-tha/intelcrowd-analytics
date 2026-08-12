"""
DCDN-A - Dilated Convolutional Density Network with Zone Self-Attention.

A compact, training-free deep-learning stage that runs entirely on numpy, so
the project keeps its zero-native-dependency architecture while gaining a
genuine convolutional density-estimation head (the component that separates
modern crowd counting from purely hand-crafted descriptors).

Architecture (forward pass only, weights derived analytically):

    input (gray, normalised)
      |
      +-- Column d=1 : Gabor bank (4 orientations) -> ReLU
      +-- Column d=2 : dilated Gabor bank          -> ReLU     (multi-column,
      +-- Column d=4 : dilated Gabor bank          -> ReLU      MCNN-style)
      |
    channel concat -> Difference-of-Gaussians blob head -> ReLU
      |
    1x1 fusion (fixed weights) -> softplus -> density map D(x)
      |
    3x3 zone tokens -> single-head scaled dot-product self-attention
      |
    attention-reweighted spatial sum -> count

The Gabor / DoG kernels are the classical analytic approximations of the
first convolutional layers learned by CNNs on natural images, so the network
behaves like a pre-trained front-end without shipping any weights. The
self-attention block is the transformer refinement stage: zones that agree
with the global density context reinforce each other, isolated texture
spikes (foliage, gravel, printed text) are attenuated.

Calibration constants were fitted on the synthetic validation harness in
`calibration.py` (least squares in log space).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

NET_SIDE = 192          # working resolution of the network input
GAMMA = 1.06            # density power law exponent (fitted)
ALPHA = 0.0225          # density -> people scale (fitted, per megapixel)
ATTN_TEMP = 0.65        # softmax temperature of the attention block


@dataclass
class DeepResult:
    count: float
    density_mean: float
    density_peak: float
    attention: list          # 9 zone attention weights
    activation: dict         # mean activation per column
    focus: float             # attention concentration (0 = flat, 1 = peaked)
    agreement: float         # agreement with the ensemble count (0..1)


# ---------------------------------------------------------------- kernels

def _gabor(theta: float, sigma: float = 1.6, lam: float = 3.4, k: int = 5) -> np.ndarray:
    r = k // 2
    y, x = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
    xr = x * math.cos(theta) + y * math.sin(theta)
    yr = -x * math.sin(theta) + y * math.cos(theta)
    g = np.exp(-(xr ** 2 + 0.6 * yr ** 2) / (2 * sigma ** 2)) * np.cos(2 * math.pi * xr / lam)
    g -= g.mean()
    n = np.abs(g).sum() or 1.0
    return (g / n).astype(np.float32)


def _dog(s1: float = 1.0, s2: float = 2.2, k: int = 7) -> np.ndarray:
    r = k // 2
    y, x = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
    g1 = np.exp(-(x ** 2 + y ** 2) / (2 * s1 ** 2)) / (2 * math.pi * s1 ** 2)
    g2 = np.exp(-(x ** 2 + y ** 2) / (2 * s2 ** 2)) / (2 * math.pi * s2 ** 2)
    d = g1 - g2
    d -= d.mean()
    n = np.abs(d).sum() or 1.0
    return (d / n).astype(np.float32)


_ORIENTS = [0.0, math.pi / 4, math.pi / 2, 3 * math.pi / 4]
_GABORS = [_gabor(t) for t in _ORIENTS]
_DOG = _dog()


def _conv(img: np.ndarray, kern: np.ndarray, dilation: int = 1) -> np.ndarray:
    """Valid 2D correlation with optional dilation (numpy only)."""
    k = kern.shape[0]
    span = (k - 1) * dilation
    h, w = img.shape
    if h <= span or w <= span:
        return np.zeros((1, 1), dtype=np.float32)
    out = np.zeros((h - span, w - span), dtype=np.float32)
    for i in range(k):
        for j in range(k):
            v = kern[i, j]
            if v == 0.0:
                continue
            out += v * img[i * dilation:i * dilation + out.shape[0],
                           j * dilation:j * dilation + out.shape[1]]
    return out


def _relu(a: np.ndarray) -> np.ndarray:
    return np.maximum(a, 0.0)


def _softplus(a: np.ndarray) -> np.ndarray:
    return np.log1p(np.exp(np.clip(a, -30, 30)))


def _resize(gray: np.ndarray, side: int) -> np.ndarray:
    h, w = gray.shape
    m = max(h, w)
    if m <= side:
        return gray
    step = m / side
    ys = np.clip((np.arange(int(h / step)) * step).astype(int), 0, h - 1)
    xs = np.clip((np.arange(int(w / step)) * step).astype(int), 0, w - 1)
    if ys.size < 8 or xs.size < 8:
        return gray
    return gray[np.ix_(ys, xs)]


# ---------------------------------------------------------------- forward

def density_map(gray: np.ndarray) -> tuple[np.ndarray, dict]:
    """Run the convolutional stack and return (density map, column stats)."""
    x = _resize(gray, NET_SIDE).astype(np.float32) / 255.0
    if x.shape[0] < 16 or x.shape[1] < 16:
        return np.zeros((1, 1), dtype=np.float32), {"d1": 0.0, "d2": 0.0, "d4": 0.0}

    columns = {}
    maps = []
    for dil, name in ((1, "d1"), (2, "d2"), (4, "d4")):
        resp = [_relu(np.abs(_conv(x, g, dil))) for g in _GABORS]
        h = min(r.shape[0] for r in resp)
        w = min(r.shape[1] for r in resp)
        stack = np.stack([r[:h, :w] for r in resp], axis=0)
        # orientation-max pooling: keep the strongest oriented edge per pixel
        pooled = stack.max(axis=0)
        columns[name] = float(pooled.mean())
        maps.append(pooled)

    hh = min(m.shape[0] for m in maps)
    ww = min(m.shape[1] for m in maps)
    # multi-column fusion (fixed 1x1 weights: fine detail dominates counting)
    fused = (
        0.5 * maps[0][:hh, :ww]
        + 0.3 * maps[1][:hh, :ww]
        + 0.2 * maps[2][:hh, :ww]
    )

    # blob head: head-sized DoG response gates the oriented energy
    blob = _relu(_conv(x, _DOG))
    bh, bw = min(hh, blob.shape[0]), min(ww, blob.shape[1])
    gated = fused[:bh, :bw] * (0.35 + 1.65 * blob[:bh, :bw] / (blob.max() + 1e-6))

    d = _softplus(6.0 * gated - 0.55) - _softplus(-0.55)
    return d.astype(np.float32), columns


def _attention(tokens: np.ndarray) -> np.ndarray:
    """Single-head scaled dot-product self-attention over 9 zone tokens."""
    q = tokens - tokens.mean(axis=0, keepdims=True)
    d = max(1, tokens.shape[1])
    logits = (q @ q.T) / (math.sqrt(d) * ATTN_TEMP)
    logits -= logits.max(axis=1, keepdims=True)
    a = np.exp(logits)
    a /= a.sum(axis=1, keepdims=True)
    ctx = a @ tokens
    # zone weight = attended density energy
    w = np.clip(ctx[:, 0], 0.0, None)
    s = w.sum()
    return (w / s) if s > 0 else np.full(9, 1 / 9, dtype=np.float32)


def infer(gray: np.ndarray, megapixels: float, ensemble_count: float) -> DeepResult:
    """Full DCDN-A forward pass -> calibrated count + attention diagnostics."""
    d, columns = density_map(gray)
    mean = float(d.mean())
    peak = float(d.max()) if d.size else 0.0

    # ---- 3x3 zone tokens: [mean, peak, std, active-fraction] ----
    h, w = d.shape
    zh, zw = max(1, h // 3), max(1, w // 3)
    tokens = np.zeros((9, 4), dtype=np.float32)
    for zy in range(3):
        for zx in range(3):
            t = d[zy * zh:(zy + 1) * zh, zx * zw:(zx + 1) * zw]
            if t.size == 0:
                continue
            tokens[zy * 3 + zx] = (
                t.mean(), t.max(), t.std(), float((t > mean).mean())
            )
    attn = _attention(tokens)

    # attention-reweighted spatial sum (zones the context trusts count more)
    zone_means = tokens[:, 0]
    weighted_mean = float((attn * zone_means).sum() * 9) / 9 if zone_means.size else mean
    energy = 0.6 * mean + 0.4 * weighted_mean

    count = ALPHA * (energy ** GAMMA) * max(0.05, megapixels) * 1e6 / 1000.0

    focus = float(1 - (-(attn * np.log(attn + 1e-9)).sum() / math.log(9)))
    lg = math.log10(max(1.0, count))
    le = math.log10(max(1.0, ensemble_count))
    agreement = float(math.exp(-((lg - le) ** 2) / 0.5))

    return DeepResult(
        count=round(count, 1),
        density_mean=round(mean, 5),
        density_peak=round(peak, 4),
        attention=[round(float(v), 4) for v in attn],
        activation={k: round(v, 5) for k, v in columns.items()},
        focus=round(focus, 4),
        agreement=round(agreement, 4),
    )


def fuse(ensemble_count: float, deep: DeepResult) -> int:
    """
    Confidence-weighted log-space fusion of the hand-crafted ensemble count
    and the convolutional density count. The network gets more say when its
    attention map is focused and it broadly agrees with the ensemble.
    """
    w = 0.25 + 0.45 * deep.agreement * (0.5 + 0.5 * deep.focus)
    lg = math.log10(max(1.0, ensemble_count))
    ld = math.log10(max(1.0, deep.count))
    return max(0, round(10 ** ((1 - w) * lg + w * ld)))
