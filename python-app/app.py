"""
CrowdVision AI — Flask application.

Serves the plain HTML/CSS/JS frontend and a small JSON API:

    POST /api/analyze        multipart image/video + scene-context text data
    GET  /api/analyses       list stored analyses
    GET  /api/analyses/<id>  single analysis
    DELETE /api/analyses/<id>
    POST /api/analyses/clear
    GET  /api/analytics      aggregated dashboard/analytics metrics
    GET  /api/export.csv     CSV export
    GET  /api/report/<id>.pdf  PDF incident report
"""

from __future__ import annotations

import base64
import csv
import io
import json

from flask import Flask, Response, jsonify, render_template, request, send_file

from crowdvision.pipeline import analyze_image, analyze_video
from crowdvision.report import build_pdf
from crowdvision.store import (
    clear_all, delete_analysis, get_analysis, init_db, list_analyses, save_analysis,
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32 MB uploads
init_db()

PAGES = {
    "": ("index.html", "CrowdVision AI - Intelligent Crowd Risk Management"),
    "dashboard": ("dashboard.html", "Dashboard"),
    "upload": ("upload.html", "Analyze"),
    "analytics": ("analytics.html", "Analytics"),
    "reports": ("reports.html", "Reports"),
    "explain": ("explain.html", "Explainability"),
}


@app.route("/")
def home():
    return render_template("index.html", page="home")


@app.route("/<page>")
def page_view(page: str):
    if page not in PAGES or page == "":
        return render_template("404.html", page="404"), 404
    return render_template(PAGES[page][0], page=page)


# ------------------------- API -------------------------

@app.post("/api/analyze")
def api_analyze():
    file = request.files.get("file")
    if file is None or not file.filename:
        return jsonify({"error": "No file uploaded."}), 400

    raw = file.read()
    if not raw:
        return jsonify({"error": "Empty file."}), 400

    try:
        context = json.loads(request.form.get("context") or "{}")
    except json.JSONDecodeError:
        context = {}

    is_video = (file.mimetype or "").startswith("video/")
    try:
        result = (analyze_video if is_video else analyze_image)(
            raw, file.filename, context
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Analysis failed: {exc}"}), 422

    thumb = None
    if not is_video:
        thumb = _thumbnail(raw)
    save_analysis(result, thumb)
    result["thumbnail"] = thumb
    return jsonify(result)


def _thumbnail(raw: bytes) -> str | None:
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((320, 320))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=72)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa: BLE001
        return None


@app.get("/api/analyses")
def api_list():
    return jsonify(list_analyses())


@app.get("/api/analyses/<analysis_id>")
def api_get(analysis_id: str):
    item = get_analysis(analysis_id)
    return (jsonify(item), 200) if item else (jsonify({"error": "Not found"}), 404)


@app.delete("/api/analyses/<analysis_id>")
def api_delete(analysis_id: str):
    delete_analysis(analysis_id)
    return jsonify({"ok": True})


@app.post("/api/analyses/clear")
def api_clear():
    clear_all()
    return jsonify({"ok": True})


@app.get("/api/analytics")
def api_analytics():
    items = list_analyses(1000)
    if not items:
        return jsonify({"count": 0, "byDay": [], "byHour": [], "distribution": [],
                        "avgCount": 0, "avgRisk": 0, "peak": 0,
                        "cpriAgreement": None, "meanConfidence": None})

    from collections import defaultdict
    from datetime import datetime

    day_bucket: dict[str, list] = defaultdict(list)
    hour_bucket: dict[int, list] = defaultdict(list)
    for a in items:
        dt = datetime.fromisoformat(a["createdAt"].replace("Z", "+00:00"))
        day_bucket[dt.strftime("%b %d")].append(a)
        hour_bucket[dt.hour].append(a)

    def avg(vals):
        return round(sum(vals) / len(vals)) if vals else 0

    band_risk = {"Safe": "Low", "Watch": "Low", "Elevated": "Medium",
                 "Critical": "High", "Red": "High"}
    with_cpri = [a for a in items if a.get("cpriBand")]
    agree = [a for a in with_cpri if band_risk.get(a["cpriBand"]) == a["risk"]]
    confs = [a["confidence"] for a in items if a.get("confidence") is not None]

    return jsonify({
        "count": len(items),
        "byDay": [{"day": d, "count": avg([x["peopleCount"] for x in v]),
                   "risk": avg([x["riskScore"] for x in v])}
                  for d, v in reversed(list(day_bucket.items()))],
        "byHour": [{"hour": f"{h}:00",
                    "count": avg([x["peopleCount"] for x in hour_bucket.get(h, [])])}
                   for h in range(24)],
        "distribution": [{"name": r,
                          "value": len([a for a in items if a["risk"] == r])}
                         for r in ("Low", "Medium", "High")],
        "avgCount": avg([a["peopleCount"] for a in items]),
        "avgRisk": avg([a["riskScore"] for a in items]),
        "peak": max(a["peopleCount"] for a in items),
        "cpriAgreement": round(len(agree) / len(with_cpri) * 100) if with_cpri else None,
        "cpriScenes": len(with_cpri),
        "meanConfidence": round(sum(confs) / len(confs)) if confs else None,
    })


_VALIDATION_CACHE: dict = {}


@app.get("/api/validate")
def api_validate():
    """
    Reproducible benchmark run of the full pipeline over the built-in
    synthetic validation set (see crowdvision/calibration.py).
    """
    if not _VALIDATION_CACHE:
        from crowdvision.calibration import validate

        try:
            _VALIDATION_CACHE.update(validate())
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": str(exc)}), 500
    return jsonify(_VALIDATION_CACHE)



@app.get("/api/export.csv")
def api_export_csv():
    items = list_analyses(1000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "file", "people", "risk", "risk_score",
                     "cpri", "cpri_band", "persons_per_sqm", "los_grade",
                     "confidence", "model"])
    for a in items:
        writer.writerow([a["id"], a["createdAt"], a["fileName"], a["peopleCount"],
                         a["risk"], a["riskScore"], a.get("cpri"), a.get("cpriBand"),
                         a.get("personsPerSqm"), a.get("losGrade"),
                         a.get("confidence"), a.get("model")])
    return Response(
        buf.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=crowdvision-export.csv"},
    )


@app.get("/api/report/<analysis_id>.pdf")
def api_report(analysis_id: str):
    item = get_analysis(analysis_id)
    if not item:
        return jsonify({"error": "Not found"}), 404
    pdf = build_pdf(item)
    return send_file(io.BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=True,
                     download_name=f"crowdvision-{analysis_id[:8]}.pdf")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
