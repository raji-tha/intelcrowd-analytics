import type { Analysis, RiskLevel } from "@/lib/store";

const RISK_COLORS: Record<RiskLevel, { base: string; ring: string; text: string }> = {
  Low: { base: "oklch(0.72 0.17 150)", ring: "oklch(0.55 0.18 150)", text: "text-white" },
  Medium: { base: "oklch(0.8 0.17 75)", ring: "oklch(0.62 0.18 65)", text: "text-black" },
  High: { base: "oklch(0.62 0.23 25)", ring: "oklch(0.45 0.22 25)", text: "text-white" },
};

export function Heatmap({ analysis }: { analysis: Analysis }) {
  const max = Math.max(...analysis.zones.map((z) => z.count), 1);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5 rounded-lg overflow-hidden border border-border p-1.5 bg-card">
        {analysis.zones.map((z) => {
          const intensity = Math.min(1, z.count / max);
          const c = RISK_COLORS[z.level];
          return (
            <div
              key={z.id}
              className={`aspect-square rounded grid place-items-center text-xs font-semibold ${c.text}`}
              style={{
                background: `radial-gradient(circle at 30% 30%, ${c.base}, ${c.ring})`,
                opacity: 0.5 + intensity * 0.5,
                boxShadow: `inset 0 0 0 1px ${c.ring}`,
              }}
              title={`Zone ${z.id}: ${z.count} people (${z.level} risk)`}
            >
              {z.count}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        {(["Low", "Medium", "High"] as RiskLevel[]).map((l) => (
          <div key={l} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: RISK_COLORS[l].base, boxShadow: `inset 0 0 0 1px ${RISK_COLORS[l].ring}` }}
            />
            {l} risk
          </div>
        ))}
      </div>
    </div>
  );
}
