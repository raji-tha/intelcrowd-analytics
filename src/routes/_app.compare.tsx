import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAnalyses, type Analysis } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { Heatmap } from "@/components/Heatmap";
import { GitCompareArrows } from "lucide-react";

export const Route = createFileRoute("/_app/compare")({
  head: () => ({ meta: [{ title: "Compare — CrowdVision AI" }] }),
  component: ComparePage,
});

function DiffRow({ label, a, b }: { label: string; a: number; b: number }) {
  const diff = b - a;
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const tone =
    diff > 0 ? "text-destructive" : diff < 0 ? "text-success" : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-3">
        <span className="font-medium tabular-nums">{a}</span>
        <span className={`${tone} font-medium tabular-nums`}>
          {arrow} {diff > 0 ? "+" : ""}
          {diff}
        </span>
        <span className="font-medium tabular-nums">{b}</span>
      </span>
    </div>
  );
}

function CompareCard({ a, label }: { a: Analysis | null; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      {a ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm truncate">{a.fileName}</div>
            <RiskBadge level={a.risk} />
          </div>
          <div className="aspect-video rounded-lg overflow-hidden bg-muted">
            {a.fileType === "image" ? (
              <img src={a.imageDataUrl} alt={a.fileName} className="w-full h-full object-cover" />
            ) : (
              <video src={a.imageDataUrl} className="w-full h-full object-cover" muted />
            )}
          </div>
          <Heatmap analysis={a} />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border border-border p-2">
              <div className="text-xs text-muted-foreground">People</div>
              <div className="font-semibold">{a.peopleCount}</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="text-xs text-muted-foreground">Risk score</div>
              <div className="font-semibold">{a.riskScore}/100</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="text-xs text-muted-foreground">Density</div>
              <div className="font-semibold">
                {a.density} · {a.densityLabel}
              </div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="text-xs text-muted-foreground">Predicted (15m)</div>
              <div className="font-semibold">
                {a.prediction.expectedCount} · {a.prediction.expectedRisk}
              </div>
            </div>
            {a.verified && (
              <div className="rounded-md border border-border p-2 col-span-2">
                <div className="text-xs text-muted-foreground">AI-verified count</div>
                <div className="font-semibold">
                  {a.aiCount} · {a.aiDescription}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground py-10 text-center">Select an analysis</div>
      )}
    </div>
  );
}

function ComparePage() {
  const analyses = useAnalyses();
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const left = useMemo(
    () => (leftId ? analyses.find((a) => a.id === leftId) ?? null : analyses[1] ?? analyses[0] ?? null),
    [analyses, leftId],
  );
  const right = useMemo(
    () => (rightId ? analyses.find((a) => a.id === rightId) ?? null : analyses[0] ?? null),
    [analyses, rightId],
  );

  if (analyses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center bg-card">
        <GitCompareArrows className="size-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-3">
          Upload at least one image to compare analyses.
        </p>
      </div>
    );
  }

  const Selector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {analyses.map((a) => (
        <option key={a.id} value={a.id}>
          {a.fileName} · {a.peopleCount} people
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compare analyses</h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side comparison to benchmark crowd changes over time.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">A</span>
          <Selector value={left?.id ?? ""} onChange={setLeftId} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">B</span>
          <Selector value={right?.id ?? ""} onChange={setRightId} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <CompareCard a={left} label="Analysis A" />
        <CompareCard a={right} label="Analysis B" />
      </div>

      {left && right && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="font-semibold mb-2">Difference (A → B)</div>
          <DiffRow label="People count" a={left.peopleCount} b={right.peopleCount} />
          <DiffRow label="Risk score" a={left.riskScore} b={right.riskScore} />
          <DiffRow
            label="Predicted (15m)"
            a={left.prediction.expectedCount}
            b={right.prediction.expectedCount}
          />
          {left.verified && right.verified && (
            <DiffRow label="AI count" a={left.aiCount ?? 0} b={right.aiCount ?? 0} />
          )}
          <div className="mt-3 text-xs text-muted-foreground">
            Confidence A: {left.confidence ?? "—"}% · B: {right.confidence ?? "—"}%
          </div>
        </div>
      )}
    </div>
  );
}
