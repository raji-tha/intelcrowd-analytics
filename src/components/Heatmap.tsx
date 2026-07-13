import type { Analysis } from "@/lib/store";

export function Heatmap({ analysis }: { analysis: Analysis }) {
  const max = Math.max(...analysis.zones.map((z) => z.count), 1);
  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-lg overflow-hidden border border-border p-1.5 bg-card">
      {analysis.zones.map((z) => {
        const intensity = z.count / max;
        const hue = 220 - intensity * 220; // blue -> red
        return (
          <div
            key={z.id}
            className="aspect-square rounded grid place-items-center text-xs font-medium text-white/90"
            style={{
              background: `oklch(${0.55 - intensity * 0.1} ${0.15 + intensity * 0.1} ${hue})`,
            }}
            title={`Zone ${z.id}: ${z.count} people (${z.level})`}
          >
            {z.count}
          </div>
        );
      })}
    </div>
  );
}
