/**
 * DCDN-A — Dilated Convolutional Density Network with Zone Self-Attention.
 * TypeScript port of python-app/crowdvision/deepnet.py.
 *
 * Training-free deep stage: three dilated Gabor columns (MCNN-style
 * multi-column CNN) → orientation max-pooling → Difference-of-Gaussians blob
 * head → softplus density map → 3×3 zone tokens → single-head scaled
 * dot-product self-attention → attention-reweighted count.
 *
 * Kernels are the analytic approximations of the first conv layers learned by
 * CNNs on natural images, so the network needs no shipped weights. Scale
 * constants were fitted by log-log least squares on the synthetic validation
 * harness (γ = 2.049, α = 3.763e6 at 0.92 MP).
 */

const NET_SIDE = 192;
const GAMMA = 2.049;
const ALPHA = 3.763e6;
const REF_MP = 0.9216;
const ATTN_TEMP = 0.65;

export interface DeepResult {
  count: number;
  densityMean: number;
  densityPeak: number;
  attention: number[];
  activation: { d1: number; d2: number; d4: number };
  focus: number;
  agreement: number;
}

interface Plane {
  d: Float32Array;
  w: number;
  h: number;
}

function gabor(theta: number, sigma = 1.6, lam = 3.4, k = 5): Float32Array {
  const r = (k - 1) / 2;
  const out = new Float32Array(k * k);
  let mean = 0;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const xr = x * Math.cos(theta) + y * Math.sin(theta);
      const yr = -x * Math.sin(theta) + y * Math.cos(theta);
      const v =
        Math.exp(-(xr * xr + 0.6 * yr * yr) / (2 * sigma * sigma)) *
        Math.cos((2 * Math.PI * xr) / lam);
      out[(y + r) * k + (x + r)] = v;
      mean += v;
    }
  }
  mean /= k * k;
  let norm = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    norm += Math.abs(out[i]);
  }
  if (norm > 0) for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function dog(s1 = 1.0, s2 = 2.2, k = 7): Float32Array {
  const r = (k - 1) / 2;
  const out = new Float32Array(k * k);
  let mean = 0;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const g1 =
        Math.exp(-(x * x + y * y) / (2 * s1 * s1)) / (2 * Math.PI * s1 * s1);
      const g2 =
        Math.exp(-(x * x + y * y) / (2 * s2 * s2)) / (2 * Math.PI * s2 * s2);
      const v = g1 - g2;
      out[(y + r) * k + (x + r)] = v;
      mean += v;
    }
  }
  mean /= k * k;
  let norm = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    norm += Math.abs(out[i]);
  }
  if (norm > 0) for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

const ORIENTS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
const GABORS = ORIENTS.map((t) => gabor(t));
const DOG = dog();

function conv(p: Plane, kern: Float32Array, k: number, dil: number): Plane {
  const span = (k - 1) * dil;
  const ow = p.w - span;
  const oh = p.h - span;
  if (ow <= 0 || oh <= 0) return { d: new Float32Array(1), w: 1, h: 1 };
  const out = new Float32Array(ow * oh);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const v = kern[i * k + j];
      if (v === 0) continue;
      const oy = i * dil;
      const ox = j * dil;
      for (let y = 0; y < oh; y++) {
        const src = (y + oy) * p.w + ox;
        const dst = y * ow;
        for (let x = 0; x < ow; x++) out[dst + x] += v * p.d[src + x];
      }
    }
  }
  return { d: out, w: ow, h: oh };
}

function downscale(gray: Float32Array, w: number, h: number): Plane {
  const m = Math.max(w, h);
  if (m <= NET_SIDE) {
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = gray[i] / 255;
    return { d, w, h };
  }
  const step = m / NET_SIDE;
  const ow = Math.max(1, Math.floor(w / step));
  const oh = Math.max(1, Math.floor(h / step));
  const d = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    const sy = Math.min(h - 1, Math.floor(y * step));
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(w - 1, Math.floor(x * step));
      d[y * ow + x] = gray[sy * w + sx] / 255;
    }
  }
  return { d, w: ow, h: oh };
}

function softplus(a: number): number {
  return Math.log1p(Math.exp(Math.max(-30, Math.min(30, a))));
}

/** Convolutional stack → density map + per-column mean activation. */
export function densityMap(
  gray: Float32Array,
  w: number,
  h: number,
): { map: Plane; activation: { d1: number; d2: number; d4: number } } {
  const x = downscale(gray, w, h);
  const empty = { d: new Float32Array(1), w: 1, h: 1 };
  if (x.w < 16 || x.h < 16)
    return { map: empty, activation: { d1: 0, d2: 0, d4: 0 } };

  const cols: Plane[] = [];
  const act: number[] = [];
  for (const dil of [1, 2, 4]) {
    const resp = GABORS.map((g) => conv(x, g, 5, dil));
    const cw = Math.min(...resp.map((r) => r.w));
    const ch = Math.min(...resp.map((r) => r.h));
    const pooled = new Float32Array(cw * ch);
    let sum = 0;
    for (let y = 0; y < ch; y++) {
      for (let xi = 0; xi < cw; xi++) {
        let best = 0;
        for (const r of resp) {
          const v = Math.abs(r.d[y * r.w + xi]);
          if (v > best) best = v;
        }
        pooled[y * cw + xi] = best;
        sum += best;
      }
    }
    cols.push({ d: pooled, w: cw, h: ch });
    act.push(sum / Math.max(1, cw * ch));
  }

  const fw = Math.min(...cols.map((c) => c.w));
  const fh = Math.min(...cols.map((c) => c.h));
  const blob = conv(x, DOG, 7, 1);
  let blobMax = 1e-6;
  for (let i = 0; i < blob.d.length; i++) {
    const v = Math.max(0, blob.d[i]);
    blob.d[i] = v;
    if (v > blobMax) blobMax = v;
  }
  const ow = Math.min(fw, blob.w);
  const oh = Math.min(fh, blob.h);
  const out = new Float32Array(ow * oh);
  const base = softplus(-0.55);
  const wts = [0.5, 0.3, 0.2];
  for (let y = 0; y < oh; y++) {
    for (let xi = 0; xi < ow; xi++) {
      let fused = 0;
      for (let c = 0; c < 3; c++) fused += wts[c] * cols[c].d[y * cols[c].w + xi];
      const g = 0.35 + (1.65 * blob.d[y * blob.w + xi]) / blobMax;
      out[y * ow + xi] = softplus(6 * fused * g - 0.55) - base;
    }
  }
  return {
    map: { d: out, w: ow, h: oh },
    activation: { d1: act[0], d2: act[1], d4: act[2] },
  };
}

/** Single-head scaled dot-product self-attention over the 9 zone tokens. */
function attention(tokens: number[][]): number[] {
  const dim = tokens[0].length;
  const mean = new Array(dim).fill(0);
  for (const t of tokens) for (let i = 0; i < dim; i++) mean[i] += t[i] / tokens.length;
  const q = tokens.map((t) => t.map((v, i) => v - mean[i]));
  const scale = Math.sqrt(dim) * ATTN_TEMP;
  const ctx0: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const logits = tokens.map((_, j) => q[i].reduce((s, v, d) => s + v * q[j][d], 0) / scale);
    const mx = Math.max(...logits);
    const ex = logits.map((l) => Math.exp(l - mx));
    const sum = ex.reduce((a, b) => a + b, 0) || 1;
    ctx0.push(ex.reduce((s, e, j) => s + (e / sum) * tokens[j][0], 0));
  }
  const pos = ctx0.map((v) => Math.max(0, v));
  const total = pos.reduce((a, b) => a + b, 0);
  return total > 0 ? pos.map((v) => v / total) : pos.map(() => 1 / 9);
}

export function infer(
  gray: Float32Array,
  w: number,
  h: number,
  megapixels: number,
  ensembleCount: number,
): DeepResult {
  const { map, activation } = densityMap(gray, w, h);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < map.d.length; i++) {
    sum += map.d[i];
    if (map.d[i] > peak) peak = map.d[i];
  }
  const mean = sum / Math.max(1, map.d.length);

  const zh = Math.max(1, Math.floor(map.h / 3));
  const zw = Math.max(1, Math.floor(map.w / 3));
  const tokens: number[][] = [];
  for (let zy = 0; zy < 3; zy++) {
    for (let zx = 0; zx < 3; zx++) {
      let s = 0;
      let mx = 0;
      let sq = 0;
      let n = 0;
      let active = 0;
      for (let y = zy * zh; y < (zy + 1) * zh && y < map.h; y++) {
        for (let x = zx * zw; x < (zx + 1) * zw && x < map.w; x++) {
          const v = map.d[y * map.w + x];
          s += v;
          sq += v * v;
          if (v > mx) mx = v;
          if (v > mean) active++;
          n++;
        }
      }
      n = Math.max(1, n);
      const m = s / n;
      tokens.push([m, mx, Math.sqrt(Math.max(0, sq / n - m * m)), active / n]);
    }
  }
  const attn = attention(tokens);

  const zoneMean = tokens.reduce((s, t) => s + t[0], 0) / tokens.length;
  const weightedMean = attn.reduce((s, a, i) => s + a * tokens[i][0], 0);
  const energy = 0.6 * mean + 0.4 * (weightedMean * 9) / 9 || 0.6 * mean + 0.4 * zoneMean;

  const count =
    ALPHA * Math.pow(Math.max(1e-6, energy), GAMMA) * (Math.max(0.05, megapixels) / REF_MP);

  const entropy = -attn.reduce((s, a) => s + a * Math.log(a + 1e-9), 0) / Math.log(9);
  const lg = Math.log10(Math.max(1, count));
  const le = Math.log10(Math.max(1, ensembleCount));
  const agreement = Math.exp(-((lg - le) ** 2) / 0.5);

  return {
    count: +count.toFixed(1),
    densityMean: +mean.toFixed(5),
    densityPeak: +peak.toFixed(4),
    attention: attn.map((a) => +a.toFixed(4)),
    activation: {
      d1: +activation.d1.toFixed(5),
      d2: +activation.d2.toFixed(5),
      d4: +activation.d4.toFixed(5),
    },
    focus: +(1 - entropy).toFixed(4),
    agreement: +agreement.toFixed(4),
  };
}

/** Confidence-weighted log-space fusion with the hand-crafted ensemble count. */
export function fuse(
  ensembleCount: number,
  deep: DeepResult,
  crowdness = 1,
): number {
  const trust = Math.max(0, Math.min(1, (crowdness - 0.45) / 0.15));
  const w = 0.78 * Math.pow(deep.agreement, 1.5) * trust * (0.7 + 0.3 * deep.focus);
  const lg = Math.log10(Math.max(1, ensembleCount));
  const ld = Math.log10(Math.max(1, deep.count));
  return Math.max(0, Math.round(10 ** ((1 - w) * lg + w * ld)));
}
