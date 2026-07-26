import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  FileText,
  Camera,
  MonitorUp,
  Play,
  Square,
  Clipboard,
  Image as ImageIcon,
  Video as VideoIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { analyzeCanvas, analyzeFile, fileToDataUrl } from "@/lib/analyze";
import { saveAnalysis, updateAnalysis, type Analysis } from "@/lib/store";
import { RiskBadge } from "@/components/RiskBadge";
import { Heatmap } from "@/components/Heatmap";
import { generateReportPdf } from "@/lib/pdf";
import { useServerFn } from "@tanstack/react-start";
import { analyzeWithVision } from "@/lib/vision.functions";

export const Route = createFileRoute("/_app/upload")({
  head: () => ({ meta: [{ title: "Upload — CrowdVision AI" }] }),
  component: UploadPage,
});

type Mode = "file" | "camera" | "screen";

function UploadPage() {
  const [mode, setMode] = useState<Mode>("file");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [batch, setBatch] = useState<Analysis[]>([]);

  // AI vision verification
  const verify = useServerFn(analyzeWithVision);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const runVerify = useCallback(
    async (a: Analysis) => {
      setVerifying(true);
      setVerifyError(null);
      try {
        const res = await verify({ data: { image: a.imageDataUrl } });
        if (res.ok) {
          const aiDensity =
            res.result.density === "low"
              ? "Low"
              : res.result.density === "medium"
                ? "Medium"
                : "High";
          const patch = {
            verified: true,
            aiCount: res.result.peopleCount,
            aiDescription: res.result.sceneDescription,
            aiConfidence: Math.round(res.result.confidence * 100),
            aiDensity: aiDensity as Analysis["aiDensity"],
          };
          updateAnalysis(a.id, patch);
          setResult((cur) => (cur ? { ...cur, ...patch } : cur));
        } else {
          setVerifyError(res.error);
        }
      } catch {
        setVerifyError("Could not run AI vision analysis.");
      } finally {
        setVerifying(false);
      }
    },
    [verify],
  );

  // Live capture state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [live, setLive] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [interval, setIntervalSec] = useState(3);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Please upload an image or video file.");
      return null;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("File is larger than 25 MB.");
      return null;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const analysis = await analyzeFile(file, dataUrl);
      saveAnalysis(analysis);
      setResult(analysis);
      return analysis;
    } catch (e) {
      console.error(e);
      setError("Could not analyze that file.");
      return null;
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setBusy(true);
      setBatch([]);
      const done: Analysis[] = [];
      for (const f of arr) {
        const a = await handleFile(f);
        if (a) done.push(a);
      }
      setBatch(done);
      setBusy(false);
    },
    [handleFile],
  );

  // Paste from clipboard (screenshots)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) handleFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setLive(false);
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const captureFrame = useCallback(async () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    const c = document.createElement("canvas");
    const maxSide = 480;
    const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.max(1, Math.round(v.videoWidth * scale));
    c.height = Math.max(1, Math.round(v.videoHeight * scale));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const name = `${mode === "camera" ? "Webcam" : "Screen"} frame ${new Date().toLocaleTimeString()}`;
    const a = await analyzeCanvas(c, { fileName: name, fileType: "image" });
    saveAnalysis(a);
    setResult(a);
  }, [mode]);

  const startCapture = useCallback(
    async (kind: "camera" | "screen") => {
      setError(null);
      stopStream();
      setMode(kind);
      try {
        const stream =
          kind === "camera"
            ? await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: 1280, height: 720 },
                audio: false,
              })
            : await (navigator.mediaDevices as MediaDevices & {
                getDisplayMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
              }).getDisplayMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setLive(true);
        if (autoAnalyze) {
          timerRef.current = window.setInterval(captureFrame, interval * 1000);
        }
      } catch (e) {
        console.error(e);
        setError(
          kind === "camera"
            ? "Camera access denied. Grant permission and try again."
            : "Screen sharing was cancelled or blocked.",
        );
        setLive(false);
      }
    },
    [autoAnalyze, captureFrame, interval, stopStream],
  );

  // Restart interval when settings change during live session
  useEffect(() => {
    if (!live) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (autoAnalyze) {
      timerRef.current = window.setInterval(captureFrame, interval * 1000);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [autoAnalyze, interval, live, captureFrame]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    stopStream();
    setMode(m);
    setError(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Capture & analyze</h1>
        <p className="text-sm text-muted-foreground">
          Upload files, drag & drop, paste screenshots, or stream from your camera or screen.
        </p>
      </div>

      {/* Mode switcher */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
        {[
          { id: "file" as const, icon: UploadCloud, label: "Files" },
          { id: "camera" as const, icon: Camera, label: "Live camera" },
          { id: "screen" as const, icon: MonitorUp, label: "Screen capture" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => switchMode(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              mode === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {mode === "file" && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
          className={`block rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent/40"
          }`}
        >
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            disabled={busy}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="size-14 rounded-full bg-primary/10 grid place-items-center text-primary">
              {busy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
            </div>
            <div>
              <div className="font-medium">
                {busy ? "Analyzing…" : "Drop images or videos here"}
              </div>
              <div className="text-sm text-muted-foreground">
                or click to browse · supports multi-select
              </div>
              <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                <Clipboard className="size-3" /> Tip: press ⌘/Ctrl+V to paste a screenshot
              </div>
            </div>
          </div>
        </label>
      )}

      {(mode === "camera" || mode === "screen") && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="aspect-video rounded-lg overflow-hidden bg-black grid place-items-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className={`w-full h-full object-contain ${live ? "" : "hidden"}`}
            />
            {!live && (
              <div className="text-sm text-white/70 flex flex-col items-center gap-2">
                {mode === "camera" ? <Camera className="size-8" /> : <MonitorUp className="size-8" />}
                <span>
                  {mode === "camera"
                    ? "Start your webcam to run live analysis."
                    : "Share a window or screen to analyze it live."}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!live ? (
              <button
                onClick={() => startCapture(mode)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <Play className="size-4" /> Start {mode === "camera" ? "camera" : "screen"}
              </button>
            ) : (
              <>
                <button
                  onClick={captureFrame}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  <ImageIcon className="size-4" /> Analyze current frame
                </button>
                <button
                  onClick={stopStream}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent"
                >
                  <Square className="size-4" /> Stop
                </button>
              </>
            )}
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
              />
              Auto-analyze every
              <input
                type="number"
                min={1}
                max={60}
                value={interval}
                onChange={(e) => setIntervalSec(Math.max(1, Number(e.target.value) || 3))}
                className="w-14 px-2 py-1 rounded border border-border bg-background"
              />
              sec
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}

      {batch.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="font-semibold text-sm mb-3">Batch results ({batch.length})</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {batch.map((a) => (
              <button
                key={a.id}
                onClick={() => setResult(a)}
                className="text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {a.fileType === "video" ? (
                        <VideoIcon className="size-3.5 shrink-0" />
                      ) : (
                        <ImageIcon className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{a.fileName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.peopleCount} people · score {a.riskScore}
                    </div>
                  </div>
                  <RiskBadge level={a.risk} />
                </div>
              </button>
            ))}
          </div>
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

          {(result.model || result.confidence != null || result.features) && (
            <div className="rounded-lg border border-border p-4 bg-background/60 text-xs text-muted-foreground grid gap-1">
              {result.model && (
                <div>
                  <span className="font-medium text-foreground">Model:</span> {result.model}
                  {result.confidence != null && <> · confidence {result.confidence}%</>}
                </div>
              )}
              {result.features && (
                <div>
                  <span className="font-medium text-foreground">Features:</span>{" "}
                  edge {result.features.edge} · entropy {result.features.entropy} · midtone{" "}
                  {result.features.midtone} · brightness {result.features.brightness}
                </div>
              )}
            </div>
          )}

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
