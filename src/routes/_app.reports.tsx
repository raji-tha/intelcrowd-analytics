import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Download, Trash2, X, FileSpreadsheet, Search, ImageIcon, Upload } from "lucide-react";
import { useAnalyses, clearAnalyses, deleteAnalysis, type RiskLevel } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { generateReportPdf } from "@/lib/pdf";
import { downloadAnalysesCsv } from "@/lib/export";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({
    meta: [
      { title: "Reports — CrowdVision AI" },
      {
        name: "description",
        content:
          "Browse, filter and export crowd analysis reports as PDF or CSV from CrowdVision AI.",
      },
      { property: "og:title", content: "Reports — CrowdVision AI" },
      {
        property: "og:description",
        content: "Browse, filter and export crowd analysis reports as PDF or CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const RISKS: (RiskLevel | "All")[] = ["All", "Low", "Medium", "High"];

function ReportsPage() {
  const analyses = useAnalyses();
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<RiskLevel | "All">("All");
  const [sort, setSort] = useState<"newest" | "oldest" | "count" | "risk">("newest");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = analyses.filter(
      (a) =>
        (risk === "All" || a.risk === risk) && (!term || a.fileName.toLowerCase().includes(term)),
    );
    const order: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
    return [...list].sort((x, y) => {
      if (sort === "newest") return +new Date(y.createdAt) - +new Date(x.createdAt);
      if (sort === "oldest") return +new Date(x.createdAt) - +new Date(y.createdAt);
      if (sort === "count") return y.peopleCount - x.peopleCount;
      return (order[y.risk] ?? 0) - (order[x.risk] ?? 0);
    });
  }, [analyses, q, risk, sort]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Download PDF reports for any past analysis.
          </p>
        </div>
        {analyses.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadAnalysesCsv(filtered)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input text-sm hover:bg-accent"
            >
              <FileSpreadsheet className="size-4" /> Export CSV
            </button>
            <button
              onClick={() => {
                if (confirm("Clear all analyses? This cannot be undone.")) clearAnalyses();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input text-sm hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-4" /> Clear all
            </button>
          </div>
        )}
      </div>

      {analyses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by file name…"
              aria-label="Search reports"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-input p-1">
            {RISKS.map((r) => (
              <button
                key={r}
                onClick={() => setRisk(r)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  risk === r ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Sort reports"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="count">Highest count</option>
            <option value="risk">Highest risk</option>
          </select>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {analyses.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No reports yet. Upload media to generate one.
            </p>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              <Upload className="size-4" /> Go to Upload
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No reports match your filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((a) => (
              <div key={a.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="size-12 rounded-md bg-muted overflow-hidden shrink-0 grid place-items-center text-muted-foreground">
                  {a.fileType === "image" && a.imageDataUrl ? (
                    <img
                      src={a.imageDataUrl}
                      alt={`Preview of ${a.fileName}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : a.fileType === "image" ? (
                    <ImageIcon className="size-5" />
                  ) : (
                    <FileText className="size-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{a.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()} · {a.peopleCount} people · density{" "}
                    {a.density}
                    {a.confidence != null && <> · confidence {a.confidence}%</>}
                    {a.verified && <> · AI verified</>}
                  </div>
                </div>
                <RiskBadge level={a.risk} />
                <button
                  onClick={() => generateReportPdf(a)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  <Download className="size-4" /> PDF
                </button>
                <button
                  onClick={() => deleteAnalysis(a.id)}
                  aria-label={`Delete report ${a.fileName}`}
                  className="inline-flex items-center justify-center size-9 rounded-md border border-input text-muted-foreground hover:text-destructive hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {analyses.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {analyses.length} reports.
        </p>
      )}
    </div>
  );
}
