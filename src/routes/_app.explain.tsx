import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from "recharts";
import { useAnalyses } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { Brain, Info } from "lucide-react";

export const Route = createFileRoute("/_app/explain")({
  head: () => ({ meta: [{ title: "Explainability — CrowdVision AI" }] }),
  component: ExplainPage,
});

const FEATURE_LABELS: Record<string, string> = {
  edge: "Edge density",
  entropy: "Texture entropy",
  midtone: "Mid-tone ratio",
  contrast: "Local contrast",
  variance: "Luminance variance",
  brightness: "Brightness bias",
};

function ExplainPage() {
  const analyses = useAnalyses();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (selectedId) return analyses.find((a) => a.id === selectedId) ?? null;
    return analyses[0] ?? null;
  }, [analyses, selectedId]);

  const explain = analysis?.explain;

  const contributionData = useMemo(() => {
    if (!explain) return [];
    const raw = explain.contributions;
    const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
    return (Object.keys(raw) as string[])
      .filter((k) => raw[k] > 0.0001)
      .map((k) => ({
        feature: FEATURE_LABELS[k] ?? k,
        contribution: +raw[k].toFixed(4),
        share: +((raw[k] / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.contribution - a.contribution);
  }, [explain]);

  const subModelData = useMemo(() => {
    if (!explain) return [];
    return [
      { model: "Random Forest", score: +explain.subModels.rf.toFixed(3) },
      { model: "XGBoost", score: +explain.subModels.xgb.toFixed(3) },
      { model: "Decision Tree", score: +explain.subModels.dt.toFixed(3) },
    ];
  }, [explain]);

  const radarData = useMemo(() => {
    if (!explain) return [];
    const f = explain.features;
    return (Object.keys(FEATURE_LABELS) as string[]).map((k) => ({
      feature: FEATURE_LABELS[k],
      value: +((f as Record<string, number>)[k] ?? 0).toFixed(3),
    }));
  }, [explain]);

  const COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-chart-1)",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Model Explainability</h1>
          <p className="text-sm text-muted-foreground">
            SHAP-style breakdown of how each feature drives the risk score.
          </p>
        </div>
        {analyses.length > 0 && (
          <select
            value={analysis?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fileName} · {a.peopleCount} people
              </option>
            ))}
          </select>
        )}
      </div>

      {!analysis || !explain ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center bg-card">
          <Brain className="size-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">
            {analyses.length === 0
              ? "No analyses yet. Upload media to see the explainability breakdown."
              : "This analysis predates the explainability data. Upload a new image to generate a full breakdown."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Selected analysis</div>
              <div className="font-semibold">{analysis.fileName}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Risk score {analysis.riskScore}/100 · confidence {analysis.confidence ?? "—"}%
              </div>
            </div>
            <RiskBadge level={analysis.risk} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Feature contributions */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="font-semibold mb-1">Feature contributions</div>
              <p className="text-xs text-muted-foreground mb-4">
                Each feature's weighted push toward the raw ensemble score (before sigmoid calibration).
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={contributionData}
                    layout="vertical"
                    margin={{ left: 24, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="feature"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                      formatter={(v: number) => [v, "Contribution"]}
                    />
                    <Bar dataKey="contribution" radius={[0, 6, 6, 0]}>
                      {contributionData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sub-model vote */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="font-semibold mb-1">Ensemble sub-model votes</div>
              <p className="text-xs text-muted-foreground mb-4">
                The three classifiers' individual scores; the final score is a weighted vote
                (XGBoost 46%, RF 30%, DT 24%).
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subModelData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="model" stroke="var(--color-muted-foreground)" fontSize={10} />
                    <YAxis domain={[0, 1]} stroke="var(--color-muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]} fill="var(--color-chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Feature profile radar */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="font-semibold mb-1">Feature profile</div>
              <p className="text-xs text-muted-foreground mb-4">
                Raw normalized features (0–1) extracted from the frame.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--color-border)" />
                    <PolarAngleAxis dataKey="feature" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                    <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                    <Radar dataKey="value" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.4} />
                    <Legend />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Decision trace */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="font-semibold mb-3">Decision trace</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Raw ensemble score</span>
                  <span className="font-medium">
                    {Object.values(explain.contributions).reduce((s, v) => s + v, 0).toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sigmoid calibration</span>
                  <span className="font-medium">σ(·) around 0.40 midpoint</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Calibrated score</span>
                  <span className="font-medium">{(analysis.riskScore / 100).toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Classified risk</span>
                  <RiskBadge level={analysis.risk} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Decision Tree rule</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">
                    {explain.features.edge > 0.42
                      ? "edge > 0.42 → high"
                      : explain.features.edge > 0.22
                        ? "0.22 < edge ≤ 0.42 → medium"
                        : explain.features.contrast > 0.35
                          ? "contrast > 0.35 → low-medium"
                          : "low baseline"}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-background/60 rounded-md p-3 border border-border">
                <Info className="size-4 shrink-0 mt-0.5" />
                <span>
                  Contributions sum to the linear ensemble raw score; the sigmoid calibration
                  maps it to the final 0–100 risk score. This mirrors a SHAP additive explanation
                  for the ensemble's linear component.
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
