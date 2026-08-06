(async () => {
  const items = await api.list();
  const stats = document.getElementById("stats");
  const latest = document.getElementById("latest");
  const recent = document.getElementById("recent");
  if (!items.length) { stats.innerHTML = statCard("Analyses", 0); return; }

  const a = items[0];
  const high = items.filter((x) => x.risk === "High").length;
  const avg = Math.round(items.reduce((s, x) => s + x.peopleCount, 0) / items.length);
  stats.innerHTML =
    statCard("Total analyses", items.length) +
    statCard("Latest crowd", a.peopleCount, a.fileName) +
    statCard("High-risk scenes", high) +
    statCard("Average crowd", avg);

  latest.innerHTML = `
    <div class="grid two">
      <div>
        <p>${fmtDate(a.createdAt)} · ${a.fileName}</p>
        <p>${badge(a.risk)} <span class="badge ${a.cpriBand}">CPRI ${a.cpri} · ${a.cpriBand}</span></p>
        ${alertChips(a.alerts)}
        <ul>${a.recommendations.slice(0, 4).map((r) => `<li>${r}</li>`).join("")}</ul>
      </div>
      <div>${heatmap(a.zones)}</div>
    </div>`;

  recent.innerHTML = items.slice(0, 8).map((x) => `
    <div class="row-item">
      ${x.thumbnail ? `<img src="${x.thumbnail}" alt="${x.fileName}" />` : ""}
      <div class="meta"><b>${x.fileName}</b><span>${fmtDate(x.createdAt)} · ${x.peopleCount} people</span></div>
      ${badge(x.risk)}<span class="badge ${x.cpriBand}">CPRI ${x.cpri}</span>
    </div>`).join("");
})();
