"""Scene context ("text data") + Fruin Level-of-Service grading."""

from __future__ import annotations

EVENT_TYPES = [
    {"id": "unspecified", "label": "Unspecified", "risk": 0.0},
    {"id": "religious", "label": "Religious gathering", "risk": 0.10},
    {"id": "concert", "label": "Concert / festival", "risk": 0.12},
    {"id": "sports", "label": "Sports event", "risk": 0.08},
    {"id": "transit", "label": "Transit hub", "risk": 0.06},
    {"id": "market", "label": "Market / bazaar", "risk": 0.04},
    {"id": "protest", "label": "Protest / rally", "risk": 0.14},
    {"id": "street", "label": "Street / public space", "risk": 0.02},
]

EMPTY_CONTEXT = {
    "venue": "", "eventType": "unspecified", "areaSqm": None,
    "capacity": None, "exits": None, "timeOfDay": "", "weather": "", "notes": "",
}


def event_risk(event_type: str) -> float:
    for e in EVENT_TYPES:
        if e["id"] == event_type:
            return e["risk"]
    return 0.0


def fruin_los(persons_per_sqm: float) -> dict:
    if persons_per_sqm < 0.31:
        return {"grade": "A", "label": "Free flow"}
    if persons_per_sqm < 0.43:
        return {"grade": "B", "label": "Comfortable"}
    if persons_per_sqm < 0.72:
        return {"grade": "C", "label": "Constrained"}
    if persons_per_sqm < 1.08:
        return {"grade": "D", "label": "Restricted"}
    if persons_per_sqm < 2.17:
        return {"grade": "E", "label": "Congested"}
    return {"grade": "F", "label": "Critical / crush risk"}


def normalise_context(raw: dict | None) -> dict:
    ctx = dict(EMPTY_CONTEXT)
    if not raw:
        return ctx
    for k in ctx:
        if k in raw and raw[k] not in ("", None):
            ctx[k] = raw[k]
    for num in ("areaSqm", "capacity", "exits"):
        try:
            ctx[num] = float(ctx[num]) if ctx[num] is not None else None
        except (TypeError, ValueError):
            ctx[num] = None
    return ctx


def has_context(c: dict | None) -> bool:
    if not c:
        return False
    return bool(
        c.get("venue") or c.get("notes") or c.get("areaSqm")
        or c.get("capacity") or c.get("eventType", "unspecified") != "unspecified"
    )
