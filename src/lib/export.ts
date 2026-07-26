import type { Analysis } from "./store";

/** Convert all analyses to a CSV string (semicolon-safe, quoted). */
export function analysesToCsv(items: Analysis[]): string {
  const headers = [
    "id",
    "fileName",
    "fileType",
    "peopleCount",
    "density",
    "densityLabel",
    "risk",
    "riskScore",
    "confidence",
    "aiCount",
    "aiConfidence",
    "aiDensity",
    "verified",
    "createdAt",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((a) =>
    [
      a.id,
      a.fileName,
      a.fileType,
      a.peopleCount,
      a.density,
      a.densityLabel,
      a.risk,
      a.riskScore,
      a.confidence ?? "",
      a.aiCount ?? "",
      a.aiConfidence ?? "",
      a.aiDensity ?? "",
      a.verified ?? "",
      a.createdAt,
    ]
      .map(esc)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

/** Trigger a client-side download of a text file. */
export function downloadText(content: string, filename: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadAnalysesCsv(items: Analysis[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(analysesToCsv(items), `crowdvision-analyses-${stamp}.csv`);
}
