import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { UploadCloud, Loader2, FileText } from "lucide-react";
import { analyzeFile, fileToDataUrl } from "@/lib/analyze";
import { saveAnalysis, type Analysis } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { Heatmap } from "@/components/Heatmap";
import { generateReportPdf } from "@/lib/pdf";

export const Route = createFileRoute("/_app/upload")({
  head: () => ({ meta: [{ title: "Upload — CrowdVision AI" }] }),
  component: UploadPage,
});

function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Please upload an image or video file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("File is larger than 25 MB. Please upload a smaller sample.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const analysis = await analyzeFile(file, dataUrl);
      saveAnalysis(analysis);
      setResult(analysis);
    } catch (e) {
      console.error(e);
      setError("Could not analyze that file. Try a different image or video.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload media</h1>
        <p className="text-sm text-muted-foreground">
          Drag & drop an image or video. Analysis starts automatically.
        </p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`block rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent/40"
        }`}
      >
        <input
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          disabled={busy}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="size-14 rounded-full bg-primary/10 grid place-items-center text-primary">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
          </div>
          <div>
            <div className="font-medium">{busy ? "Analyzing…" : "Drop an image or video here"}</div>
            <div className="text-sm text-muted-foreground">or click to browse</div>
          </div>
        </div>
      </label>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Analysis result
              </div>
              <div className="text-lg font-semibold">{result.fileName}</div>
            </div>
            <RiskBadge level={result.risk} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              {result.fileType === "image" ? (
                <img src={result.imageDataUrl} alt={result.fileName} className="w-full h-full object-cover" />
              ) : (
                <video src={result.imageDataUrl} className="w-full h-full object-cover" controls />
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Zone heatmap
              </div>
              <Heatmap analysis={result} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: "People", v: result.peopleCount },
              { k: "Density", v: `${result.density} · ${result.densityLabel}` },
              { k: "Risk score", v: `${result.riskScore}/100` },
              { k: "Predicted (15m)", v: `${result.prediction.expectedCount} · ${result.prediction.expectedRisk}` },
            ].map((s) => (
              <div key={s.k} className="rounded-lg border border-border p-3 bg-background">
                <div className="text-xs text-muted-foreground">{s.k}</div>
                <div className="font-semibold text-sm mt-1">{s.v}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="font-semibold mb-2 text-sm">Recommendations</div>
            <ul className="space-y-2">
              {result.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => generateReportPdf(result)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              <FileText className="size-4" /> Download PDF report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
