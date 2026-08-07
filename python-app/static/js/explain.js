(async () => {
  const items = await api.list();
  const box = document.getElementById("explain");
  if (!items.length) return;
  const a = items[0];
  const c = a.explain?.contributions || {};
  const sm = a.explain?.subModels || {};
  const max = Math.max(0.0001, ...Object.values(c));
  box.innerHTML = `
    <h3>${a.fileName} — ${badge(a.risk)} <span class="badge ${a.cpriBand}">CPRI ${a.cpri}</span></h3>
    <p class="hint">${a.model}</p>
    <h3>Feature contributions (SHAP-style, linear ensemble)</h3>
    ${Object.entries(c).sort((x, y) => y[1] - x[1]).map(([k, v]) => `
      <div><div style="display:flex;justify-content:space-between;font-size:13px"><span>${k}</span><span>${v.toFixed(4)}</span></div>
      <div class="bar"><i style="width:${(v / max) * 100}%"></i></div></div>`).join("")}
    <h3>Sub-model votes</h3>
    <table><tr><th>Model</th><th>Score</th><th>Weight</th></tr>
      <tr><td>Random Forest</td><td>${sm.rf}</td><td>0.30</td></tr>
      <tr><td>XGBoost</td><td>${sm.xgb}</td><td>0.46</td></tr>
      <tr><td>Decision Tree</td><td>${sm.dt}</td><td>0.24</td></tr></table>
    <h3>CPRI sub-indices</h3>
    <table>${Object.entries(a.cpriSub || {}).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>
    ${a.adversarial ? `
    <h3>Adversarial density critic (GAN-style discriminator)</h3>
    <p class="hint">The critic judges whether the ensemble's count is plausible for the observed texture, and pulls it toward the corpus manifold in proportion to its own confidence.</p>
    <table>
      <tr><th>Realism D(x, n)</th><td>${a.adversarial.realism}</td></tr>
      <tr><th>Crowd likelihood</th><td>${a.adversarial.crowdness}</td></tr>
      <tr><th>Critic prior count</th><td>${a.adversarial.priorCount}</td></tr>
      <tr><th>Applied correction</th><td>x${a.adversarial.adjust}</td></tr>
      <tr><th>Trust gain</th><td>${a.adversarial.gain}</td></tr>
    </table>` : ""}`;
})();

