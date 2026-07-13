import type { RiskLevel } from "@/lib/store";

export function RiskBadge({ level }: { level: RiskLevel }) {
  const cls =
    level === "High"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : level === "Medium"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-success/15 text-success border-success/30";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {level} Risk
    </span>
  );
}
