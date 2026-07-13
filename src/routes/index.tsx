import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Activity, Brain, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="size-9 rounded-lg grid place-items-center text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <ShieldCheck className="size-5" />
          </div>
          <span className="font-semibold">CrowdVision AI</span>
        </div>
        <Link
          to="/login"
          className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          IEEE-oriented research project · AI + CV + Predictive Analytics
        </div>
        <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight">
          Intelligent crowd risk prediction &{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-primary)" }}
          >
            decision support
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Upload an image or video. CrowdVision detects people, maps density, predicts what
          happens next, and tells authorities what to do — before it becomes an incident.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/login"
            className="px-5 py-2.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Launch dashboard
          </Link>
          <a
            href="#modules"
            className="px-5 py-2.5 rounded-md text-sm font-medium border border-input hover:bg-accent"
          >
            See modules
          </a>
        </div>
      </section>

      <section id="modules" className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-4 gap-4">
        {[
          { icon: Activity, title: "Detect", body: "Person detection via CV pipeline (YOLOv8 in reference impl.)." },
          { icon: TrendingUp, title: "Density", body: "Zone-wise density mapping with heatmap visualization." },
          { icon: Brain, title: "Predict", body: "ML forecasts future crowd count and risk level." },
          { icon: ShieldCheck, title: "Decide", body: "Automated recommendations tailored to risk severity." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <div className="size-10 rounded-lg grid place-items-center bg-primary/10 text-primary">
              <f.icon className="size-5" />
            </div>
            <div className="mt-4 font-semibold">{f.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        CrowdVision AI · Final-year major project scaffold
      </footer>
    </div>
  );
}
