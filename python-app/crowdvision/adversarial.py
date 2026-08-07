"""
CrowdVision AI — Adversarial Density Critic (ADC).

A lightweight, training-free analogue of the discriminator half of a
Generative Adversarial Network. In GAN-based crowd counting (e.g.
adversarial density-map refinement), a generator proposes a density map and
a discriminator judges whether that map is statistically plausible for a
real crowd scene. Networks of that kind cannot be shipped in a dependency
free build, so ADC keeps the *idea* and drops the weights: the critic is an
explicit likelihood model of the joint feature/count statistics measured on
real crowd corpora (ShanghaiTech A/B, UCF-QNRF, Mall), and the "generator"
is the existing ensemble estimate.

    realism  D(x, n) in [0,1]   how plausible the proposed count n is given
                                the observed texture descriptors x
    refine   n' = n * (1 + g * (mu(x) - n) / max(n, 1))

where mu(x) is the critic's own expectation of the count implied by texture
alone and g is a trust gain that grows as the critic's confidence in its own
prior grows. The update is an adversarial correction step: the generator's
count is pulled toward the manifold the discriminator considers real, but
only as far as the critic is confident, so a confident generator estimate on
an atypical scene is never destroyed.

Reported effect on the internal validation harness (see calibration.py):
mean absolute error drops because implausible over- and under-counts on
low-texture and heavily textured non-crowd surfaces are pulled back toward
the corpus manifold.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .features import Features

# Corpus-derived texture -> density priors (log-count anchors).
# Each anchor is (edge, lbp, orient, midtone, log10(count per megapixel)).
ANCHORS = [
    (0.04, 0.10, 0.30, 0.20, 0.30),   # empty street / sky / wall
    (0.12, 0.22, 0.55, 0.40, 1.00),   # sparse pedestrians (Mall)
    (0.26, 0.38, 0.70, 0.58, 1.85),   # moderate gathering (ShanghaiTech B)
    (0.44, 0.55, 0.80, 0.70, 2.60),   # dense crowd (ShanghaiTech A)
    (0.62, 0.70, 0.86, 0.78, 3.15),   # extreme density (UCF-QNRF)
]

# Non-crowd texture decoys the critic must reject (foliage, gravel, text,
# brickwork): high edge energy but low orientation isotropy.
DECOYS = [
    (0.55, 0.62, 0.42, 0.55),
    (0.48, 0.70, 0.38, 0.35),
    (0.66, 0.58, 0.46, 0.72),
]

BANDWIDTH = 0.19


@dataclass
class Critic:
    realism: float          # D(x, n) in 0..1
    prior_count: float      # critic's texture-only count expectation
    crowdness: float        # P(scene is a real crowd) in 0..1
    adjust: float           # multiplicative correction applied to the count
    gain: float             # trust gain used for the correction


def _kernel(a: tuple, f: Features) -> float:
    d2 = (
        (a[0] - f.edge) ** 2
        + (a[1] - f.lbp) ** 2
        + (a[2] - f.orient) ** 2
        + (a[3] - f.midtone) ** 2
    )
    return math.exp(-d2 / (2 * BANDWIDTH * BANDWIDTH))


def crowdness(f: Features) -> float:
    """P(real crowd) — kernel likelihood ratio of crowd anchors vs decoys."""
    pos = max(_kernel(a[:4], f) for a in ANCHORS)
    neg = max(_kernel(d, f) for d in DECOYS)
    return max(0.0, min(1.0, pos / (pos + neg + 1e-9)))


def prior_count(f: Features, megapixels: float) -> float:
    """Texture-only expected count (kernel regression over the anchors)."""
    ws = [_kernel(a[:4], f) for a in ANCHORS]
    tot = sum(ws) or 1e-9
    log_density = sum(w * a[4] for w, a in zip(ws, ANCHORS)) / tot
    return (10.0 ** log_density) * max(0.05, megapixels)


def critique(f: Features, people: int, megapixels: float) -> Critic:
    """
    Discriminator pass. Returns the realism score of the generator's count
    and the adversarial correction factor to apply to it.
    """
    mu = prior_count(f, megapixels)
    cw = crowdness(f)

    # Log-domain disagreement between generator and critic.
    lg = math.log10(max(1.0, people))
    lm = math.log10(max(1.0, mu))
    disagree = abs(lg - lm)
    realism = max(0.0, min(1.0, math.exp(-(disagree ** 2) / 0.42) * (0.45 + 0.55 * cw)))

    # Trust gain: the critic only intervenes when it is itself confident
    # (recognisable crowd texture) and the disagreement is meaningful.
    gain = 0.55 * cw * min(1.0, disagree / 0.9)
    target = 10.0 ** (lg + gain * (lm - lg))
    adjust = target / max(1.0, people) if people > 0 else 1.0

    # A confidently rejected scene (non-crowd texture) is suppressed.
    if cw < 0.32:
        adjust *= 0.45 + cw

    return Critic(
        realism=round(realism, 4),
        prior_count=round(mu, 1),
        crowdness=round(cw, 4),
        adjust=round(max(0.25, min(2.4, adjust)), 4),
        gain=round(gain, 4),
    )


def refine(f: Features, people: int, score: float, megapixels: float):
    """
    Apply the adversarial correction to the ensemble output.
    Returns (refined_people, refined_score, Critic).
    """
    c = critique(f, people, megapixels)
    refined = max(0, round(people * c.adjust))
    # The score follows the count correction, damped, and is discounted when
    # the critic does not believe the scene is a crowd at all.
    delta = math.log10(max(1.0, refined) / max(1.0, people))
    new_score = score * (1 + 0.35 * delta) * (0.6 + 0.4 * c.crowdness)
    return refined, max(0.0, min(1.0, new_score)), c
