import type { Analysis } from "@/lib/store";
import type { CpriBand } from "@/lib/alerts";

const BAND_STYLE: Record<CpriBand, { bg: string; text: string; ring: string }> = {
  Safe: { bg: "bg-success/10", text: "text-success", ring: "border-success/30" },
  Watch: { bg: "bg-success/10", text: "text-success", ring: "border-success/30" },
  Elevated: { bg: "bg-warning/10", text: "text-warning", ring: "border-warning/40" },
  Critical: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    ring: "border-destructive/40",
  },
  Red: {
    bg: "bg-destructive/15",
    text: "text-destructive",
    ring: "border-destructive/60",
  },
};

export function AlertPanel({ analysis }: { analysis: Analysis }) {
  const alerts = analysis.alerts ?? [];
  if (alerts.length === 0 && analysis.cpri == null) return null;
  const band = (analysis.cpriBand ?? "Safe") as CpriBand;
  const s = BAND_STYLE[band];

  return (
    <div className={`rounded-xl border ${s.ring} ${s.bg} p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            CPRI — Crowd Pressure &amp; Risk Index
          </div>
          <div className={`text-2xl font-semibold tabular-nums ${s.text}`}>
            {analysis.cpri ?? 0}/100 · {band}
          </div>
        </div>
        {analysis.cpriSub && (
          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            {(
              [
                ["Density", analysis.cpriSub.density],
                ["Turbulence", analysis.cpriSub.turbulence],
                ["Egress", analysis.cpriSub.egress],
                ["Occupancy", analysis.cpriSub.occupancy],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <div className="font-semibold tabular-nums">{v.toFixed(2)}</div>
                <div className="text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((a) => (
            <span
              key={a}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${s.ring} bg-card ${s.text}`}
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
