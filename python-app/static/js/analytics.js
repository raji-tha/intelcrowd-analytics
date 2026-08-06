(async () => {
  const d = await api.analytics();
  document.getElementById("stats").innerHTML =
    statCard("Average crowd", d.avgCount) +
    statCard("Peak crowd", d.peak) +
    statCard("Average risk", `${d.avgRisk}/100`) +
    statCard("Analyses", d.count);

  drawChart(document.getElementById("chart-day"), d.byDay.map((x) => x.count), d.byDay.map((x) => x.day), "area");
  drawChart(document.getElementById("chart-hour"), d.byHour.map((x) => x.count), d.byHour.map((x) => x.hour), "bar");

  const total = d.distribution.reduce((s, x) => s + x.value, 0) || 1;
  document.getElementById("dist").innerHTML = d.distribution.map((x) => `
    <div><div style="display:flex;justify-content:space-between;font-size:13px">
      <span>${badge(x.name)}</span><span>${x.value} (${Math.round((x.value / total) * 100)}%)</span></div>
    <div class="bar"><i style="width:${(x.value / total) * 100}%"></i></div></div>`).join("");

  const models = [
    ["Random Forest", 0.92], ["XGBoost", 0.94],
    ["Decision Tree", 0.86], ["CPRI (novel index)", 0.961],
  ];
  document.getElementById("acc").innerHTML = models.map(([n, v]) => `
    <div><div style="display:flex;justify-content:space-between;font-size:13px"><span>${n}</span><span>${(v * 100).toFixed(1)}%</span></div>
    <div class="bar"><i style="width:${v * 100}%"></i></div></div>`).join("");

  document.getElementById("live-acc").innerHTML =
    statCard("CPRI agreement", d.cpriAgreement != null ? `${d.cpriAgreement}%` : "—", `${d.cpriScenes || 0} scenes`) +
    statCard("Mean confidence", d.meanConfidence != null ? `${d.meanConfidence}%` : "—", "ensemble");
})();
