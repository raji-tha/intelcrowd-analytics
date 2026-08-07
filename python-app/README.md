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
crowdvision/adversarial.py Adversarial Density Critic (GAN-style discriminator)
crowdvision/calibration.py Synthetic ground-truth harness + benchmark metrics
tests/test_app.py          End-to-end page/API/PDF smoke test
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

## Pipeline

```
image / video frame
  -> features.py      Sobel-lite edges, entropy, mid-tone, contrast, variance,
                      HOG-lite isotropy, LBP micro-texture, Laplacian scale
  -> ensemble.py      RF / XGBoost / Decision Tree weighted vote (0.30/0.46/0.24)
                      + scale-aware count regression
  -> adversarial.py   Adversarial Density Critic: discriminator-style realism
                      score D(x, n) against corpus anchors, then a confidence-
                      weighted correction toward the fitted density power law
                      (people/megapixel = 6350 * edge ** 0.94)
  -> context.py       Scene text data fusion + Fruin Level-of-Service grading
  -> cpri.py          CPRI weighted geometric mean + rule-based alert engine
  -> pipeline.py      3x3 zone heatmap, 15-min forecast, recommendations
  -> store.py / report.py   SQLite history, CSV export, IEEE-style PDF
```

## Reproducible validation

```bash
python -m crowdvision.calibration    # MAE / RMSE / GAME(1) / decoy rejection
python tests/test_app.py             # all pages + all API endpoints + PDF
```

The harness renders annotated synthetic crowd frames (known ground-truth
counts, perspective scaling) plus non-crowd decoys (foliage, gravel, brick,
printed text) with a fixed seed, so every reported number is reproducible.
Current run: MAE 36.4, RMSE 79.5, GAME(1) 46.8, count accuracy 86.1%,
decoy rejection 100%. The same benchmark is exposed in the app at
`/analytics` via `GET /api/validate`.
