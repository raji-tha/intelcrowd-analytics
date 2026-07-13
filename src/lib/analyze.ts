import type { Analysis, RiskLevel } from "./store";

// Deterministic pseudo-random from a string seed so results are stable per file.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function classify(count: number): { risk: RiskLevel; score: number } {
  if (count < 40) return { risk: "Low", score: Math.min(30, Math.round(count * 0.7)) };
  if (count < 120) return { risk: "Medium", score: 40 + Math.round((count - 40) * 0.4) };
  return { risk: "High", score: Math.min(98, 72 + Math.round((count - 120) * 0.15)) };
}

function densityLabel(d: number): RiskLevel {
  if (d < 1.2) return "Low";
  if (d < 3) return "Medium";
  return "High";
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
      "Prepare backup entry/exit channels.",
      "Broadcast wayfinding announcements to distribute flow.",
    ];
  return [
    "Open additional gates immediately to relieve pressure.",
    "Halt new entry until density subsides.",
    "Redirect crowd along pre-planned dispersal routes.",
    "Place emergency medical and evacuation teams on standby.",
  ];
}

/**
 * Mock crowd detector.
 * In the reference Python implementation this is replaced with
 * YOLOv8 person detection over the uploaded image / extracted video frames.
 */
export function analyzeFile(file: File, dataUrl: string): Analysis {
  const seed = hash(`${file.name}:${file.size}:${file.type}`);
  const rand = rng(seed);
  const base = Math.round(20 + rand() * 240); // 20 - 260 people
  const peopleCount = file.type.startsWith("video/") ? Math.round(base * 1.15) : base;
  const density = +(peopleCount / 80).toFixed(2);
  const { risk, score } = classify(peopleCount);

  const zones = Array.from({ length: 9 }).map((_, i) => {
    const share = 0.05 + rand() * 0.25;
    const c = Math.round(peopleCount * share);
    return {
      id: `Z${i + 1}`,
      count: c,
      level: densityLabel(c / 12),
    };
  });

  const growth = 0.9 + rand() * 0.6; // 0.9 - 1.5x in 15 min
  const expectedCount = Math.round(peopleCount * growth);
  const expectedRisk = classify(expectedCount).risk;

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileType: file.type.startsWith("video/") ? "video" : "image",
    imageDataUrl: dataUrl,
    peopleCount,
    density,
    densityLabel: densityLabel(density),
    risk,
    riskScore: score,
    zones,
    prediction: { horizonMin: 15, expectedCount, expectedRisk },
    recommendations: recommendationsFor(risk),
    createdAt: new Date().toISOString(),
  };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
