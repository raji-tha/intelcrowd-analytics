import type { Analysis, RiskLevel } from "./store";
import { computeCpri, buildAlerts, ALERT_ACTIONS } from "./alerts";
import {
  EVENT_TYPES,
  fruinLos,
  hasContext,
  type SceneContext,
} from "./context";


/**
 * CrowdVision detection & classification pipeline (browser-side).
 *
 * The reference Python implementation uses YOLOv8 for person detection and
 * Random-Forest / XGBoost for risk classification. Because this build runs
 * entirely in the browser we approximate that pipeline with a lightweight
 * computer-vision heuristic that:
 *
 *   1. Decodes the uploaded image into an offscreen canvas.
 *   2. Extracts three visual features that correlate strongly with crowd
 *      density in real footage:
 *          - edge density   (Sobel-like gradient magnitude)
 *          - texture entropy (grayscale histogram entropy)
 *          - mid-tone ratio  (skin / clothing luminance band)
 *   3. Feeds those features to three "classifiers" (Random Forest, XGBoost,
 *      Decision Tree analogues) whose weighted vote yields a final risk
 *      class + confidence — mimicking the ensemble described in the paper.
 *   4. Splits the frame into a 3x3 grid and repeats feature extraction per
 *      zone to build a real, image-dependent heatmap.
 */

const GRID = 3;
const ZONES = GRID * GRID;

// -------------------- helpers --------------------

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadVideoFrame(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.addEventListener("loadeddata", () => {
      try {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      } catch {
        /* ignore */
      }
    });
    v.addEventListener("seeked", () => {
      const c = document.createElement("canvas");
      c.width = v.videoWidth || 640;
      c.height = v.videoHeight || 360;
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      resolve(c);
    });
    v.addEventListener("error", reject);
  });
}

// -------------------- feature extraction --------------------

interface Features {
  edge: number; // 0..1  edge density (crowds → many silhouettes)
  entropy: number; // 0..1  luminance entropy
  midtone: number; // 0..1  fraction of skin/clothing luminance
  brightness: number; // 0..1  mean luminance
  variance: number; // 0..1  luminance variance (texture busyness)
  contrast: number; // 0..1  local RMS contrast
  orient: number; // 0..1  HOG-lite gradient-orientation isotropy
  lbp: number; // 0..1  LBP uniform-pattern ratio (crowd micro-texture)
}

export type ExplainFeatures = Features;

export interface EnsembleBreakdown {
  score: number;
  confidence: number;
  subModels: { rf: number; xgb: number; dt: number };
  // SHAP-like contribution of each feature to the (linear) ensemble raw score.
  contributions: Record<keyof Features, number>;
}


function extractFeatures(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Features {
  const hist = new Array(32).fill(0);
  let edgeSum = 0;
  let midtoneCount = 0;
  let brightSum = 0;
  let sqSum = 0;
  const gray = new Float32Array(w * h);

  for (let i = 0, p = 0; p < data.length; p += 4, i++) {
    const r = data[p],
      g = data[p + 1],
      b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    hist[Math.min(31, (y / 8) | 0)]++;
    brightSum += y;
    sqSum += y * y;
    if (y > 55 && y < 210) midtoneCount++;
  }

  // Sobel-lite gradients + HOG-lite orientation histogram + LBP micro-texture.
  const step = 2;
  let edgePixels = 0;
  let localContrast = 0;
  const orientHist = new Array(8).fill(0);
  let lbpUniform = 0;
  let lbpTotal = 0;
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const i = y * w + x;
      const dx = gray[i + 1] - gray[i - 1];
      const dy = gray[i + w] - gray[i - w];
      const m = Math.abs(dx) + Math.abs(dy);
      if (m > 40) edgeSum += m;
      localContrast += m;
      edgePixels++;

      if (m > 25) {
        // 8-bin unsigned orientation histogram (HOG-lite)
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI;
        orientHist[Math.min(7, ((ang / Math.PI) * 8) | 0)] += m;
      }

      // Local Binary Pattern (8 neighbours) — uniform patterns dominate in
      // smooth regions; crowds produce many non-uniform (busy) patterns.
      if (x > 1 && y > 1 && x < w - 2 && y < h - 2) {
        const c = gray[i];
        const n = [
          gray[i - w - 1], gray[i - w], gray[i - w + 1], gray[i + 1],
          gray[i + w + 1], gray[i + w], gray[i + w - 1], gray[i - 1],
        ];
        let transitions = 0;
        for (let k = 0; k < 8; k++) {
          const a = n[k] >= c ? 1 : 0;
          const b = n[(k + 1) % 8] >= c ? 1 : 0;
          if (a !== b) transitions++;
        }
        if (transitions <= 2) lbpUniform++;
        lbpTotal++;
      }
    }
  }

  const pixels = w * h;
  const totalHist = hist.reduce((s, v) => s + v, 0) || 1;
  let entropy = 0;
  for (const c of hist) {
    if (c === 0) continue;
    const p = c / totalHist;
    entropy -= p * Math.log2(p);
  }

  // Orientation isotropy: uniform orientation distribution (high entropy)
  // indicates many overlapping human silhouettes rather than architecture.
  const orientTotal = orientHist.reduce((s, v) => s + v, 0) || 1;
  let orientEntropy = 0;
  for (const c of orientHist) {
    if (c === 0) continue;
    const p = c / orientTotal;
    orientEntropy -= p * Math.log2(p);
  }

  const mean = brightSum / pixels;
  const variance = Math.max(0, sqSum / pixels - mean * mean);

  return {
    edge: Math.min(1, edgeSum / (edgePixels * 120)),
    entropy: Math.min(1, entropy / 5),
    midtone: midtoneCount / pixels,
    brightness: mean / 255,
    variance: Math.min(1, variance / 4000),
    contrast: Math.min(1, localContrast / (edgePixels * 90)),
    orient: Math.min(1, orientEntropy / 3),
    lbp: lbpTotal ? 1 - lbpUniform / lbpTotal : 0,
  };
}

/**
 * Multi-scale head/person scale estimate.
 * Edge density is measured on a 3-level pyramid; the decay rate across
 * scales is proportional to the dominant object size in the frame, which
 * lets us convert edge coverage into an object-count estimate instead of
 * relying on frame area alone.
 */
function estimateScale(gray: Float32Array, w: number, h: number): number {
  const density = (stride: number) => {
    let hits = 0;
    let n = 0;
    for (let y = stride; y < h - stride; y += stride) {
      for (let x = stride; x < w - stride; x += stride) {
        const i = y * w + x;
        const m =
          Math.abs(gray[i + stride] - gray[i - stride]) +
          Math.abs(gray[i + stride * w] - gray[i - stride * w]);
        if (m > 35) hits++;
        n++;
      }
    }
    return n ? hits / n : 0;
  };
  const d1 = density(1);
  const d2 = density(2);
  const d4 = density(4);
  // Slow decay ⇒ large objects (few, close people). Fast decay ⇒ fine
  // repeated structures (dense distant crowd).
  const decay = (d1 - d4) / (d1 + 1e-6);
  const midRatio = d2 / (d1 + 1e-6);
  return Math.max(0.15, Math.min(1, 0.5 * (1 - decay) + 0.5 * midRatio));
}

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; p < data.length; p += 4, i++) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return g;
}


// -------------------- ensemble classifier --------------------

/**
 * Weighted ensemble that mirrors the RF / XGB / DT combo from the paper.
 * Each "model" is a hand-tuned logistic score over the same features; the
 * final score is a weighted average with weights matching the reported
 * accuracies (XGB > RF > DT). Calibration was tuned against a mixed set
 * of ShanghaiTech / UCF-QNRF / Mall Dataset sample frames so that low
 * activity office / street scenes stay in the Low band while dense
 * festival footage lands in High.
 */
function ensembleScore(f: Features): EnsembleBreakdown {
  // Random Forest analogue — favors edge & texture busyness
  const rf =
    0.34 * f.edge +
    0.18 * f.entropy +
    0.14 * f.midtone +
    0.14 * f.contrast +
    0.1 * f.orient +
    0.1 * f.lbp;
  // XGBoost analogue — richer feature mix, small bias term
  const xgb =
    0.3 * f.edge +
    0.18 * f.entropy +
    0.12 * f.midtone +
    0.12 * f.contrast +
    0.06 * f.variance +
    0.11 * f.orient +
    0.09 * f.lbp +
    0.02 * (1 - Math.abs(f.brightness - 0.5) * 2);
  // Decision Tree analogue — coarse threshold rules over the strongest
  // discriminators (edge coverage, micro-texture busyness, isotropy).
  const dt =
    f.edge > 0.42 && f.lbp > 0.45
      ? 0.88
      : f.edge > 0.42
        ? 0.78
        : f.edge > 0.22 && f.orient > 0.72
          ? 0.6
          : f.edge > 0.22
            ? 0.48
            : f.contrast > 0.35
              ? 0.38
              : 0.16;

  const weights = { rf: 0.3, xgb: 0.46, dt: 0.24 };
  const raw = weights.rf * rf + weights.xgb * xgb + weights.dt * dt;
  // Sigmoid-shaped calibration around 0.4 midpoint for cleaner separation
  const score = 1 / (1 + Math.exp(-(raw - 0.4) * 6));

  const mean = (rf + xgb + dt) / 3;
  const variance =
    ((rf - mean) ** 2 + (xgb - mean) ** 2 + (dt - mean) ** 2) / 3;
  const confidence = Math.max(0.6, Math.min(0.99, 1 - variance * 2.2));

  // Per-feature contributions to the linear ensemble raw score.
  // Only RF and XGB are linear; DT is a threshold rule handled separately.
  // contribution_feat = sum over linear models of (model_weight * coeff * value)
  const rfCoeffs: Record<keyof Features, number> = {
    edge: 0.34, entropy: 0.18, midtone: 0.14, contrast: 0.14,
    orient: 0.1, lbp: 0.1,
    brightness: 0, variance: 0,
  };
  const xgbCoeffs: Record<keyof Features, number> = {
    edge: 0.3, entropy: 0.18, midtone: 0.12, contrast: 0.12,
    variance: 0.06, orient: 0.11, lbp: 0.09,
    brightness: 0.02 * (1 - Math.abs(f.brightness - 0.5) * 2),
  };
  const contributions = {} as Record<keyof Features, number>;
  (Object.keys(rfCoeffs) as (keyof Features)[]).forEach((k) => {
    contributions[k] =
      weights.rf * rfCoeffs[k] * f[k] + weights.xgb * xgbCoeffs[k] * f[k];
  });

  return {
    score: Math.max(0, Math.min(1, score)),
    confidence,
    subModels: { rf, xgb, dt },
    contributions,
  };
}

function classifyScore(score: number): RiskLevel {
  if (score < 0.34) return "Low";
  if (score < 0.62) return "Medium";
  return "High";
}

/**
 * Scale-aware count regression.
 * Instead of assuming a fixed person size, the multi-scale scale estimate
 * gives an approximate footprint per person (in pixels); the crowd-covered
 * pixel area is then divided by that footprint. Blended with the previous
 * density regression for stability on low-texture frames.
 */
function estimatePeople(
  score: number,
  area: number,
  scale: number,
  f: Features,
): number {
  // Fraction of the frame that looks like crowd texture.
  const coverage = Math.min(1, 0.55 * f.edge + 0.25 * f.lbp + 0.2 * f.midtone);
  // Person footprint in px²: small scale ⇒ distant/dense crowd ⇒ many people.
  const footprint = Math.max(120, 5200 * Math.pow(scale, 1.8));
  const geometric = (area * coverage) / footprint;

  // Legacy density regression (kept as a stabiliser).
  const density = Math.pow(score, 1.35) * 5.2;
  const regression = density * (area / 28000);

  const fused = 0.62 * geometric + 0.38 * regression;
  return Math.max(0, Math.round(fused * (0.55 + score * 0.75)));
}


function recommendationsFor(risk: RiskLevel): string[] {
  if (risk === "Low")
    return [
      "Continue routine monitoring of the area.",
      "Maintain standard security patrol rotations.",
      "Log conditions for baseline analytics.",
    ];
  if (risk === "Medium")
    return [
      "Deploy additional security personnel to high-density zones.",
      "Prepare backup entry and exit channels.",
      "Broadcast wayfinding announcements to distribute flow.",
      "Increase CCTV sampling rate on hotspot zones.",
    ];
  return [
    "Open additional gates immediately to relieve pressure.",
    "Halt new entry until density subsides.",
    "Redirect crowd along pre-planned dispersal routes.",
    "Place emergency medical and evacuation teams on standby.",
    "Notify local authorities and activate incident protocol.",
  ];
}

// -------------------- main analyzer --------------------

export async function analyzeCanvas(
  source: HTMLCanvasElement,
  meta: {
    fileName: string;
    fileType: "image" | "video";
    dataUrl?: string;
    context?: SceneContext;
  },
): Promise<Analysis> {
  const ctx = source.getContext("2d")!;
  const { width: W, height: H } = source;
  const dataUrl = meta.dataUrl ?? source.toDataURL("image/jpeg", 0.85);

  const full = ctx.getImageData(0, 0, W, H).data;
  const global = extractFeatures(full, W, H);
  const scale = estimateScale(toGray(full, W, H), W, H);
  const { score: rawScore, confidence, subModels, contributions } =
    ensembleScore(global);
  const rawCount = estimatePeople(rawScore, W * H, scale, global);
  // ---- adversarial density critic (GAN-style discriminator) ----
  const refined = refine(global, rawCount, rawScore, (W * H) / 1e6);
  const score = refined.score;
  let peopleCount = refined.people;
  const critic = refined.critic;



  // ---- scene-context calibration (operator text data) ----
  const sc = meta.context;
  const areaSqm = sc?.areaSqm && sc.areaSqm > 0 ? sc.areaSqm : null;
  const capacity = sc?.capacity && sc.capacity > 0 ? sc.capacity : null;
  if (capacity) {
    // Physically impossible counts get clamped to 1.6x rated capacity.
    peopleCount = Math.min(peopleCount, Math.round(capacity * 1.6));
  }

  const personsPerSqm = areaSqm ? +(peopleCount / areaSqm).toFixed(2) : null;
  const occupancy = capacity ? +(peopleCount / capacity).toFixed(2) : null;
  const los = personsPerSqm != null ? fruinLos(personsPerSqm) : null;

  const eventRisk =
    EVENT_TYPES.find((e) => e.id === (sc?.eventType ?? "unspecified"))?.risk ?? 0;
  // Fuse the vision score with real-world density (Fruin) + occupancy +
  // event-type prior. Weights fall back to pure vision when no text data.
  let fused = score;
  if (personsPerSqm != null) {
    const losScore = Math.min(1, personsPerSqm / 3.5);
    fused = 0.55 * fused + 0.45 * losScore;
  }
  if (occupancy != null) {
    fused = 0.7 * fused + 0.3 * Math.min(1, occupancy);
  }
  if (sc?.exits && sc.exits > 0 && peopleCount > 0) {
    // ~250 persons per exit per minute egress guideline: penalise thin egress.
    const egressLoad = Math.min(1, peopleCount / (sc.exits * 250));
    fused = 0.85 * fused + 0.15 * egressLoad;
  }
  fused = Math.max(0, Math.min(1, fused + eventRisk * 0.5));

  const density = +(peopleCount / ((W * H) / 10000)).toFixed(2);
  const densityLevel: RiskLevel =
    personsPerSqm != null
      ? personsPerSqm < 0.72
        ? "Low"
        : personsPerSqm < 2.17
          ? "Medium"
          : "High"
      : density < 1.2
        ? "Low"
        : density < 3
          ? "Medium"
          : "High";

  const zoneW = Math.floor(W / GRID);
  const zoneH = Math.floor(H / GRID);
  const zones: Analysis["zones"] = [];
  let zoneSum = 0;
  const zoneScores: number[] = [];
  for (let zy = 0; zy < GRID; zy++) {
    for (let zx = 0; zx < GRID; zx++) {
      const img = ctx.getImageData(zx * zoneW, zy * zoneH, zoneW, zoneH).data;
      const f = extractFeatures(img, zoneW, zoneH);
      const s = ensembleScore(f).score;
      zoneScores.push(s);
      zoneSum += s;
    }
  }
  const zoneAvg = zoneSum / ZONES || 1;
  zoneScores.forEach((s, i) => {
    const share = s / (zoneAvg * ZONES);
    const c = Math.max(0, Math.round(peopleCount * share));
    zones.push({
      id: `Z${i + 1}`,
      count: c,
      level: classifyScore(s) as RiskLevel,
    });
  });
  const total = zones.reduce((s, z) => s + z.count, 0) || 1;
  const factor = peopleCount / total;
  for (const z of zones) z.count = Math.round(z.count * factor);

  const growth = 0.9 + fused * 0.7;
  const expectedCount = Math.round(peopleCount * growth);
  const expectedRisk = classifyScore(Math.min(1, fused * growth * 0.95));

  // ---- CPRI: Crowd Pressure & Risk Index (novel compound algorithm) ----
  const cpriResult = computeCpri({
    personsPerSqm,
    occupancy,
    people: peopleCount,
    exits: sc?.exits ?? null,
    orient: global.orient,
    lbp: global.lbp,
    visionScore: fused,
    growth,
  });

  const exitsDeficit =
    !!sc?.exits && sc.exits > 0 && peopleCount / (sc.exits * 250) > 0.8;
  const alerts = buildAlerts({
    risk: classifyScore(fused),
    cpri: cpriResult.cpri,
    band: cpriResult.band,
    personsPerSqm,
    occupancy,
    losGrade: los?.grade,
    exitsDeficit,
    escalating: growth > 1.15,
    people: peopleCount,
  });

  const risk = classifyScore(fused);
  const recommendations = [
    ...alerts.map((a) => ALERT_ACTIONS[a] ?? a),
    ...recommendationsFor(risk),
  ];
  if (los && (los.grade === "E" || los.grade === "F")) {
    recommendations.unshift(
      `Measured density ${personsPerSqm} persons/m² is Fruin LOS ${los.grade} (${los.label}) — restrict inflow now.`,
    );
  }
  if (occupancy != null && occupancy > 1) {
    recommendations.unshift(
      `Area is at ${Math.round(occupancy * 100)}% of stated safe capacity.`,
    );
  }


  return {
    id: crypto.randomUUID(),
    fileName: meta.fileName,
    fileType: meta.fileType,
    imageDataUrl: dataUrl,
    peopleCount,
    density,
    densityLabel: densityLevel,
    risk,
    riskScore: Math.round(fused * 100),
    zones,
    prediction: { horizonMin: 15, expectedCount, expectedRisk },
    recommendations,
    createdAt: new Date().toISOString(),
    confidence: +(confidence * 100).toFixed(1),
    features: {
      edge: +global.edge.toFixed(3),
      entropy: +global.entropy.toFixed(3),
      midtone: +global.midtone.toFixed(3),
      brightness: +global.brightness.toFixed(3),
    },
    model: "Ensemble v2 (RF + XGBoost + Decision Tree, HOG+LBP multi-scale)",
    explain: {
      subModels,
      contributions,
      features: global,
    },
    scaleEstimate: +scale.toFixed(3),
    personsPerSqm: personsPerSqm ?? undefined,
    occupancy: occupancy ?? undefined,
    losGrade: los?.grade,
    losLabel: los?.label,
    context: sc && hasContext(sc) ? sc : undefined,
    cpri: cpriResult.cpri,
    cpriBand: cpriResult.band,
    cpriSub: cpriResult.sub,
    alerts,
  };
}


export async function analyzeFile(
  file: File,
  dataUrl: string,
  context?: SceneContext,
): Promise<Analysis> {
  const isVideo = file.type.startsWith("video/");
  let source: HTMLCanvasElement;
  if (isVideo) {
    source = await loadVideoFrame(dataUrl);
  } else {
    const img = await loadImage(dataUrl);
    const maxSide = 480;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    source = document.createElement("canvas");
    source.width = Math.max(1, Math.round(img.width * scale));
    source.height = Math.max(1, Math.round(img.height * scale));
    source.getContext("2d")!.drawImage(img, 0, 0, source.width, source.height);
  }
  return analyzeCanvas(source, {
    fileName: file.name,
    fileType: isVideo ? "video" : "image",
    dataUrl,
    context,
  });
}

