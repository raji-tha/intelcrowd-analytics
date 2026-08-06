const form = document.getElementById("analyze-form");
const fileInput = document.getElementById("file");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

fileInput.addEventListener("change", () => {
  const f = fileInput.files[0];
  if (!f || !f.type.startsWith("image/")) { preview.hidden = true; return; }
  preview.src = URL.createObjectURL(f);
  preview.hidden = false;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = fileInput.files[0];
  if (!f) return;

  const fd = new FormData(form);
  const context = {};
  ["venue", "eventType", "areaSqm", "capacity", "exits", "timeOfDay", "weather", "notes"]
    .forEach((k) => { const v = fd.get(k); if (v) context[k] = v; fd.delete(k); });
  fd.set("context", JSON.stringify(context));

  statusEl.textContent = "Analyzing...";
  resultEl.hidden = true;
  try {
    const res = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analysis failed");
    statusEl.textContent = "Done.";
    render(data);
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

function render(a) {
  const los = a.losGrade ? `${a.losGrade} — ${a.losLabel}` : "not supplied";
  resultEl.innerHTML = `
    <h3>Result — ${badge(a.risk)} <span class="badge ${a.cpriBand}">CPRI ${a.cpri} · ${a.cpriBand}</span></h3>
    <table>
      <tr><th>Estimated people</th><td>${a.peopleCount}</td></tr>
      <tr><th>Risk score</th><td>${a.riskScore}/100 (confidence ${a.confidence}%)</td></tr>
      <tr><th>Persons / m²</th><td>${a.personsPerSqm ?? "—"}</td></tr>
      <tr><th>Fruin LOS</th><td>${los}</td></tr>
      <tr><th>Occupancy</th><td>${a.occupancy != null ? Math.round(a.occupancy * 100) + "%" : "—"}</td></tr>
      <tr><th>Forecast (15 min)</th><td>${a.prediction.expectedCount} people · ${a.prediction.expectedRisk}</td></tr>
      <tr><th>Model</th><td>${a.model}</td></tr>
    </table>
    ${alertChips(a.alerts)}
    <h3>Zone heatmap</h3>${heatmap(a.zones)}
    <h3>Recommendations</h3>
    <ol>${a.recommendations.map((r) => `<li>${r}</li>`).join("")}</ol>
    <a class="btn" href="/api/report/${a.id}.pdf">Download PDF report</a>
    <a class="btn" href="/reports">All reports</a>`;
  resultEl.hidden = false;
}
