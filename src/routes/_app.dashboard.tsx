import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users, AlertTriangle, Upload as UploadIcon, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { StatCard } from "@/components/StatCard";
import { RiskBadge } from "@/components/RiskBadge";
import { Heatmap } from "@/components/Heatmap";
import { getAnalyses } from "@/lib/store";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — CrowdVision AI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const analyses = useMemo(() => getAnalyses(), []);
  const latest = analyses[0];
  const today = analyses.filter(
    (a) => new Date(a.createdAt).toDateString() === new Date().toDateString(),
  );
  const avg =
    analyses.length > 0
      ? Math.round(analyses.reduce((s, a) => s + a.peopleCount, 0) / analyses.length)
      : 0;

  const trend = analyses
    .slice(0, 12)
    .reverse()
    .map((a, i) => ({
      name: `#${i + 1}`,
      count: a.peopleCount,
      risk: a.riskScore,
    }));

  const riskDistribution = ["Low", "Medium", "High"].map((r) => ({
    name: r,
    value: analyses.filter((a) => a.risk === r).length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">Real-time crowd intelligence at a glance.</p>
        </div>
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <UploadIcon className="size-4" /> New analysis
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current Crowd" value={latest?.peopleCount ?? "—"} icon={Users} />
        <StatCard
          label="Risk Level"
          value={latest?.risk ?? "—"}
          icon={AlertTriangle}
          tone={latest?.risk === "High" ? "danger" : latest?.risk === "Medium" ? "warning" : "success"}
        />
        <StatCard label="Today's Uploads" value={today.length} icon={UploadIcon} />
        <StatCard
          label="Predicted (15m)"
          value={latest?.prediction.expectedCount ?? "—"}
          hint={latest ? `Trend: ${latest.prediction.expectedRisk}` : undefined}
          icon={TrendingUp}
        />
      </div>

      {latest ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Latest analysis</div>
                <div className="font-semibold">{latest.fileName}</div>
              </div>
              <RiskBadge level={latest.risk} />
            </div>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="aspect-video rounded-lg overflow-hidden bg-muted grid place-items-center">
                {latest.fileType === "image" ? (
                  <img
                    src={latest.imageDataUrl}
                    alt={latest.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video src={latest.imageDataUrl} className="w-full h-full object-cover" muted />
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Zone heatmap
                </div>
                <Heatmap analysis={latest} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="font-semibold mb-3">Recommendations</div>
            <ul className="space-y-2">
              {latest.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center bg-card">
          <p className="text-sm text-muted-foreground">
            No analyses yet.{" "}
            <Link to="/upload" className="text-primary font-medium hover:underline">
              Upload an image or video
            </Link>{" "}
            to get started.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Crowd trend</div>
            <div className="text-xs text-muted-foreground">Last {trend.length} analyses</div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="risk" stroke="var(--color-chart-4)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="font-semibold mb-4">Risk distribution</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="value" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <div className="font-semibold mb-3">Recent analyses</div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {analyses.slice(0, 6).map((a) => (
            <div key={a.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{a.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()} · {a.peopleCount} people
                </div>
              </div>
              <RiskBadge level={a.risk} />
            </div>
          ))}
          {analyses.length === 0 && (
            <div className="p-6 text-sm text-center text-muted-foreground">No analyses yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
