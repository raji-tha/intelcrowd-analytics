import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAnalyses, type Analysis } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { MapPin, Map as MapIcon } from "lucide-react";

export const Route = createFileRoute("/_app/map")({
  head: () => ({ meta: [{ title: "Geo Map — CrowdVision AI" }] }),
  component: MapPage,
});

interface Pin {
  id: string;
  x: number; // 0..100 %
  y: number; // 0..100 %
  analysis: Analysis;
}

function MapPage() {
  const analyses = useAnalyses();
  const [active, setActive] = useState<Pin | null>(null);

  // Assign pseudo-geo coordinates deterministically from analysis id hash.
  const pins: Pin[] = analyses.map((a) => {
    let h = 0;
    for (let i = 0; i < a.id.length; i++) h = (h * 31 + a.id.charCodeAt(i)) >>> 0;
    return {
      id: a.id,
      x: 10 + (h % 80),
      y: 12 + ((h >> 8) % 70),
      analysis: a,
    };
  });

  const color = (r: string) =>
    r === "High" ? "var(--color-destructive)" : r === "Medium" ? "var(--color-warning)" : "var(--color-success)";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Geospatial view</h1>
        <p className="text-sm text-muted-foreground">
          Plot of analyses by location (pseudo-coordinates for the demo).
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
          <div className="relative aspect-[16/10] bg-[var(--color-muted)]">
            {/* decorative grid */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(var(--color-border) 1px,transparent 1px),linear-gradient(90deg,var(--color-border) 1px,transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/60">
              <MapIcon className="size-20" />
            </div>
            {pins.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p)}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                aria-label={p.analysis.fileName}
              >
                <span
                  className="block rounded-full ring-2 ring-background"
                  style={{
                    width: 14 + Math.min(16, p.analysis.riskScore / 6),
                    height: 14 + Math.min(16, p.analysis.riskScore / 6),
                    background: color(p.analysis.risk),
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="font-semibold mb-3">Selected point</div>
          {active ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" /> {active.x.toFixed(1)}, {active.y.toFixed(1)}
              </div>
              <div className="font-medium truncate">{active.analysis.fileName}</div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Risk</span>
                <RiskBadge level={active.analysis.risk} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Score</span>
                <span className="font-semibold">{active.analysis.riskScore}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">People</span>
                <span className="font-semibold">{active.analysis.peopleCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">When</span>
                <span>{new Date(active.analysis.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click a pin to inspect.</p>
          )}
        </div>
      </div>
    </div>
  );
}
