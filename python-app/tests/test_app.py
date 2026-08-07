"""
End-to-end smoke test for the CrowdVision AI Flask build.

    cd python-app && python tests/test_app.py

Exercises every page and every API endpoint, including a real analysis of a
synthetic crowd frame, CSV export and PDF report generation.
"""

from __future__ import annotations

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402
from crowdvision.calibration import synthesise  # noqa: E402

FAILS: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name} {extra}")
    if not ok:
        FAILS.append(name)


def main() -> int:
    client = app.test_client()

    for path in ("/", "/dashboard", "/upload", "/analytics", "/reports", "/explain"):
        r = client.get(path)
        check(f"page {path}", r.status_code == 200, f"({r.status_code})")
    check("404 page", client.get("/nope").status_code == 404)

    sample = synthesise(2)[0]
    ctx = {"venue": "Test Arena", "eventType": "concert",
           "areaSqm": 1200, "capacity": 900, "exits": 4}
    r = client.post(
        "/api/analyze",
        data={"file": (io.BytesIO(sample["data"]), "scene.png"),
              "context": json.dumps(ctx)},
        content_type="multipart/form-data",
    )
    check("POST /api/analyze", r.status_code == 200, f"({r.status_code})")
    a = r.get_json()
    for key in ("peopleCount", "risk", "cpri", "cpriBand", "alerts", "zones",
                "recommendations", "adversarial", "confidence", "prediction"):
        check(f"result.{key}", key in a and a[key] is not None)
    check("zones = 9", len(a["zones"]) == 9)
    check("alerts non-empty", len(a["alerts"]) > 0)
    check("critic realism 0..1", 0 <= a["adversarial"]["realism"] <= 1)
    check("context echoed", (a.get("context") or {}).get("venue") == "Test Arena")

    check("empty upload rejected",
          client.post("/api/analyze", data={}).status_code == 400)

    items = client.get("/api/analyses").get_json()
    check("GET /api/analyses", isinstance(items, list) and len(items) >= 1)
    check("GET /api/analyses/<id>",
          client.get(f"/api/analyses/{a['id']}").status_code == 200)
    check("GET missing id 404",
          client.get("/api/analyses/does-not-exist").status_code == 404)

    an = client.get("/api/analytics").get_json()
    check("GET /api/analytics", an["count"] >= 1)

    v = client.get("/api/validate").get_json()
    check("GET /api/validate", "mae" in v, f"MAE={v.get('mae')} ACC={v.get('accuracy')}%")
    check("benchmark accuracy >= 80%", (v.get("accuracy") or 0) >= 80)
    check("decoy rejection >= 75%", (v.get("decoyPrecision") or 0) >= 75)

    csv_r = client.get("/api/export.csv")
    check("CSV export", csv_r.status_code == 200 and b"cpri" in csv_r.data)

    pdf_r = client.get(f"/api/report/{a['id']}.pdf")
    check("PDF report", pdf_r.status_code == 200 and pdf_r.data[:4] == b"%PDF",
          f"({len(pdf_r.data)} bytes)")

    check("DELETE analysis",
          client.delete(f"/api/analyses/{a['id']}").status_code == 200)
    check("clear store",
          client.post("/api/analyses/clear").status_code == 200)

    print("\n" + ("ALL CHECKS PASSED" if not FAILS else f"{len(FAILS)} FAILED: {FAILS}"))
    return 1 if FAILS else 0


if __name__ == "__main__":
    raise SystemExit(main())
