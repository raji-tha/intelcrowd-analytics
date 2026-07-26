import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAnalyses } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { Radio, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/monitor")({
  head: () => ({ meta: [{ title: "Live Monitor — CrowdVision AI" }] }),
  component: MonitorPage,
});

function MonitorPage() {
  const analyses = useAnalyses();
  const [threshold, setThreshold] = useState(60);

  const breaches = analyses.filter((a) => a.riskScore >= threshold);

  // rolling risk timeline (last 20 analyses)
  const recent = analyses.slice(0, 20).reverse();
  const max = 100;

  const [clock, setClock] = useState("");
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Live monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Threshold-based alerts and rolling risk timeline.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Radio className="size-4 text-primary animate-pulse" />
          <span className="font-mono tabular-nums">{clock || "—"}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="text-sm font-medium">Alert threshold: {threshold}/100</label>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
        </div>
        <div className={`px-3 py-2 rounded-md text-sm font-medium ${breaches.length > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
          {breaches.length > 0 ? `${breaches.length} breach${breaches.length > 1 ? "es" : ""} above threshold` : "No breaches"}
        </div>
      </div>

      {breaches.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2 font-medium text-destructive text-sm">
            <AlertTriangle className="size-4" /> Active alerts
          </div>
          {breaches.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm py-1">
              <span className="truncate">{a.fileName}</span>
              <RiskBadge level={a.risk} />
              <span className="font-semibold tabular-nums">{a.riskScore}/100</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="font-semibold mb-3">Rolling risk timeline</div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {recent.map((a) => {
              const h = (a.riskScore / max) * 100;
              const color =
                a.risk === "High" ? "var(--color-destructive)" : a.risk === "Medium" ? "var(--color-warning)" : "var(--color-success)";
              return (
                <div key={a.id} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${a.fileName}: ${a.riskScore}`}>
                  <div className="w-full rounded-t" style={{ height: `${h}%`, background: color, minHeight: 4 }} />
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center">{a.riskScore}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
