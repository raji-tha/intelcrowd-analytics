let items = [];
const listEl = document.getElementById("list");

function render() {
  const q = document.getElementById("q").value.toLowerCase();
  const risk = document.getElementById("risk").value;
  const sort = document.getElementById("sort").value;
  let rows = items.filter((a) =>
    (!risk || a.risk === risk) &&
    (!q || a.fileName.toLowerCase().includes(q) ||
      (a.context?.venue || "").toLowerCase().includes(q)));
  rows.sort((a, b) =>
    sort === "old" ? a.createdAt.localeCompare(b.createdAt)
    : sort === "people" ? b.peopleCount - a.peopleCount
    : sort === "cpri" ? (b.cpri || 0) - (a.cpri || 0)
    : b.createdAt.localeCompare(a.createdAt));

  listEl.innerHTML = rows.length ? rows.map((a) => `
    <div class="row-item">
      ${a.thumbnail ? `<img src="${a.thumbnail}" alt="${a.fileName}" />` : ""}
      <div class="meta"><b>${a.fileName}</b>
        <span>${fmtDate(a.createdAt)} · ${a.peopleCount} people${a.personsPerSqm ? ` · ${a.personsPerSqm}/m²` : ""}${a.losGrade ? ` · LOS ${a.losGrade}` : ""}</span></div>
      ${badge(a.risk)}<span class="badge ${a.cpriBand}">CPRI ${a.cpri}</span>
      <a class="btn" href="/api/report/${a.id}.pdf">PDF</a>
      <button class="btn danger" data-del="${a.id}">Delete</button>
    </div>`).join("") : `<p class="sub">No matching reports.</p>`;
}

listEl.addEventListener("click", async (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  await api.remove(id);
  items = items.filter((a) => a.id !== id);
  render();
});

["q", "risk", "sort"].forEach((id) =>
  document.getElementById(id).addEventListener("input", render));

document.getElementById("clear").addEventListener("click", async () => {
  if (!confirm("Delete all stored analyses?")) return;
  await api.clear();
  items = [];
  render();
});

(async () => { items = await api.list(); render(); })();
