# SPANDANA — AI Cardiac Intelligence

**See Beyond the Heartbeat.**

SPANDANA screens for **left-ventricular hypertrophy (LVH)** from standard
10-second, 12-lead ECGs, and asks a single question: *can a model read a cheap
ECG better than the voltage rules cardiologists have used since 1949?*

It compares four methods on the same patient-wise held-out test set:

| | Method | What it sees |
| --- | --- | --- |
| 1 | **Sokolow–Lyon** (1949) | S(V1) + max R(V5,V6) |
| 2 | **Cornell** (1987) | R(aVL) + S(V3), sex-specific cutoff |
| 3 | **Perceptron** (scikit-learn) | 5 QRS voltages + age |
| 4 | **CNN** (PyTorch, 1-D) | the raw 12 × 1000 waveform |

> **Medical disclaimer.** SPANDANA is not a certified diagnostic device and must
> not be used for clinical decisions. It does not replace ECG interpretation by
> a clinician, echocardiography, or medical judgment. PTB-XL labels are
> cardiologist **ECG-statement** annotations, not imaging-confirmed diagnoses.

---

## Contents

[Results](#results) · [Quick start](#quick-start) · [How it works](#how-it-works) ·
[The data](#the-data) · [Training](#training) · [Backend API](#backend-api) ·
[Frontend](#frontend) · [Project layout](#project-layout) · [Testing](#testing) ·
[Limitations](#limitations) · [References](#references)

---

## Results

Held-out test set = **strat_fold 10** (2,085 recordings, 101 LVH-positive).
Thresholds tuned on **strat_fold 9** only. Nothing here is quoted from
literature — it is what this pipeline measured.

| Method | Threshold | Accuracy | Precision | Sensitivity | Specificity | F1 | ROC-AUC | PR-AUC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sokolow–Lyon (tuned) | 3.83 mV | 0.9381 | 0.4079 | 0.6139 | 0.9546 | 0.4901 | 0.9181 | 0.4384 |
| Cornell (tuned) | 2.78 mV | 0.8916 | 0.2407 | 0.5743 | 0.9078 | 0.3392 | 0.8330 | 0.2402 |
| Perceptron | 0.1745 | 0.9535 | 0.5189 | 0.5446 | 0.9743 | 0.5314 | 0.9322 | 0.5174 |
| **CNN** | 0.9561 | **0.9727** | **0.7200** | **0.7129** | **0.9859** | **0.7164** | **0.9802** | **0.7813** |

In plain counts, out of the 101 LVH recordings in the test fold:

- **CNN — 72 caught, 28 false alarms** (of 1,984 controls)
- Sokolow–Lyon — 62 caught, 90 false alarms
- Perceptron — 55 caught, 51 false alarms

The CNN leads on every metric, and by the widest margin on **PR-AUC**
(0.78 vs 0.52), which is the fairest single number under 1:18 class imbalance.
Put the other way: held to the CNN's budget of 28 false alarms (Sokolow–Lyon at
4.78 mV), the classic rule catches **29** of the 101 cases where the CNN
catches **72**.

Curves, confusion matrices and the raw CSV/JSON live in `data/reports/`; the
API serves the same payload from `backend/models/metrics.json`.

> **One number is stale.** At the *classic* literature cutoffs the committed
> metrics report Sokolow–Lyon 3.5 mV → sens 0.733 / spec 0.917, and Cornell
> (2.0/2.8 mV) → sens 0.792 / spec 0.699. The Cornell row predates two fixes
> (reversed sex coding, and applying the sex-specific cutoff per recording), so
> re-run `python training/evaluate_all.py` on the dataset to refresh it. The
> CNN, Perceptron and tuned-threshold rows are unaffected.

---

## Quick start

Prerequisites: **Python 3.10–3.12**, **Node.js 18+**.

```powershell
.\setup.ps1          # .venv + pip install + npm install + data dirs
.\run_backend.ps1    # FastAPI on :8000
.\run_frontend.ps1   # Next.js on :3000
```

Manual alternative:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-vscode.txt
npm install
```

Set `NEXT_PUBLIC_FASTAPI_URL=http://localhost:8000` in `.env.local` so the UI
can reach the backend. On Windows `pip install torch` installs the CPU build,
which is all SPANDANA needs.

---

## How it works

```
Browser (Next.js)
   │  decodes CSV / TXT / DAT+HEA in-browser
   │  measures Sokolow-Lyon + Cornell locally from the decoded samples
   │  POST /api/v1/screen   { patient, waveform }
   ▼
FastAPI backend (backend/app, :8000)
   │  training/predict_ecg.py → Perceptron + CNN probabilities
   ▼
Model artefacts (backend/models/)
   perceptron_pipeline.joblib · cnn_best.pt · preprocessing.json · metrics.json
```

Two properties worth knowing:

- **Voltage criteria are computed in the browser**, from the decoded samples,
  so they work with the backend offline.
- **AI predictions come only from the backend.** There is no local fallback: if
  the backend is unreachable, the UI says so rather than showing a number.

---

## The data

**PTB-XL v1.0.3** (PhysioNet, CC BY 4.0) — 21,799 ECGs from 18,869 patients,
recorded 1989–1996, used here at **100 Hz** (1,000 samples per lead).
Download: <https://physionet.org/content/ptb-xl/1.0.3/>. The archive is ~1.8 GB
and is **not** committed; `download_dataset.py` fetches it, resumably, and
never downloads twice.

| Group | Rule | Count |
| --- | --- | --- |
| LVH | SCP `LVH` with likelihood 100 | 1,085 |
| Low certainty | `LVH` below 100 — **excluded** | 1,047 |
| Control | no LVH statement | 19,667 |

Splits are **patient-wise**, using PTB-XL's own folds, and leakage is asserted
in the test suite:

| Split | Folds | Recordings | LVH |
| --- | --- | --- | --- |
| Train | 1–8 | 16,597 | 887 |
| Validation | 9 | 2,070 | 97 |
| Test | 10 | 2,085 | 101 |

**Control ≠ healthy.** A control is a recording with no LVH statement; most
carry other cardiac findings.

---

## Training

```powershell
.\run_training.ps1 pipeline      # inspect → labels → splits → preprocess → features
.\run_training.ps1 perceptron    # train + evaluate (seconds, CPU)
.\run_training.ps1 cnn           # train + evaluate (~20 min on CPU)
.\run_training.ps1 evaluate      # 4-method comparison → metrics.json + charts
.\run_training.ps1 all           # everything, including the dataset download
```

Or directly:

```powershell
python training/train_cnn.py --epochs 40 --batch-size 64 --device auto
python training/train_cnn.py --resume      # continue an interrupted run
python training/evaluate_all.py
```

Settings live in `config.json` and can be overridden per run (`--epochs
--batch-size --device --lr --patience --limit`). CUDA is used automatically
when present. Class imbalance is handled with a pos-weighted
`BCEWithLogitsLoss` (CNN) and `class_weight="balanced"` (Perceptron). Early
stopping watches validation PR-AUC and keeps the best checkpoint. Per-lead
z-score stats are fitted on train only and shared verbatim with inference
through `preprocessing.json`. Training is seeded (`cnn.random_state`,
default 42), so a re-run reproduces the same model.

---

## Backend API

```powershell
.\run_backend.ps1        # uvicorn app.main:app --reload --port 8000
```

Interactive docs at <http://localhost:8000/docs>.

| Endpoint | Returns |
| --- | --- |
| `GET /health` | status, which models loaded, version |
| `POST /api/v1/screen` | full result for one ECG — JSON `{patient, waveform}` or multipart `file` (+ `hea`, `sex`) |
| `GET /api/v1/models/metrics` | the measured evaluation payload (503 until `evaluate_all.py` has run) |
| `GET /api/v1/models/status` | which artefacts are present |

A screening response carries `predictions[]` (Perceptron and CNN, each with
`probability`, `positive`, `threshold`, `latencyMs` and real `contributions` —
model coefficients for the Perceptron, gradient saliency for the CNN),
`criteria` (both rules with thresholds and agreement) and `meta`.

Errors are explicit rather than silent: **503** when model artefacts are
missing (with the exact training command), **400** for an unusable waveform
(missing lead, NaN, too short), **422** for an undecodable upload.

---

## Frontend

```powershell
.\run_frontend.ps1       # copies .env.example → .env.local, then npm run dev
```

Eight modules: Dashboard, ECG Analysis (upload), Signal Visualization,
Traditional Analysis, AI Screening, Model Comparison, Analysis Reports and
Research Information.

Every figure is traceable:

- **Metrics** are the measured test-fold results, generated into
  `src/lib/real-data.ts` from the committed research artefacts by
  `scripts/gen_real_data.py`.
- **The case library** is three real PTB-XL test-fold recordings (9869, 8963,
  21325) with the dataset's own ages, sexes, SCP statements and QRS voltages.
  PTB-XL's raw signal archive is not bundled, so the displayed trace is
  *rendered* from those measured voltages — the app labels it as such, and the
  amplitude table marks every rendered value with `~`.
- **Charts** use one validated palette (`src/lib/chart-palette.ts`), checked for
  colourblind separation rather than chosen by eye.

---

## Project layout

```
config.json                 central configuration (paths, training params)
setup.ps1                   one-time environment setup
run_backend.ps1             FastAPI on :8000
run_frontend.ps1            Next.js on :3000
run_training.ps1            every research stage by name

training/                   research code (plain .py, no notebooks)
  download_dataset.py       PTB-XL fetch (resumable)
  inspect_dataset.py        structure, folds, missing values
  extract_lvh.py            LVH cohort + documented control group
  create_splits.py          patient-wise folds + leakage proof
  preprocess_ecg.py         waveforms → signals.npy, train-only z-score stats
  extract_features.py       the five QRS voltages + both criteria
  train_perceptron.py       Perceptron + Platt calibration
  train_cnn.py              1-D CNN training loop (seeded, resumable)
  cnn_model.py              CNN architecture + saliency
  evaluate_*.py             per-model test metrics
  evaluate_all.py           4-method comparison → metrics.json, curves, charts
  metrics.py                the one definition of every reported metric
  predict_ecg.py            single-ECG inference, shared by CLI and backend
  tests/                    pipeline tests (pytest)

backend/                    FastAPI service (app/) + tests
  models/                   trained artefacts + metrics.json

scripts/
  gen_real_data.py          generates src/lib/real-data.ts from the artefacts
  ecg_sanity.ts             asserts the UI criteria match feature_rows.csv

src/                        Next.js frontend
  lib/real-data.ts          generated — measured metrics + the case library
  lib/case-library.ts       builds analyses from those recordings
  lib/chart-palette.ts      validated chart colours (single source of truth)

data/                       dataset, preprocessed arrays, metadata, reports
```

---

## Testing

```powershell
python -m pytest training/tests backend/tests -q   # 22 pass, 2 skip
npm run test:ecg                                   # UI criteria must match feature_rows.csv
bun run scripts/test-parsers.ts                    # browser decoder tests
npm run lint && npx tsc --noEmit                   # frontend lint + types
```

### If the Python tests die with a DLL error

On Windows you may see every CNN-loading test fail with:

```
OSError: [WinError 1114] A dynamic link library (DLL) initialization
routine failed. Error loading ".../torch/lib/c10.dll"
```

This is an environment fault, not a test failure. Importing **scikit-learn
before torch** can leave an OpenMP runtime loaded that torch's `c10.dll`
cannot initialise against:

```powershell
python -c "import torch"                 # fine
python -c "import sklearn, torch"        # WinError 1114
python -c "import torch, sklearn"        # fine - torch first
```

It happens when the packages are installed into a general-purpose Python
rather than this project's own environment. Run `.\setup.ps1` and use the
`.venv` it creates, which installs the pinned set from
`requirements-vscode.txt` together. To confirm the suite itself is sound
without rebuilding anything:

```powershell
python -c "import torch; import sys, pytest; sys.exit(pytest.main(['training/tests','backend/tests','-q']))"
```

That reports the full 22 pass / 2 skip.

`ecg_sanity.ts` is the guard on the case library: it re-derives both criteria
the way the app does and asserts they match the dataset values, exiting
non-zero on any mismatch. It is worth wiring into CI.

---

## Limitations

1. **Labels are ECG statements, not anatomy.** SCP annotations record what the
   annotator saw in the ECG; agreement with echocardiographic LVH is moderate
   at best. The models learn the annotation convention.
2. **Control ≠ healthy** — see [The data](#the-data).
3. **Baseline convention.** R/S are measured against the median-of-trace
   baseline; published cutoffs were calibrated on PR-segment baselines, so the
   classic operating points shift slightly. Classic and tuned results are both
   reported.
4. **Class imbalance (1:18).** PR-AUC is the fairest ranking metric; accuracy
   alone is misleading — a model answering "no LVH" every time scores 95%.
5. **One dataset, one population.** PTB-XL is a 1990s German cohort;
   generalisation is unproven.
6. **Thresholds are the noisiest link.** They are tuned for F1 on a validation
   fold holding only 97 LVH cases — the operating point, not the model.
7. **Rendered traces.** The bundled case library carries measured voltages, not
   raw samples; the drawn waveform is an illustration. Uploaded recordings are
   decoded for real.

---

## References

- Wagner, P. et al. *PTB-XL, a large publicly available electrocardiography
  dataset.* Scientific Data 7, 154 (2020).
  <https://doi.org/10.1038/s41597-020-0495-6>
- Goldberger, A. et al. *PhysioBank, PhysioToolkit, and PhysioNet.*
  Circulation 101(23), e215–e220 (2000).
- Sokolow, M. & Lyon, T. P. *The ventricular complex in left ventricular
  hypertrophy.* American Heart Journal 37(1), 161–186 (1949).
- Casale, P. N., Devereux, R. B. et al. *Improved sex-specific criteria of left
  ventricular hypertrophy for electrocardiography.* Circulation 75(3), 565–572
  (1987).
- Dataset: <https://physionet.org/content/ptb-xl/1.0.3/>
