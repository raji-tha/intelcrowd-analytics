# CrowdVision AI — Advanced Research Build Plan

Goal: move from a heuristic demo to a defensible, publication-ready crowd-risk research platform. Five workstreams, ordered by research impact.

## Phase 1 — Real AI vision detection (biggest research leap)
Add a server function that sends the analyzed frame to a vision model via the Lovable AI Gateway and returns an actual people count + scene description. This replaces the heuristic as the authoritative count, while the heuristic stays as the instant in-browser fallback.

- `src/lib/vision.functions.ts` — `createServerFn` that reads `process.env.LOVABLE_API_KEY` inside the handler, POSTs the frame (data URL) to the AI Gateway `/v1/chat/completions` with a vision-capable model, and parses a JSON `{ peopleCount, density, sceneDescription, confidence }` from the model response.
- Extend `Analysis` (store.ts) with optional `aiCount`, `aiDescription`, `aiConfidence`, and a `verified: boolean` flag.
- Upload page (`_app.upload.tsx`): after the instant heuristic result renders, add a "Verify with AI vision" button that calls the server fn and overlays the AI count + description. Show a clear comparison: heuristic estimate vs AI-verified count.
- Live camera/screen capture: optionally auto-verify on a slower cadence.

## Phase 2 — Model explainability dashboard
A new route that breaks down how each feature contributed to the risk score, SHAP-style. This is what reviewers expect from a decision-support paper.

- `src/routes/_app.explain.tsx` — select an analysis, then render:
  - A horizontal bar chart of per-feature contributions (edge, entropy, midtone, contrast, variance, brightness) computed from the ensemble weights in `analyze.ts`.
  - A waterfall showing how features push the score from baseline to final.
  - The three sub-models (RF / XGBoost / Decision Tree) plotted as a small radar or grouped bar so the ensemble vote is visible.
- Refactor `analyze.ts` so `ensembleScore` also returns the per-feature contribution vector (reuse weights already there).
- Add to `AppShell` nav as "Explain".

## Phase 3 — Comparison & benchmark tooling + CSV export
Research tooling: compare two analyses side-by-side, and export raw data for the paper.

- `src/routes/_app.compare.tsx` — pick two analyses (dropdowns), show side-by-side image/heatmap, stat diff table (people, density, risk score, predicted), and a risk-trend overlay of both.
- CSV export button on Reports page: exports all analyses (id, file, type, peopleCount, density, risk, riskScore, confidence, createdAt, aiCount) using a small `toCSV` helper in `src/lib/export.ts`. Add Excel (.xlsx via SheetJS) as a second option.
- Add to nav as "Compare".

## Phase 4 — Threshold alerts & live monitoring panel
Decision-support depth: alerting when risk crosses a threshold.

- `src/lib/alerts.ts` — in-memory + localStorage alert log; `checkAndAlert(analysis)` that creates an alert when risk is High (or above a configurable threshold), with severity + recommendation.
- `src/routes/_app.monitor.tsx` — a live ops panel: rolling risk timeline (last N analyses), active alert list with acknowledge buttons, and a configurable threshold slider. Hook the live camera capture to push alerts here.
- Toast/banner on the Dashboard when a new High-risk analysis is created.
- Add to nav as "Monitor".

## Phase 5 — Optional geo-mapped analysis
Spatial analytics. Only if location is provided on upload (optional field), so existing flows keep working.

- Add an optional `location?: { lat, lng, label }` to `Analysis`; capture it on the upload page (manual lat/lng or a simple search box). Store in localStorage.
- `src/routes/_app.map.tsx` — Leaflet map (lazy-loaded via `<ClientOnly>` + dynamic import, never statically imported from an SSR route) plotting each analysis as a colored marker sized by people count, with a density heat overlay. Legend ties to the same green/amber/red scale.
- Add to nav as "Map".

## Not included (kept out of scope)
- Lovable Cloud / Supabase auth + DB persistence. This is the largest change (would replace fake auth, swap store.ts for DB queries, add migrations + RLS). Worth doing for a real product, but it's a separate, self-contained workstream — recommend a follow-up if you want real multi-user accounts and cross-device persistence.

## Order & verification
Phases 1–4 first (core research depth), Phase 5 last (adds a dependency and SSR care). After each phase: `tsgo` typecheck, HMR flush, and a Playwright pass on the new route to confirm it renders and the buttons work. Head metadata added per new route.

```text
Nav after build:
  Dashboard · Upload · Analytics · Explain · Compare · Monitor · Map · Reports · Settings
```