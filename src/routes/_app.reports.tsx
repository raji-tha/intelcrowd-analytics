import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { FileText, Download, Trash2 } from "lucide-react";
import { getAnalyses, clearAnalyses } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { generateReportPdf } from "@/lib/pdf";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — CrowdVision AI" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const analyses = useMemo(() => getAnalyses(), []);

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
          <button
            onClick={() => {
              if (confirm("Clear all analyses? This cannot be undone.")) {
                clearAnalyses();
                location.reload();
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input text-sm hover:bg-accent"
          >
            <Trash2 className="size-4" /> Clear all
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {analyses.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No reports yet. Upload media to generate one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {analyses.map((a) => (
              <div key={a.id} className="p-4 flex items-center gap-4">
                <div className="size-12 rounded-md bg-muted overflow-hidden shrink-0">
                  {a.fileType === "image" ? (
                    <img src={a.imageDataUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground">
                      <FileText className="size-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{a.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()} · {a.peopleCount} people · density {a.density}
                  </div>
                </div>
                <RiskBadge level={a.risk} />
                <button
                  onClick={() => generateReportPdf(a)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  <Download className="size-4" /> PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
