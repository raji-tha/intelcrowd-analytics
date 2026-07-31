import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => {
    const title = "CrowdVision AI — Crowd Risk Prediction & Decision Support";
    const description =
      "Analyze crowd images, video and live capture to predict density risk, view zone heatmaps and get actionable safety recommendations.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between">
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

      <section className="flex-1 max-w-3xl mx-auto px-6 flex flex-col items-center justify-center text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          Intelligent crowd risk prediction &{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-primary)" }}
          >
            decision support
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl">
          Upload crowd images or videos to detect people, map density, and get
          actionable risk recommendations.
        </p>
        <Link
          to="/login"
          className="mt-8 px-6 py-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Launch dashboard
        </Link>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        CrowdVision AI · Final-year major project
      </footer>
    </div>
  );
}
