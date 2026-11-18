# CLAUDE.md — SPANDANA working context

## What this is

SPANDANA screens for **LVH** (a thickened heart wall) from a 12-lead ECG and
compares two trained models (a **perceptron** and a **CNN**) against the classic
**Sokolow–Lyon** and **Cornell** voltage rules, on the real **PTB-XL** dataset.

- `training/` — Python pipeline (label, split, preprocess, features, train, evaluate)
- `backend/` — FastAPI server (real inference + metrics)
- `src/` — Next.js dashboard (8 views)
- `README.md` — setup, results, API, limitations
- `PROJECT_EXPLAINED.md` — plain-language, file-by-file guide

Headline numbers (PTB-XL test fold 10, 101 LVH of 2,085):
**CNN 72/101 caught, 28 false alarms, ROC-AUC 0.980** · Perceptron 55/101, 0.932
· Sokolow–Lyon 62/101, 0.918.

## Current state

Everything is merged into `main` and pushed. There is no open PR and no
outstanding local work.

## How to run

```powershell
.\setup.ps1          # .venv + pip install + npm install
.\run_backend.ps1    # FastAPI on :8000
.\run_frontend.ps1   # Next.js on :3000
```

Python uses **uv** if you prefer: `uv venv` → `uv pip install -r requirements-vscode.txt`.
Set `NEXT_PUBLIC_FASTAPI_URL=http://localhost:8000` in `.env.local`, or the UI
shows voltage criteria only and says the backend is offline.

Tests:

```powershell
python -m pytest training/tests backend/tests -q   # 22 pass / 2 skip
npm run test:ecg                                   # asserts UI criteria == feature_rows.csv
npm run lint && npx tsc --noEmit
```

`npx tsc --noEmit` reports one error in `src/lib/db.ts` only when Prisma's client
has not been generated (e.g. after `npm install --ignore-scripts`). That file is
unused scaffolding — nothing imports it.

## Conventions worth knowing

- **AI predictions come only from the backend.** There is no local simulator; if
  the backend is unreachable the UI says so rather than inventing a number.
- **The case library is real PTB-XL data.** `src/lib/real-data.ts` is *generated*
  by `scripts/gen_real_data.py` from the committed artefacts — edit the generator,
  not the output. Its traces are rendered from measured voltages, because the raw
  signal archive is not bundled; the UI labels this everywhere.
- **Chart colours live in `src/lib/chart-palette.ts`** and were validated for
  colourblind separation. Don't substitute hexes by eye; the file records the
  commands to re-run.
- **Commits are authored `Parth Ahuja <hacking0005678@gmail.com>`**, which is the
  address on the `DeadAlmighty` GitHub account. Keep using it so attribution
  stays on one identity.

## Pending

- [ ] **Re-run the pipeline** to refresh the *classic-threshold Cornell* numbers:
      `.\run_training.ps1 all` (needs the ~1.8 GB PTB-XL download). They predate
      the sex-coding and per-recording-threshold fixes. The CNN, perceptron and
      tuned-threshold numbers are already correct. Afterwards regenerate the
      frontend data with `python scripts/gen_real_data.py` — it detects the
      corrected sex convention by itself and should report
      `correct, taking as stored`.
- [ ] **Open review findings** (raised, not yet fixed):
      1. `ReportsView` prints rendered heart rate / beats / duration / sampling as
         if they were the recording's own values.
      2. "Sampling 500 Hz" contradicts the 100 Hz records this project reads.
      3. `LEGACY_STORAGE_KEYS` in `src/store/analyses.ts` won't cover a future
         persist-key bump.
- [ ] **The outcomes donut** on the dashboard is still a donut; ranked bars or a
      segmented bar would compare close values better.
- [ ] **Dark-mode chart colours** are chosen and validated in `chart-palette.ts`
      but not wired, so charts don't adapt to the theme.

## Notes

- PhysioNet (the PTB-XL source) was blocked from an earlier cloud environment, so
  any full re-run on raw data must happen locally.
- `data/` holds the committed metadata, reports and trained artefacts; the raw
  dataset itself is gitignored.
