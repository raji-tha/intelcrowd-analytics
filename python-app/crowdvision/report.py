"""PDF incident report (ReportLab) — mirrors the jsPDF report layout."""

from __future__ import annotations

import io
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

EMOJI = re.compile("[^\x00-\x7F]+")


def _clean(s: str) -> str:
    return EMOJI.sub("", str(s)).strip()


def build_pdf(a: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm,
                            rightMargin=18 * mm, topMargin=18 * mm,
                            bottomMargin=18 * mm,
                            title=f"CrowdVision report {a['id'][:8]}")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontSize=17, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=11.5, spaceBefore=10,
                        spaceAfter=4, textColor=colors.HexColor("#1e3a8a"))
    body = ParagraphStyle("body", parent=ss["BodyText"], fontSize=9.5, leading=13)

    story = [
        Paragraph("CrowdVision AI - Crowd Risk Assessment Report", h1),
        Paragraph(
            f"Generated {datetime.now().strftime('%d %b %Y, %H:%M')} &nbsp;|&nbsp; "
            f"Analysis ID {a['id'][:8]} &nbsp;|&nbsp; Source: {_clean(a['fileName'])}",
            body,
        ),
        Spacer(1, 6),
    ]

    summary = [
        ["Metric", "Value"],
        ["Estimated people", str(a["peopleCount"])],
        ["Risk classification", f"{a['risk']} ({a['riskScore']}/100)"],
        ["CPRI index", f"{a.get('cpri', '-')} ({a.get('cpriBand', '-')})"],
        ["Density", f"{a['density']} per 100x100 px block ({a['densityLabel']})"],
        ["Persons / m2", str(a.get("personsPerSqm") or "not supplied")],
        ["Fruin LOS", f"{a.get('losGrade') or '-'} {a.get('losLabel') or ''}".strip()],
        ["Occupancy", f"{round(a['occupancy'] * 100)}%" if a.get("occupancy") else "-"],
        ["Model confidence", f"{a.get('confidence', '-')}%"],
        ["Forecast (15 min)", f"{a['prediction']['expectedCount']} people, "
                              f"{a['prediction']['expectedRisk']} risk"],
        ["Model", _clean(a.get("model", ""))],
    ]
    t = Table(summary, colWidths=[55 * mm, 105 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c7ccd6")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8edf7")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [t]

    sub = a.get("cpriSub") or {}
    if sub:
        story += [
            Paragraph("CPRI sub-indices", h2),
            Paragraph(
                f"Density stress {sub.get('density')} &nbsp; | &nbsp; "
                f"Kinetic turbulence {sub.get('turbulence')} &nbsp; | &nbsp; "
                f"Egress deficit {sub.get('egress')} &nbsp; | &nbsp; "
                f"Occupancy load {sub.get('occupancy')}", body),
        ]

    adv = a.get("adversarial") or {}
    if adv:
        story += [
            Paragraph("Adversarial density critic", h2),
            Paragraph(
                f"Realism D(x,n) {adv.get('realism')} &nbsp; | &nbsp; "
                f"Crowd likelihood {adv.get('crowdness')} &nbsp; | &nbsp; "
                f"Critic prior count {adv.get('priorCount')} &nbsp; | &nbsp; "
                f"Applied correction x{adv.get('adjust')}", body),
        ]


    if a.get("alerts"):
        story += [Paragraph("Active alerts", h2)]
        story += [Paragraph(f"- {_clean(x)}", body) for x in a["alerts"]]

    story += [Paragraph("Recommendations", h2)]
    story += [Paragraph(f"{i+1}. {_clean(r)}", body)
              for i, r in enumerate(a.get("recommendations", []))]

    story += [Paragraph("Zone breakdown", h2)]
    zt = Table(
        [["Zone", "People", "Level"]]
        + [[z["id"], str(z["count"]), z["level"]] for z in a.get("zones", [])],
        colWidths=[30 * mm, 30 * mm, 30 * mm],
    )
    zt.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c7ccd6")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8edf7")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story += [zt]

    ctx = a.get("context")
    if ctx:
        story += [
            Paragraph("Scene context (operator text data)", h2),
            Paragraph(
                " | ".join(
                    f"{k}: {_clean(v)}" for k, v in ctx.items() if v not in (None, "")
                ),
                body,
            ),
        ]

    doc.build(story)
    return buf.getvalue()
