import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive bg-destructive/10"
      : tone === "warning"
        ? "text-warning bg-warning/15"
        : tone === "success"
          ? "text-success bg-success/15"
          : "text-primary bg-primary/10";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={`size-10 rounded-lg grid place-items-center ${toneClass}`}>
            <Icon className="size-5" />
          </div>
        )}
      </div>
    </div>
  );
}
