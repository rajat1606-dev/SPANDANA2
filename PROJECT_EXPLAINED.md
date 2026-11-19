# SPANDANA, explained simply

A plain-language guide to the whole project: the idea, the science, how it works, what every file does, and what is still worth knowing before you quote a number.

Updated 19 Nov 2026 to match the current repo (after the pipeline fixes were merged and the demo data was removed).

---

## 1. The project in one minute

- Some people have a heart problem called **LVH**. It is dangerous, but it gives no warning signs.
- The accurate test for it (an ultrasound scan) is costly and rare.
- A cheap test (an **ECG**) is available everywhere, but doctors read it with simple hand-made rules from 1949 and 1987.
- **SPANDANA teaches a computer to read the cheap test, and checks whether the computer does better than the old rules.**
- It has three parts: a **training pipeline** (teaches and tests the computer), a **backend** (a small server that gives answers), and a **website** (what people see and click).
- Everything shown is now **real**: measured on the real PTB-XL dataset. There is no fake/demo data anymore.

---

## 2. The basics you need

### 2.1 The heart and LVH

- The heart is a pump with four rooms. The **left ventricle** is the main room. It pushes blood to the whole body.
- **LVH (Left Ventricular Hypertrophy)** means the wall of that room has become too thick.
- Why it happens: usually years of high blood pressure. The muscle works too hard and bulks up, like an arm muscle after lifting weights.
- Why it is bad: a thick wall is stiff and pumps badly. It raises the risk of heart failure, stroke and sudden death.
- The good news: if it is found early, treating the blood pressure helps.

### 2.2 The two tests

| | ECG | Echo (echocardiogram) |
|---|---|---|
| What it is | Stickers on the skin record the heart's electricity | An ultrasound picture of the heart |
| Time | About 10 seconds | Much longer |
| Cost | Very cheap | Costly |
| Who can do it | Almost any clinic | Needs a special machine and a trained person |
| Can it measure wall thickness? | No, it can only hint at it | Yes |

### 2.3 What an ECG looks like

- An ECG is a wavy line. Each heartbeat draws the same shape again.
- The tall sharp spike in each beat is the **QRS**. The upward part is the **R wave**; the downward part after it is the **S wave**.
- The height of a spike is measured in **millivolts (mV)**.
- A full ECG has **12 leads** — the same heartbeat seen from 12 angles, like 12 cameras around one object. Their names are I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6.
- A thicker heart wall makes more electricity, so some spikes get taller. That is the hint the ECG gives about LVH.

### 2.4 The two old rules

Both rules add two spike heights and compare the total with a fixed number.

| Rule | Year | What it adds | Says "LVH" when the total is |
|---|---|---|---|
| **Sokolow-Lyon** | 1949 | S wave in V1 + the taller R wave of V5 or V6 | 3.5 mV or more |
| **Cornell** | 1987 | R wave in aVL + S wave in V3 | 2.8 mV or more (men), 2.0 mV or more (women) |

- They are easy to do by hand, which is why they are still used.
- They use only 3 or 4 numbers out of a whole 12-lead recording, so they throw most of the information away.

### 2.5 What "AI" means here

- **Machine learning** means: instead of writing a rule ourselves, we show the computer thousands of examples with the correct answer, and it works out its own rule.
- **Training** is the learning step. **Testing** is the exam, done on examples the computer has never seen.
- The exam must use different patients from the ones used for learning. If the same patient is in both, the computer can just memorise them. This cheating is called **leakage**.

The project uses two kinds of AI:

| Model | Simple picture | What goes in |
|---|---|---|
| **Perceptron** | One single "brain cell": multiplies each input by a weight, adds them up, says yes or no. | Five spike heights + age |
| **CNN** (convolutional neural network) | Many small pattern-detectors stacked in layers. Early layers spot simple shapes, later layers combine them. | The whole raw ECG: 12 leads × 1000 points |

- The perceptron is the simplest neural network there is. It can only learn slightly better weights for the old spike heights.
- The CNN can find patterns no human told it about, such as the *shape* of a wave, not just its height.

### 2.6 How we mark the exam

Think of 101 sick people and 1,984 healthy people being tested (the real test-set sizes here).

| Word | Meaning in plain words |
|---|---|
| **Sensitivity** | Out of the sick people, how many did we catch? |
| **Specificity** | Out of the healthy people, how many did we correctly send home? |
| **False alarm** | A healthy person wrongly told "you may have LVH" |
| **Miss** | A sick person wrongly told "you are fine" |
| **Precision** | Of everyone we flagged, how many were really sick? |
| **Cut-off (threshold)** | The line above which the method says "LVH". Lower the line → catch more, but more false alarms. |
| **ROC-AUC** | One score from 0 to 1 for how well a method separates sick from healthy over all cut-offs. 0.5 is a coin toss, 1.0 is perfect. |
| **PR-AUC** | Like AUC, but the fairest single number when the sick group is tiny (here 1 in 19). |
| **Confusion matrix** | A small 2×2 table: caught, missed, false alarms, correctly cleared |

- "Accuracy" alone is misleading here. Only about 1 ECG in 19 has LVH, so a method that always says "no LVH" would be ~95% accurate and useless. That is why we lead with **PR-AUC**.

---

## 3. The data: PTB-XL

- **PTB-XL** is a free, public collection of real hospital ECGs from Germany, recorded 1989–1996.
- It has **21,799 ECGs** from **18,869 patients**. Each is 12 leads and 10 seconds long.
- Each ECG has labels written by heart doctors, including whether they saw LVH and how sure they were (0–100).
- The project uses the **100 Hz** version (100 measurements per second → 1,000 points per lead).
- The dataset is **not inside the repo** (about 1.8 GB). `download_dataset.py` fetches it. The trained models and all result files **are** in the repo.

How the project sorts the ECGs:

| Group | Rule | Count |
|---|---|---|
| LVH | Doctor marked LVH and was 100% sure | 1,085 |
| Low certainty | Doctor marked LVH but was less than 100% sure — **thrown out** | 1,047 |
| Control ("not LVH") | No LVH label at all | 19,667 |

- "Control" does **not** mean healthy. About 96% of these people have *other* heart findings — just not LVH.

How the kept ECGs are split (PTB-XL comes with 10 ready-made patient groups called folds):

| Part | Folds | ECGs | With LVH | Used for |
|---|---|---|---|---|
| Train | 1–8 | 16,597 | 887 | Learning |
| Validation | 9 | 2,070 | 97 | Choosing settings and cut-offs |
| Test | 10 | 2,085 | 101 | The final exam, used once |

- No patient appears in more than one part. The test suite checks this (no leakage).

---

## 4. How the project works, step by step

```
PTB-XL data
   │
   ├─ 1. download_dataset.py      get the data (resumable)
   ├─ 2. inspect_dataset.py       look at it, check it is complete
   ├─ 3. extract_lvh.py           decide LVH / low-certainty / control
   ├─ 4. create_splits.py         train / validation / test, by patient (+ leakage proof)
   ├─ 5. preprocess_ecg.py        read all ECG files into one big array (signals.npy)
   ├─ 6. extract_features.py      measure 5 spike heights + apply the old rules
   ├─ 7. train_perceptron.py      teach the perceptron   → evaluate_perceptron.py
   ├─ 8. train_cnn.py             teach the CNN (seeded) → evaluate_cnn.py
   └─ 9. evaluate_all.py          score all four methods on the test set
                                        │
                     result files + trained models (backend/models/)
                                        │
                            backend (FastAPI server)
                                        │
                              website (Next.js)
```

Two things worth knowing about how the website gets its answers:

- **The two old rules are calculated in your browser**, straight from the uploaded ECG, so they work even if the backend is off.
- **The AI answers come only from the backend.** There is no fake fallback anymore: if the backend is not running, the website clearly says so instead of showing a made-up number.

A few details:

- **Measuring spikes:** for each lead, the "zero line" is the middle value (median) of the 10 seconds. R height = highest point − zero line; S depth = zero line − lowest point.
- **Perceptron:** the five heights + age are put on the same scale; LVH examples are weighted more (they are rare); the best settings are chosen on validation.
- **CNN:** three layers of pattern-detectors, trained with a **fixed random seed** so a re-run gives the same model. Early stopping keeps the best version by validation PR-AUC.
- **Cut-offs** are picked on the validation part, never on the test part.

---

## 5. The results

All four methods on the same 2,085 test ECGs (101 with LVH, 1,984 without). These are **measured**, not copied from any textbook.

| Method | Sensitivity (caught) | Specificity | ROC-AUC | PR-AUC |
|---|---|---|---|---|
| Sokolow-Lyon (tuned 3.83 mV) | 0.614 (62 of 101) | 0.955 | 0.918 | 0.438 |
| Cornell (tuned 2.78 mV) | 0.574 | 0.908 | 0.833 | 0.240 |
| Perceptron | 0.545 (55 of 101) | 0.974 | 0.932 | 0.517 |
| **CNN** | **0.713 (72 of 101)** | **0.986** | **0.980** | **0.781** |

In plain counts, out of the 101 real LVH recordings:

- **CNN — 72 caught, 28 false alarms** (out of 1,984 healthy)
- Sokolow-Lyon — 62 caught, 90 false alarms
- Perceptron — 55 caught, 51 false alarms

What this means:

- **The CNN wins on every measure**, and by the most on **PR-AUC** (0.78 vs 0.52), which is the fairest number here.
- **A fair side-by-side:** if you force the old Sokolow-Lyon rule to raise only as many false alarms as the CNN (28), it catches just **29** of the 101 cases — the CNN catches **72**.
- **The perceptron barely beats the old rule** (AUC 0.932 vs 0.918). It uses the same spike heights, so it has little new to learn from.

At the **classic literature cut-offs** (rather than the tuned ones above): Sokolow-Lyon at 3.5 mV catches 73% with 92% specificity; Cornell at 2.0/2.8 mV catches 70% with 82% specificity.

Those Cornell figures were refreshed on 19 Nov 2026 by re-running the whole pipeline on the downloaded dataset. They previously read 79% / 70%, produced before two fixes (the sex coding and the per-patient Cornell cut-off). Everything else reproduced exactly: all four tuned rows above matched the previous results to four decimals.

---

## 6. The three parts of the software

| Part | Language | Job |
|---|---|---|
| **Training pipeline** (`training/`) | Python | Prepares data, trains both models, scores everything |
| **Backend** (`backend/`) | Python (FastAPI) | A small server. Send it an ECG, it returns the two rule results and the two AI scores |
| **Website** (`src/`) | TypeScript (Next.js, React) | Eight pages for uploading an ECG and viewing results |

The eight website pages:

| Page | What you see |
|---|---|
| Dashboard | Overview and the real model-performance numbers |
| ECG Analysis | Upload an ECG file and run the full check |
| Signal Visualization | The 12-lead ECG drawn on ECG paper |
| Traditional Analysis | The two old rules, with the sums shown |
| AI Screening | Perceptron and CNN scores (from the backend) |
| Model Comparison | The four methods side by side |
| Analysis Reports | A printable report for one ECG |
| Research Information | Background on LVH, the method and the limits |

How the website gets **real** numbers (no demo mode anymore):

- **The performance numbers** come from `src/lib/real-data.ts`, which is generated by `scripts/gen_real_data.py` straight from the committed result files.
- **The three built-in example ECGs** ("case library") are **real PTB-XL test recordings** (IDs 9869, 8963, 21325) with the dataset's own ages, sexes, doctor labels and voltages. The raw signal archive is not bundled, so the *drawn trace* is a rendered illustration from those real voltages — the app marks every rendered value with a `~`.
- **AI predictions are never faked.** They come only from the backend; until it answers, the page shows no number and says so.

---

## 7. Every file, explained

### 7.1 Top level

| File | What it is |
|---|---|
| `README.md` | The developer guide: results, setup, API, layout, limits |
| `PROJECT_EXPLAINED.md` | This plain-language guide |
| `config.json` | All settings in one place: folds, CNN size, training rounds, folder names, server port |
| `.env.example` | Sample settings file. Tells the website where the backend is (`http://localhost:8000`) |
| `.gitignore` | Files Git should not upload (the big dataset `data/ptbxl/`, the virtual environment, build output) |
| `requirements-vscode.txt` | List of Python libraries to install |
| `setup.ps1` | One-time setup on Windows: makes a Python environment, installs Python + npm packages, creates data folders |
| `run_training.ps1` | Runs pipeline stages by name (`pipeline`, `preprocess`, `perceptron`, `cnn`, `evaluate`, `all`) |
| `run_backend.ps1` | Starts the backend server on port 8000 |
| `run_frontend.ps1` | Copies `.env.example` → `.env.local`, then starts the website on port 3000 |
| `package.json` | JavaScript libraries and commands, including `npm run test:ecg` (the ECG check) and `npm run dev` |
| `bun.lock` | Exact versions of the JavaScript libraries |
| `next.config.ts`, `next-env.d.ts`, `tsconfig.json` | Next.js and TypeScript settings |
| `tailwind.config.ts`, `postcss.config.mjs` | Styling-tool settings |
| `eslint.config.mjs` | Code-style checker settings |
| `components.json` | Settings for the ready-made button/card kit |
| `Caddyfile` | **Leftover** from the tool the site was first built in. Not used |
| `SPANDANA_complete.zip` | **Leftover** — a second copy of the project inside the repo. Safe to delete |

### 7.2 `training/` (the research pipeline)

| File | What it does |
|---|---|
| `config.py` | Reads `config.json` and works out all folder paths |
| `download_dataset.py` | Downloads PTB-XL. Can resume if the download breaks |
| `inspect_dataset.py` | Prints facts about the dataset: rows, missing values, folds |
| `extract_lvh.py` | Reads each doctor label and sorts ECGs into LVH / low-certainty / control. Uses the correct PTB-XL sex coding (0 = male, 1 = female) |
| `create_splits.py` | Puts each ECG into train/validation/test, and checks no patient is in two parts |
| `preprocess_ecg.py` | Reads every ECG file and saves them as one big array (`signals.npy`), plus each lead's average/spread from the **training part only** |
| `extract_features.py` | Measures the five spike heights and applies both old rules to every ECG |
| `train_perceptron.py` | Trains the perceptron, tries several settings, calibrates it, picks its cut-off |
| `evaluate_perceptron.py` | Scores the perceptron on the test set |
| `cnn_model.py` | The CNN design, plus a helper that shows which parts of the signal mattered (saliency) |
| `train_cnn.py` | Trains the CNN (**seeded**, resumable), stops early, saves the best version. The train-curve scores are now measured correctly |
| `evaluate_cnn.py` | Picks the CNN's cut-off on validation, then scores it on the test set |
| `evaluate_all.py` | Scores all four methods on the test set and makes the comparison table + charts. Cornell uses the **per-patient** sex-specific cut-off |
| `metrics.py` | One shared definition of sensitivity, specificity, AUC, etc. |
| `predict_ecg.py` | Takes **one** ECG and returns both rule results and both AI scores. The backend uses this |
| `tests/test_pipeline.py` | Automatic checks on labels, splits, leakage, measurements, model loading |
| `__init__.py` | Marks the folder as a Python package |

### 7.3 `backend/` (the server)

| File | What it does |
|---|---|
| `app/main.py` | Starts the server and lets the website talk to it |
| `app/config.py` | Server settings and where the model files live |
| `app/api/routes.py` | The four web addresses the server answers (below) |
| `app/schemas/models.py` | The exact shape of data in and out. Accepts `sex` in **any** capitalisation now |
| `app/services/ecg_io.py` | Reads uploaded ECG files (`.csv`, `.txt`, or `.dat` + `.hea`) |
| `app/services/screening.py` | Passes the ECG to `predict_ecg.py` and turns errors into clear messages |
| `app/services/model_status.py` | Reports which model files are present |
| `app/utils/leads.py` | Fixes lead-name spelling (e.g. `AVR` → `aVR`) |
| `requirements.txt` | Python libraries the backend needs |
| `tests/test_api.py`, `tests/conftest.py` | Automatic checks on the server |
| `tests/fixtures/00001_lr.*` | One real PTB-XL ECG used by the tests |

The four addresses:

| Address | What it returns |
|---|---|
| `GET /health` | "I am running", and which models are ready |
| `POST /api/v1/screen` | The full result for one ECG |
| `GET /api/v1/models/metrics` | The saved real test results (503 until `evaluate_all.py` has run) |
| `GET /api/v1/models/status` | Which model files exist |

### 7.4 `backend/models/` (the trained models)

| File | What it is |
|---|---|
| `cnn_best.pt` | The trained CNN |
| `cnn_meta.json` | Notes about the CNN: design, cut-off, validation scores |
| `perceptron_pipeline.joblib` | The trained perceptron with its scaling step |
| `perceptron_meta.json` | Notes about the perceptron: settings, cut-off |
| `preprocessing.json` | Each lead's average/spread, used to put a new ECG on the same scale as training |
| `metrics.json` | All real test results in one file. The website and API read this |

### 7.5 `data/` (tables and results)

| File | What it is |
|---|---|
| `metadata/spandana_lvh_metadata.csv` | All ECGs with patient details and the LVH group |
| `metadata/spandana_split_assignments.csv` | Which part each ECG went to |
| `metadata/spandana_patient_summary.csv` | One row per patient |
| `metadata/feature_rows.csv` | The five spike heights + both rule results per ECG |
| `preprocessed/index.csv` | Maps each row of the big signal array to its ECG |
| `cnn_runs/history.json` | The CNN's scores after each training round |
| `cnn_runs/training_history.png` | Those scores as a chart |
| `cnn_runs/latest.pt` | The CNN's most recent state, for resuming |
| `reports/model_comparison.csv` | The final four-method table |
| `reports/cnn_test_metrics.json`, `perceptron_test_metrics.json` | Full per-model test results |
| `reports/roc_curves.png`, `pr_curves.png`, `confusion_matrices.png`, `comparison_chart.png` | The result charts |
| `reports/dataset_inspection.csv` | Missing-value counts per column |
| `reports/label_limitations.md` | Honest notes on what the labels can and cannot tell us |

### 7.6 `src/` (the website)

**Pages and shell**

| File | What it does |
|---|---|
| `app/page.tsx` | The single page that holds everything and switches between the eight views |
| `app/layout.tsx` | Page title, fonts, outer frame |
| `app/globals.css` | Site-wide colours and styles |

**The eight views** (`components/views/`): `DashboardView`, `UploadView` (ECG Analysis), `VisualizationView`, `CriteriaView` (Traditional Analysis), `ScreeningView` (AI Screening), `ComparisonView` (Model Comparison), `ReportsView`, `ResearchView`.

**Other components**

| File | What it does |
|---|---|
| `components/layout/Header.tsx` | Top bar; shows whether the backend is connected |
| `components/layout/Sidebar.tsx` | Left menu |
| `components/layout/Footer.tsx` | Bottom strip with the "not a medical device" notice |
| `components/ecg/EcgGrid.tsx`, `ecg-paper.css` | Draws the 12 leads on pink ECG graph paper |
| `components/shared/*` | Small shared pieces (selector, stat cards, badges) |
| `components/ui/` (48 files) | A ready-made kit of buttons, cards, tables, etc. (shadcn/ui) — not written for this project |

**Logic** (`lib/`, `store/`, `hooks/`)

| File | What it does |
|---|---|
| `lib/real-data.ts` | **Generated** by `gen_real_data.py`: the real measured metrics + the three real case recordings |
| `lib/case-library.ts` | Builds the on-screen "analyses" from those real recordings; renders the illustrative trace from real voltages |
| `lib/chart-palette.ts` | One validated set of chart colours (checked for colour-blind separation), used everywhere |
| `lib/api.ts` | Talks to the backend; if it is off, the UI shows "no number" rather than a fake one |
| `lib/ecg/types.ts` | Definitions of the data shapes |
| `lib/ecg/parsers.ts` | Reads uploaded ECG files inside the browser |
| `lib/ecg/real-signal.ts` | Measures spike heights and heart rate from an uploaded ECG |
| `lib/ecg/criteria.ts` | The two old rules, done in the browser |
| `lib/ecg/waveform.ts` | Draws the illustrative trace for the case-library recordings from their real voltages |
| `lib/stats.ts` | Small helper for the curve charts |
| `lib/nav.ts` | Names and icons for the menu |
| `lib/utils.ts` | A tiny styling helper |
| `lib/db.ts` | **Leftover** database helper. Not used |
| `store/analyses.ts` | Remembers your uploaded ECGs in the browser (the old demo library and local simulator were removed) |
| `hooks/use-mobile.ts`, `hooks/use-toast.ts` | Small UI helpers |

### 7.7 `scripts/` and other folders

| File | What it is |
|---|---|
| `scripts/gen_real_data.py` | Builds `src/lib/real-data.ts` from the committed result files. Detects which sex convention a CSV was written with (using PTB-XL's ~52% male share) instead of blindly flipping it |
| `scripts/ecg_sanity.ts` | The `npm run test:ecg` check: re-derives both rules the way the app does and asserts they match the dataset values |
| `scripts/make-sample-ecg.ts`, `scripts/sample-ecg.*` | A sample ECG for trying the upload page |
| `scripts/test-parsers.ts` | Checks the browser file readers |
| `scripts/verify_ptbxl_*.py`, `check_details.py`, `list_remote_zip.py` | One-off checks the author ran while building |
| `scripts/build_spandana_01.py`, `spandana01_cells_*.py`, `*notebook*.py` | **Leftover** notebook-building scripts. Not needed |
| `public/` | Logo, icon, `robots.txt` |
| `prisma/schema.prisma`, `db/custom.db` | **Leftover** empty database template. Not used |

---

## 8. How to run it

From the README. Needs **Python 3.10–3.12** and **Node.js 18+**.

**One-time setup** (in the project folder):

```powershell
.\setup.ps1
```

This makes the Python environment, installs the Python and npm packages, and creates the data folders. (You prefer `uv` — `uv venv` then `uv pip install -r requirements-vscode.txt` works too; then `npm install`.)

**Run the app** (two terminals):

```powershell
.\run_backend.ps1      # server on http://localhost:8000
.\run_frontend.ps1     # website on http://localhost:3000
```

The trained models are already in the repo, so the app works without downloading PTB-XL.

**Re-train / regenerate everything from raw data** (optional, downloads ~1.8 GB, the CNN takes ~20 min on CPU):

```powershell
.\run_training.ps1 all
```

**Tests**

```powershell
python -m pytest training/tests -q     # labels, splits, leakage, features, models
python -m pytest backend/tests -q      # endpoints, uploads, bad inputs
npm run test:ecg                       # UI rules must match the dataset
npm run lint                           # frontend lint
```

**Windows notes**

- `npm run build` works on Windows now (it no longer uses a Unix-only copy command).
- If the Python tests fail with a DLL error (`c10.dll` / `WinError 1114`), the libraries were installed into the wrong Python. Use the environment `setup.ps1` makes; importing `torch` before `scikit-learn` also avoids it.

---

## 9. What was fixed (and what is still a known limit)

### Fixed (all merged)
A code review found 9 issues; they are now all fixed in the repo:

1. `.gitignore` now ignores the real dataset folder (`data/ptbxl/`), so the 1.8 GB download can't be committed by accident.
2. The `pipeline` stage now runs the preprocess step before features.
3. The `dev` script no longer uses the Unix-only `tee`, so it runs on Windows.
4. The backend accepts `sex` in any capitalisation ("Male", "FEMALE", …), so website uploads get **real** AI instead of falling back.
5. The sex coding is correct (PTB-XL is 0 = male, 1 = female), so the Cornell men/women cut-offs land on the right people.
6. The "classic" Cornell check uses each patient's own sex-specific cut-off, not one value for everyone.
7. The CNN training graph now measures train-set scores correctly (they were comparing shuffled scores to unshuffled labels).
8. The CNN training is **seeded**, so a re-run gives the same model.
9. The dashboard shows **real** measured numbers everywhere; all demo/simulated data was removed.

### Still worth knowing (by design)
- **Labels are ECG readings, not echo scans.** The AI is learning to copy how cardiologists read ECGs, not measured wall thickness.
- **"Control" is not "healthy."** Controls just have no LVH label; most have other heart findings.
- **The low-certainty cases were removed**, which makes the exam a bit easier.
- **Only 101 LVH cases in the test**, so the CNN's 71% could really be roughly 62–79%.
- **One dataset, one country, 1990s machines** — it may not transfer elsewhere without re-testing.
- **The three built-in example traces are drawn illustrations** (real voltages, rendered waveform). Uploaded ECGs are decoded for real.
- It is a **student research project, not a medical device.**

---

## 10. Word list

| Word | Meaning |
|---|---|
| LVH | Thickened wall of the heart's main pumping room |
| ECG | A 10-second recording of the heart's electricity |
| Echo | Ultrasound picture of the heart |
| Lead | One of 12 viewing angles in an ECG |
| QRS, R wave, S wave | The sharp spike in each beat, its upward part, its downward part |
| mV | Millivolt, the unit of spike height |
| Hz | Measurements per second |
| Dataset / label | A collection of examples / the correct answer attached to one |
| Model | The thing that has learned |
| Training / validation / test | Learning / tuning / final exam |
| Leakage | Cheating by letting the exam contain what was studied |
| Epoch | One full pass through the training examples |
| Seed | A fixed starting number that makes a run repeatable |
| Weight | A number the model adjusts while learning |
| Perceptron | A single artificial brain cell |
| CNN | A network of stacked pattern-detectors |
| Threshold / cut-off | The line between "LVH" and "not LVH" |
| ROC-AUC / PR-AUC | Scores for how well a method separates sick from healthy |
| Backend / frontend | The server that does the work / the website people see |
| API | The set of addresses a program uses to ask the backend for things |
| Repo | A project folder tracked by Git |
