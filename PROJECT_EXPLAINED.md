# SPANDANA, explained simply

A plain-language guide to the whole project: the idea, the science, how it works, what every file does, and what is still wrong with it.

Written on 17 Nov 2026 from the repo `rajat1606-dev/SPANDANA2` (commit `f013b30`).

---

## 1. The project in one minute

- Some people have a heart problem called **LVH**. It is dangerous, but it gives no warning signs.
- The accurate test for it (an ultrasound scan) is costly and rare.
- A cheap test (an **ECG**) is available everywhere, but doctors read it with simple hand-made rules from 1949 and 1987.
- **SPANDANA teaches a computer to read the cheap test, and checks whether the computer does better than the old rules.**
- It has three parts: a **training pipeline** (teaches and tests the computer), a **backend** (a small server that gives answers), and a **website** (what people see and click).

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
- The tall sharp spike in each beat is called the **QRS**. The upward part is the **R wave**. The downward part after it is the **S wave**.
- The height of a spike is measured in **millivolts (mV)**.
- A full ECG has **12 leads**. A lead is the same heartbeat seen from a different angle, like 12 cameras around one object. Their names are I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6.
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
- The exam must use different patients from the ones used for learning. If the same patient is in both, the computer can simply remember that person. This cheating is called **leakage**.

The project uses two kinds of AI:

| Model | Simple picture | What goes in |
|---|---|---|
| **Perceptron** | One single "brain cell". It multiplies each input by a weight, adds them up, and says yes or no. | Five spike heights (the same ones the old rules use) |
| **CNN** (convolutional neural network) | Many small pattern-detectors stacked in layers. Early layers spot simple shapes, later layers combine them. | The whole raw ECG: 12 leads × 1,000 points |

- The perceptron is the simplest neural network there is. It can only learn slightly better weights for the old spike heights.
- The CNN can find patterns no human told it about, such as the shape of a wave and not just its height.

### 2.6 How we mark the exam

Think of 100 sick people and 100 healthy people being tested.

| Word | Meaning in plain words |
|---|---|
| **Sensitivity** | Out of the sick people, how many did we catch? |
| **Specificity** | Out of the healthy people, how many did we correctly send home? |
| **False alarm** | A healthy person wrongly told "you may have LVH" |
| **Miss** | A sick person wrongly told "you are fine" |
| **Precision** | Of everyone we flagged, how many were really sick? |
| **Cut-off (threshold)** | The line above which the method says "LVH". Lower the line and you catch more people but raise more false alarms. |
| **AUC** | One score from 0 to 1 for how well a method separates sick from healthy over all possible cut-offs. 0.5 is a coin toss. 1.0 is perfect. |
| **Confusion matrix** | A small 2×2 table: caught, missed, false alarms, correctly cleared |

- "Accuracy" alone is misleading here. Only about 1 ECG in 20 has LVH, so a method that always says "no LVH" would be 95% accurate and completely useless.

---

## 3. The data: PTB-XL

- **PTB-XL** is a free, public collection of real hospital ECGs from Germany, recorded between 1989 and 1996.
- It has **21,799 ECGs** from **18,869 patients**. Each is 12 leads and 10 seconds long.
- Each ECG has labels written by heart doctors (cardiologists), including whether they saw LVH and how sure they were (0 to 100).
- The project uses the version sampled at **100 Hz**, which means 100 measurements each second, so 1,000 points per lead.
- The dataset is **not inside this repo** (it is about 1.8 GB). You download it with a script. The trained models and all result files **are** in the repo.

How the project sorts the ECGs:

| Group | Rule | Count |
|---|---|---|
| LVH | Doctor marked LVH and was 100% sure | 1,085 |
| Unsure | Doctor marked LVH but was less than 100% sure. **Thrown out.** | 1,047 |
| Not LVH ("control") | No LVH label at all | 19,667 |

- "Not LVH" does not mean healthy. Most of these people have other heart findings.

How the remaining 20,752 ECGs are split (PTB-XL comes with 10 ready-made patient groups called folds):

| Part | Folds | ECGs | Used for |
|---|---|---|---|
| Train | 1 to 8 | 16,597 | Learning |
| Validation | 9 | 2,070 | Choosing settings and cut-offs |
| Test | 10 | 2,085 (101 with LVH) | The final exam, used once |

- No patient appears in more than one part. This was checked.

---

## 4. How the project works, step by step

```
PTB-XL data
   │
   ├─ 1. download_dataset.py      get the data
   ├─ 2. inspect_dataset.py       look at it, check it is complete
   ├─ 3. extract_lvh.py           decide LVH / unsure / not LVH
   ├─ 4. create_splits.py         train / validation / test, by patient
   ├─ 5. preprocess_ecg.py        read all ECG files into one big array
   ├─ 6. extract_features.py      measure 5 spike heights, apply the old rules
   ├─ 7. train_perceptron.py      teach the perceptron   → evaluate_perceptron.py
   ├─ 8. train_cnn.py             teach the CNN          → evaluate_cnn.py
   └─ 9. evaluate_all.py          score all four methods on the test set
                                        │
                     result files + trained models (backend/models/)
                                        │
                            backend (FastAPI server)
                                        │
                              website (Next.js)
```

A few details worth knowing:

- **Measuring spikes:** for each lead, the "zero line" is taken as the middle value (median) of the 10 seconds. R height = highest point minus zero line. S depth = zero line minus lowest point.
- **Perceptron:** the five heights are first put on the same scale. Because LVH is rare, LVH examples are given more weight. Several settings are tried and the best on validation is kept.
- **CNN:** three layers of pattern-detectors (32, 64, then 96 detectors), followed by a final decision layer. About 240,000 adjustable numbers in total. Training was allowed up to 40 rounds and stopped by itself after 21, when it had stopped improving on validation.
- **Cut-offs:** each method's cut-off is picked on the validation part, never on the test part.

---

## 5. The results

All four methods on the same 2,085 test ECGs (101 with LVH, 1,984 without).

| Method | LVH caught (of 101) | False alarms (of 1,984) | AUC |
|---|---|---|---|
| Sokolow-Lyon (cut-off tuned to 3.83 mV) | 62 | 90 | 0.918 |
| Cornell (cut-off tuned to 2.78 mV) | 58 | 183 | 0.833 |
| Perceptron | 55 | 51 | 0.932 |
| **CNN** | **72** | **28** | **0.980** |

What this means:

- **The CNN is clearly the best.** It catches the most LVH cases and raises the fewest false alarms.
- **The perceptron is only a little better than the Sokolow-Lyon rule.** It uses the same spike heights, so it has little new information to learn from.
- **The old rules do better here than in textbooks.** At the textbook cut-off of 3.5 mV, Sokolow-Lyon catches 74 of 101 but raises 165 false alarms. The reason is in section 9.
- **The fair way to say it:** when the old rule is only allowed the CNN's 28 false alarms (Sokolow-Lyon at 4.78 mV), it catches 29 cases. The CNN catches 72.

---

## 6. The three parts of the software

| Part | Language | Job |
|---|---|---|
| **Training pipeline** (`training/`) | Python | Prepares data, trains both models, scores everything |
| **Backend** (`backend/`) | Python (FastAPI) | A small server. Send it an ECG, it sends back the two rule results and the two AI scores |
| **Website** (`src/`) | TypeScript (Next.js, React) | Eight pages for uploading an ECG and viewing results |

The eight website pages:

| Page | What you see |
|---|---|
| Dashboard | Overview numbers and charts (demo values) |
| ECG Analysis | Upload an ECG file and run the full check |
| Signal Visualization | The 12-lead ECG drawn on ECG paper |
| Traditional Analysis | The two old rules, with the sums shown |
| AI Screening | Perceptron and CNN scores |
| Model Comparison | The four methods side by side |
| Analysis Reports | A printable report for one ECG |
| Research Information | Background on LVH, the method and the limits |

- **Demo mode:** if the backend is not running, the website still works, but its AI numbers are **made up by a simulator** and marked "simulated". Real numbers appear only when the backend is running and connected.

---

## 7. Every file, explained

### 7.1 Top level

| File | What it is |
|---|---|
| `README.md` | The author's own guide: setup, results, limits |
| `PROJECT_EXPLAINED.md` | This file |
| `config.json` | All settings in one place: folds, CNN size, training rounds, folder names, server port |
| `.env.example` | Sample settings file. Tells the website where the backend is (`http://localhost:8000`) |
| `.gitignore` | List of files Git should not upload (big data, virtual environment) |
| `requirements-vscode.txt` | List of Python libraries to install |
| `setup.ps1` | One-time setup on Windows: makes a Python environment, installs everything |
| `run_training.ps1` | Runs pipeline steps by name (`download`, `cnn`, `all`, ...) |
| `run_backend.ps1` | Starts the backend server on port 8000 |
| `run_frontend.ps1` | Starts the website on port 3000 |
| `package.json` | List of JavaScript libraries and commands for the website |
| `bun.lock` | Exact versions of those libraries |
| `next.config.ts`, `next-env.d.ts`, `tsconfig.json` | Settings for Next.js and TypeScript |
| `tailwind.config.ts`, `postcss.config.mjs` | Settings for the styling tools |
| `eslint.config.mjs` | Settings for the code-style checker |
| `components.json` | Settings for the ready-made button and card kit |
| `Caddyfile` | **Leftover.** Web-server settings from the tool the site was first built in. Not used |
| `SPANDANA_complete.zip` | **Leftover.** A second copy of the whole project. Not needed |

### 7.2 `training/` (the research pipeline)

| File | What it does |
|---|---|
| `config.py` | Reads `config.json` and works out all folder paths |
| `download_dataset.py` | Downloads PTB-XL. Can resume if the download breaks |
| `inspect_dataset.py` | Prints facts about the dataset: rows, missing values, folds |
| `extract_lvh.py` | Reads each doctor label and sorts ECGs into LVH, unsure, not LVH |
| `create_splits.py` | Puts each ECG into train, validation or test, and checks no patient is in two parts |
| `preprocess_ecg.py` | Reads every ECG file and saves them all as one big array (`signals.npy`). Also saves each lead's average and spread, from the training part only |
| `extract_features.py` | Measures the five spike heights and applies both old rules to every ECG |
| `train_perceptron.py` | Trains the perceptron, tries several settings, picks its cut-off |
| `evaluate_perceptron.py` | Scores the perceptron on the test set |
| `cnn_model.py` | The design of the CNN, plus helpers to load it and to show which leads mattered |
| `train_cnn.py` | Trains the CNN, stops early when it stops improving, saves the best version |
| `evaluate_cnn.py` | Picks the CNN's cut-off on validation, then scores it on the test set |
| `evaluate_all.py` | Scores all four methods on the test set and makes the comparison table and charts |
| `metrics.py` | Small helper that works out sensitivity, specificity, AUC and the rest |
| `predict_ecg.py` | Takes **one** ECG and returns both rule results and both AI scores. The backend uses this |
| `tests/test_pipeline.py` | 12 automatic checks on labels, splits, measurements and model loading |
| `__init__.py` | Empty file that marks the folder as a Python package |

### 7.3 `backend/` (the server)

| File | What it does |
|---|---|
| `app/main.py` | Starts the server and allows the website to talk to it |
| `app/config.py` | Server settings and the location of the model files |
| `app/api/routes.py` | The four web addresses the server answers (below) |
| `app/schemas/models.py` | The exact shape of the data the server accepts and returns |
| `app/services/ecg_io.py` | Reads uploaded ECG files (`.csv`, `.txt`, or `.dat` + `.hea`) |
| `app/services/screening.py` | Passes the ECG to `predict_ecg.py` and turns errors into clear messages |
| `app/services/model_status.py` | Reports which model files are present |
| `app/utils/leads.py` | Fixes lead-name spelling (for example `AVR` to `aVR`) |
| `requirements.txt` | Python libraries the backend needs |
| `tests/test_api.py`, `tests/conftest.py` | 12 automatic checks on the server |
| `tests/fixtures/00001_lr.dat`, `.hea` | One real PTB-XL ECG, used by the tests |
| `__init__.py` files | Empty package markers |

The four addresses:

| Address | What it returns |
|---|---|
| `GET /health` | "I am running", and which models are ready |
| `POST /api/v1/screen` | The full result for one ECG |
| `GET /api/v1/models/metrics` | The saved test results, for the comparison page |
| `GET /api/v1/models/status` | Which model files exist |

### 7.4 `backend/models/` (the trained models)

| File | What it is |
|---|---|
| `cnn_best.pt` | The trained CNN (its learned numbers) |
| `cnn_meta.json` | Notes about the CNN: design, cut-off (0.956), validation scores |
| `perceptron_pipeline.joblib` | The trained perceptron with its scaling step |
| `perceptron_meta.json` | Notes about the perceptron: chosen settings, cut-off (0.1745) |
| `preprocessing.json` | Each lead's average and spread, used to put a new ECG on the same scale as the training data |
| `metrics.json` | All test results in one file. The website reads this |

### 7.5 `data/` (tables and results)

| File | What it is |
|---|---|
| `metadata/spandana_lvh_metadata.csv` | All 21,799 ECGs with patient details and the LVH group |
| `metadata/spandana_split_assignments.csv` | Which part (train, validation, test) each ECG went to |
| `metadata/spandana_patient_summary.csv` | One row per patient: how many ECGs, how many with LVH |
| `metadata/feature_rows.csv` | The five spike heights and both rule results for the 20,752 ECGs used |
| `preprocessed/index.csv` | Maps each row of the big signal array to its ECG |
| `cnn_runs/history.json` | The CNN's scores after each training round |
| `cnn_runs/training_history.png` | Those scores as a chart |
| `cnn_runs/latest.pt` | The CNN's most recent saved state, for resuming training |
| `reports/model_comparison.csv` | The final four-method table |
| `reports/cnn_test_metrics.json` | Full CNN test results |
| `reports/perceptron_test_metrics.json` | Full perceptron test results |
| `reports/roc_curves.png`, `pr_curves.png` | Charts comparing the four methods |
| `reports/confusion_matrices.png` | The four 2×2 tables as a picture |
| `reports/comparison_chart.png` | Bar chart of the scores |
| `reports/dataset_inspection.csv` | Count of missing values per column in PTB-XL |
| `reports/label_limitations.md` | Honest notes on what the labels can and cannot tell us |

### 7.6 `src/` (the website)

**Pages and shell**

| File | What it does |
|---|---|
| `app/page.tsx` | The single page that holds everything and switches between the eight views |
| `app/layout.tsx` | Page title, fonts and outer frame |
| `app/globals.css` | Site-wide colours and styles |
| `app/api/route.ts` | **Leftover.** A "Hello, world" test address. Not used |

**The eight views** (`components/views/`)

| File | Page |
|---|---|
| `DashboardView.tsx` | Dashboard |
| `UploadView.tsx` | ECG Analysis: upload, decode, measure, apply rules, ask the backend |
| `VisualizationView.tsx` | Signal Visualization |
| `CriteriaView.tsx` | Traditional Analysis |
| `ScreeningView.tsx` | AI Screening |
| `ComparisonView.tsx` | Model Comparison |
| `ReportsView.tsx` | Analysis Reports |
| `ResearchView.tsx` | Research Information |

**Other components**

| File | What it does |
|---|---|
| `components/layout/Header.tsx` | Top bar. Shows whether the backend is connected |
| `components/layout/Sidebar.tsx` | Left menu |
| `components/layout/Footer.tsx` | Bottom strip with the "not a medical device" notice |
| `components/ecg/EcgGrid.tsx`, `ecg-paper.css` | Draws the 12 leads on pink ECG graph paper |
| `components/shared/AnalysisSelector.tsx` | Drop-down to choose which ECG you are looking at |
| `components/shared/StatCard.tsx` | A small box showing one number |
| `components/shared/badges.tsx` | Labels such as "Demo data" and "Simulated" |
| `components/ui/` (48 files) | A ready-made kit of buttons, cards, tables and so on (shadcn/ui). Not written for this project |

**Logic** (`lib/`, `store/`, `hooks/`)

| File | What it does |
|---|---|
| `lib/api.ts` | Talks to the backend. Returns nothing if the backend is off, so the site falls back to demo mode |
| `lib/ecg/types.ts` | Definitions of the data shapes (lead names, patient, result) |
| `lib/ecg/parsers.ts` | Reads uploaded ECG files inside the browser |
| `lib/ecg/real-signal.ts` | Measures spike heights and heart rate from an uploaded ECG |
| `lib/ecg/criteria.ts` | The two old rules, done in the browser |
| `lib/ecg/waveform.ts` | Draws **fake** ECGs with maths, for the demo examples |
| `lib/demo-data.ts` | The three demo ECGs, the AI **simulator**, and placeholder scores |
| `lib/stats.ts` | Draws a smooth demo curve from one AUC number |
| `lib/nav.ts` | Names and icons for the menu |
| `lib/utils.ts` | A tiny styling helper |
| `lib/db.ts` | **Leftover.** Database connection. Not used |
| `store/analyses.ts` | Remembers your uploaded ECGs in the browser |
| `hooks/use-mobile.ts` | Detects a phone-sized screen |
| `hooks/use-toast.ts` | Pop-up messages |

### 7.7 Other folders

| File | What it is |
|---|---|
| `public/logo.svg`, `public/spandana-icon.svg` | Logo and icon |
| `public/robots.txt` | Note for search engines |
| `scripts/sample-ecg.csv`, `.dat`, `.hea` | A **made-up** sample ECG for trying the upload page |
| `scripts/make-sample-ecg.ts` | Creates that sample |
| `scripts/test-parsers.ts` | Checks that the browser file readers work |
| `scripts/ecg_sanity.ts` | Prints the rule results for the three demo ECGs |
| `scripts/verify_ptbxl_meta.py`, `verify_ptbxl_signal.py`, `check_details.py`, `list_remote_zip.py` | One-off checks the author ran on PTB-XL while building. They point to folders on his machine |
| `scripts/build_spandana_01.py`, `spandana01_cells_a.py`, `spandana01_cells_b.py`, `make_notebook_vscode_ready.py`, `smoke_run_notebook.py`, `smoke_vscode_notebook.py` | **Leftover.** They build and test a notebook that is not in the repo |
| `prisma/schema.prisma`, `db/custom.db` | **Leftover.** An empty database template. Not used |
| `tests/*.sh` (3 files) | **Leftover.** They need a `.zscripts` folder that is not in the repo, so they cannot run |

---

## 8. How to run it

These steps come from the author's README. They have **not** been tested on this computer.

**One-time setup** (in the project folder, in a terminal):

```
uv venv
uv pip install -r requirements-vscode.txt
npm install
```

- You need Python, uv and Node.js installed.
- Or run `.\setup.ps1`, which does the same with pip.

**Start the app** (two terminals):

```
.\run_backend.ps1      # server on http://localhost:8000
.\run_frontend.ps1     # website on http://localhost:3000
```

- The trained models are already in the repo, so the app works without downloading PTB-XL.

**Retrain everything from scratch** (optional, downloads about 1.8 GB and takes a long time):

```
.\run_training.ps1 all
```

---

## 9. Limits you must say out loud

1. **The labels are not the truth about the heart.** "LVH" in PTB-XL means a cardiologist saw LVH on the ECG. It was not confirmed by an echo scan. So the AI is learning to copy how doctors read ECGs.
2. **This also explains why the old rules look good here.** Doctors use spike heights when they decide, so rules based on spike heights agree with them.
3. **The unsure cases were removed.** That makes the exam easier for every method.
4. **Only 101 LVH cases in the test.** The CNN's 71% could really be anywhere from about 62% to 79%.
5. **One dataset, one country, old machines.** It may not work the same elsewhere.
6. **It is a student research project, not a medical device.**

---

## 10. Known problems in this version

Found in a code review on 16 Nov 2026. None is fixed in commit `f013b30`.

| # | Problem | Where | Effect |
|---|---|---|---|
| 1 | Male and female are swapped. PTB-XL uses 0 for male, the code treats 0 as female | `training/extract_lvh.py` | The Cornell rule uses the wrong cut-off for each sex |
| 2 | The "textbook Cornell" test uses one patient's cut-off for everybody | `training/evaluate_all.py` | The textbook Cornell numbers in the README are wrong |
| 3 | The "train" lines on the training chart are meaningless (about 0.50 every round) | `training/train_cnn.py` | Do not show `training_history.png` |
| 4 | The website sends "Male"/"Female", but the server accepts only lowercase | `UploadView.tsx`, line 262 | Uploads silently fall back to **simulated** AI numbers |
| 5 | Dashboard and Reports pages always show made-up scores | `DashboardView.tsx`, `ReportsView.tsx` | Fake numbers on screen even when the backend is on |
| 6 | `run_training.ps1 pipeline` skips the preprocess step | `run_training.ps1` | Fails on a fresh computer. Use `all` |
| 7 | `.gitignore` names the data folder `data/ptb-xl/`, but the real folder is `data/ptbxl` | `.gitignore` | The 1.8 GB dataset could be uploaded to GitHub by mistake |
| 8 | No error ranges, and the CNN training has no fixed random seed | `training/` | Results cannot be reproduced exactly |
| 9 | The website's start command ends with `tee dev.log`, a Linux tool | `package.json`, the `dev` line | `.\run_frontend.ps1` may fail on Windows with "tee is not recognized". Not tested. If it does, run `npx next dev -p 3000` instead |

Problems 1 and 2 only change the textbook Cornell numbers. They do not change the AI results or the main table.

---

## 11. Word list

| Word | Meaning |
|---|---|
| LVH | Thickened wall of the heart's main pumping room |
| ECG | A 10-second recording of the heart's electricity |
| Echo | Ultrasound picture of the heart |
| Lead | One of 12 viewing angles in an ECG |
| QRS, R wave, S wave | The sharp spike in each beat, its upward part, its downward part |
| mV | Millivolt, the unit of spike height |
| Hz | Measurements per second |
| Dataset | A collection of examples |
| Label | The correct answer attached to an example |
| Model | The thing that has learned |
| Training / validation / test | Learning / tuning / final exam |
| Leakage | Cheating by letting the exam contain what was studied |
| Epoch | One full pass through the training examples |
| Weight | A number the model adjusts while learning |
| Perceptron | A single artificial brain cell |
| CNN | A network of stacked pattern-detectors |
| Threshold / cut-off | The line between "LVH" and "not LVH" |
| Backend | The server that does the work |
| Frontend | The website people see |
| API | The set of addresses a program uses to ask the backend for things |
| Repo | A project folder tracked by Git |
