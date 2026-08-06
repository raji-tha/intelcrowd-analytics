# CrowdVision AI — Python edition

Complete standalone version of the project in **Python (Flask)** with a plain
**HTML / CSS / JavaScript** frontend. Same architecture as the reference app:
feature extraction → ensemble classification → scene-context fusion → 3×3 zone
heatmap → 15-minute forecast → **CPRI** → alerts → PDF/CSV reporting.

## Run

```bash
cd python-app
python -m pip install -r requirements.txt
python app.py            # http://localhost:5000
```

Optional: `pip install opencv-python` to sample a middle frame from video
uploads (without it, video files are analysed as a single decoded frame).

## Layout

```
app.py                     Flask routes + JSON API
crowdvision/features.py    Sobel-lite edges, entropy, HOG-lite, LBP, multi-scale
crowdvision/ensemble.py    RF / XGBoost / Decision Tree vote + count regression
crowdvision/cpri.py        CPRI novel index + alert rules
crowdvision/context.py     Scene text data + Fruin LOS grading
crowdvision/pipeline.py    End-to-end analysis
crowdvision/store.py       SQLite persistence
crowdvision/report.py      ReportLab PDF report
templates/ static/         Pages, CSS, dependency-free JS charts
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/analyze` | multipart `file` + `context` JSON |
| GET | `/api/analyses` | list stored analyses |
| DELETE | `/api/analyses/<id>` | delete one |
| POST | `/api/analyses/clear` | delete all |
| GET | `/api/analytics` | aggregated metrics |
| GET | `/api/export.csv` | CSV export |
| GET | `/api/report/<id>.pdf` | PDF incident report |

Pages: `/`, `/dashboard`, `/upload`, `/analytics`, `/explain`, `/reports`.
