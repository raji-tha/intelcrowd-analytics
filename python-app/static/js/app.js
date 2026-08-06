/* Shared helpers for every CrowdVision page. */

const api = {
  async list() { return (await fetch("/api/analyses")).json(); },
  async analytics() { return (await fetch("/api/analytics")).json(); },
  async remove(id) { return fetch(`/api/analyses/${id}`, { method: "DELETE" }); },
  async clear() { return fetch("/api/analyses/clear", { method: "POST" }); },
};

const fmtDate = (iso) => new Date(iso).toLocaleString();
const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };

function statCard(label, value, foot = "") {
  return `<div class="card stat"><div class="label">${label}</div>
    <div class="value">${value}</div><div class="foot">${foot}</div></div>`;
}

function badge(level) { return `<span class="badge ${level}">${level}</span>`; }

function alertChips(alerts = []) {
  if (!alerts.length) return "";
  return `<div class="alerts">${alerts.map((a) => `<span class="alert-chip">${a}</span>`).join("")}</div>`;
}

function heatmap(zones = []) {
  return `<div class="heat">${zones.map((z) => `<div class="${z.level}" title="${z.id}: ${z.count}">${z.count}</div>`).join("")}</div>`;
}

/* Minimal dependency-free canvas charts (bar + area). */
function drawChart(canvas, values, labels, type = "bar") {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 400, h = canvas.height;
  canvas.width = w * dpr; canvas.style.height = h + "px"; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const pad = 26, max = Math.max(1, ...values);
  ctx.strokeStyle = "#2a3247"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + ((h - pad * 1.4) * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - 6, y); ctx.stroke();
  }
  if (!values.length) return;
  const bw = (w - pad - 8) / values.length;
  if (type === "bar") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#5b7cfa"); g.addColorStop(1, "#22d3ee");
    ctx.fillStyle = g;
    values.forEach((v, i) => {
      const bh = ((h - pad * 1.4) * v) / max;
      ctx.fillRect(pad + i * bw + 2, h - pad * 0.4 - bh, Math.max(2, bw - 5), bh);
    });
  } else {
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = pad + i * bw + bw / 2, y = h - pad * 0.4 - ((h - pad * 1.4) * v) / max;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = "#5b7cfa"; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(w - 8, h - pad * 0.4); ctx.lineTo(pad, h - pad * 0.4); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(91,124,250,.45)"); g.addColorStop(1, "rgba(91,124,250,0)");
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.fillStyle = "#9aa6bf"; ctx.font = "10px system-ui";
  labels.forEach((l, i) => {
    if (labels.length > 12 && i % 3) return;
    ctx.fillText(l, pad + i * bw, h - 4);
  });
}
