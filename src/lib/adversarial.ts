/**
 * Adversarial Density Critic (ADC) — TypeScript port of
 * python-app/crowdvision/adversarial.py.
 *
 * Training-free analogue of the discriminator half of a GAN: the ensemble
 * plays the generator and proposes a count; the critic scores how plausible
 * that count is for the observed texture and pulls it toward the density
 * manifold measured on real crowd corpora, in proportion to its own
 * confidence. Anchors and the density power law are fitted with the
 * validation harness shipped in the Python build.
 */

export interface CriticFeatures {
  edge: number;
  lbp: number;
  orient: number;
  midtone: number;
}

export interface CriticResult {
  realism: number;
  crowdness: number;
  priorCount: number;
  adjust: number;
  gain: number;
}

const ANCHORS: [number, number, number, number][] = [
  [0.001, 0.336, 0.96, 1.0],
  [0.012, 0.332, 0.97, 1.0],
  [0.039, 0.321, 0.98, 1.0],
  [0.09, 0.296, 0.98, 0.99],
  [0.22, 0.45, 0.9, 0.85],
  [0.45, 0.6, 0.85, 0.75],
];

const DECOYS: [number, number, number, number][] = [
  [0.166, 0.524, 0.987, 0.999], // foliage
  [0.115, 0.368, 0.995, 1.0], // gravel
  [0.307, 0.22, 0.9, 1.0], // brickwork
  [0.726, 0.031, 0.857, 0.262], // printed text
];

const BANDWIDTH = 0.12;
const DENSITY_C = 6350;
const DENSITY_K = 0.94;
const MIN_PER_MP = 10 ** 0.6 * 0.5;
const MAX_PER_MP = 10 ** 3.55 * 1.5;

function kernel(a: number[], f: CriticFeatures): number {
  const d2 =
    (a[0] - f.edge) ** 2 +
    (a[1] - f.lbp) ** 2 +
    (a[2] - f.orient) ** 2 +
    (a[3] - f.midtone) ** 2;
  return Math.exp(-d2 / (2 * BANDWIDTH * BANDWIDTH));
}

export function crowdness(f: CriticFeatures): number {
  const pos = Math.max(...ANCHORS.map((a) => kernel(a, f)));
  const neg = Math.max(...DECOYS.map((d) => kernel(d, f)));
  return Math.max(0, Math.min(1, pos / (pos + neg + 1e-9)));
}

export function priorCount(f: CriticFeatures, megapixels: number): number {
  const edge = Math.max(1e-4, Math.min(1, f.edge));
  const perMp = DENSITY_C * edge ** DENSITY_K;
  return (
    Math.max(MIN_PER_MP, Math.min(MAX_PER_MP, perMp)) * Math.max(0.05, megapixels)
  );
}

export function critique(
  f: CriticFeatures,
  people: number,
  megapixels: number,
): CriticResult {
  const mu = priorCount(f, megapixels);
  const cw = crowdness(f);

  const lg = Math.log10(Math.max(1, people));
  const lm = Math.log10(Math.max(1, mu));
  const disagree = Math.abs(lg - lm);
  const realism = Math.max(
    0,
    Math.min(1, Math.exp(-(disagree ** 2) / 0.42) * (0.45 + 0.55 * cw)),
  );

  const gain = Math.min(0.95, 1.55 * cw) * Math.min(1, disagree / 0.8);
  const target = 10 ** (lg + gain * (lm - lg));
  let adjust = people > 0 ? target / Math.max(1, people) : 1;
  if (cw < 0.5) adjust *= 0.25 + cw;

  return {
    realism: +realism.toFixed(4),
    crowdness: +cw.toFixed(4),
    priorCount: +mu.toFixed(1),
    adjust: +Math.max(0.1, Math.min(24, adjust)).toFixed(4),
    gain: +gain.toFixed(4),
  };
}

/** Apply the adversarial correction; returns refined count and score. */
export function refine(
  f: CriticFeatures,
  people: number,
  score: number,
  megapixels: number,
): { people: number; score: number; critic: CriticResult } {
  const critic = critique(f, people, megapixels);
  const refined = Math.max(0, Math.round(people * critic.adjust));
  const delta = Math.log10(Math.max(1, refined) / Math.max(1, people));
  const newScore = score * (1 + 0.35 * delta) * (0.6 + 0.4 * critic.crowdness);
  return { people: refined, score: Math.max(0, Math.min(1, newScore)), critic };
}
