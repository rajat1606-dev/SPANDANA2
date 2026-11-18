# -*- coding: utf-8 -*-
"""Generate src/lib/real-data.ts from the committed SPANDANA research artefacts.

Every value written here is read from a file in the repository:
  data/metadata/feature_rows.csv         - per-recording measured voltages
  data/metadata/spandana_lvh_metadata.csv- PTB-XL metadata (SCP codes, dates)
  data/cnn_runs/history.json             - real CNN training history
  backend/models/metrics.json            - real test-set metrics

IMPORTANT: the committed CSVs were produced before the sex-coding fix
(commit "Fix reversed sex coding"), which mapped 0->female, 1->male. The
correct PTB-XL coding is 0=male, 1=female, so every stored sex string is
inverted and is flipped here. Verified empirically: the stored "female"
share is 52.1%, matching PTB-XL's published ~52% MALE share.
"""
import csv, io, json, os, collections

ROOT = os.getcwd()
P = lambda *a: os.path.join(ROOT, *a)

FLIP = {"male": "Female", "female": "Male"}   # flip + title-case for the Sex type
CORNELL_TH = {"Male": 2.8, "Female": 2.0}
SL_TH = 3.5

CASE_IDS = ["9869", "8963", "21325"]
CASE_NOTES = {
    "9869": "Concordant positive: both voltage criteria exceed threshold in a cardiologist-confirmed LVH recording (SCP LVH 100%, with 1AVB and ISC_).",
    "8963": "Clear negative: a recording reported as fully normal (SCP NORM 100%); both criteria sit far below threshold.",
    "21325": "Discordant, and the clinically interesting case: Cornell is positive but Sokolow-Lyon misses this cardiologist-confirmed LVH recording (SCP LVH 100%, with LAFB).",
}
COHORT_LABEL = {"LVH_positive": "lvh-positive", "control": "lvh-negative"}

feat = {r["ecg_id"]: r for r in csv.DictReader(io.open(P("data/metadata/feature_rows.csv"), encoding="utf-8"))}
meta = {r["ecg_id"]: r for r in csv.DictReader(io.open(P("data/metadata/spandana_lvh_metadata.csv"), encoding="utf-8"))}

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')

def num(x, nd=4):
    return round(float(x), nd)

cases = []
for eid in CASE_IDS:
    r, m = feat[eid], meta[eid]
    sex = FLIP[r["sex"]]
    th = CORNELL_TH[sex]
    sl = num(r["sokolow_lyon_sum"], 3)
    co = num(r["cornell_sum"], 3)
    cases.append(dict(
        ecgId=int(eid), age=int(float(r["age"])), sex=sex,
        label=r["label"], cohortLabel=COHORT_LABEL[r["label"]],
        stratFold=int(r["strat_fold"]),
        recordingDate=m.get("recording_date", "")[:10],
        scpCodes=m.get("scp_codes", ""),
        sv1=num(r["sv1"]), rv5=num(r["rv5"]), rv6=num(r["rv6"]),
        ravl=num(r["ravl"]), sv3=num(r["sv3"]),
        sokolowLyonSum=sl, cornellSum=co, cornellThreshold=th,
        sokolowLyonPositive=sl >= SL_TH, cornellPositive=co >= th,
        note=CASE_NOTES[eid],
    ))

# ---- split statistics -------------------------------------------------
rows = list(csv.DictReader(io.open(P("data/metadata/feature_rows.csv"), encoding="utf-8")))
by = collections.Counter((r["split"], r["label"]) for r in rows)
def split_stat(s):
    lv = by[(s, "LVH_positive")]; ct = by[(s, "control")]
    return dict(total=lv + ct, lvh=lv, control=ct)
splits = {s: split_stat(s) for s in ("train", "val", "test")}
all_lab = collections.Counter(r["label"] for r in csv.DictReader(io.open(P("data/metadata/spandana_lvh_metadata.csv"), encoding="utf-8")))

# ---- CNN training history --------------------------------------------
h = json.load(io.open(P("data/cnn_runs/history.json"), encoding="utf-8"))
hist = [dict(epoch=h["epoch"][i], loss=round(h["loss"][i], 5), valLoss=round(h["val_loss"][i], 5),
             auprc=round(h["auprc"][i], 5), valAuprc=round(h["val_auprc"][i], 5),
             auroc=round(h["auroc"][i], 5), valAuroc=round(h["val_auroc"][i], 5))
        for i in range(len(h["epoch"]))]

# ---- metrics ----------------------------------------------------------
mj = json.load(io.open(P("backend/models/metrics.json"), encoding="utf-8"))
metrics = [dict(model=m["name"], family=m["family"], accuracy=m["accuracy"], precision=m["precision"],
                sensitivity=m["sensitivity"], specificity=m["specificity"], f1=m["f1"],
                rocAuc=m["roc_auc"], prAuc=m.get("pr_auc"), threshold=m["threshold"])
           for m in mj["metrics"]]

cnn = next(m for m in mj["metrics"] if m["method"] == "cnn")
test_n = splits["test"]["total"]; test_lvh = splits["test"]["lvh"]
caught = int(round(cnn["sensitivity"] * test_lvh))
false_alarms = int(round((1 - cnn["specificity"]) * splits["test"]["control"]))

out = io.StringIO()
w = out.write
w('''/**
 * REAL SPANDANA data — generated from the committed research artefacts by
 * scripts/gen_real_data.py. Do not hand-edit; regenerate after re-running
 * the training pipeline.
 *
 * Sources:
 *   data/metadata/feature_rows.csv          measured voltages per recording
 *   data/metadata/spandana_lvh_metadata.csv PTB-XL metadata (SCP, dates)
 *   data/cnn_runs/history.json              CNN training history
 *   backend/models/metrics.json             test-set metrics (strat_fold 10)
 *
 * Sex correction: the committed CSVs were written before the sex-coding fix
 * and use PTB-XL's mapping inverted (0 -> female). The correct coding is
 * 0 = male, 1 = female, so every sex below is flipped from the stored value.
 * Confirmed empirically: the stored "female" share is 52.1%, which matches
 * PTB-XL's published ~52% MALE share.
 */

import type { CohortLabel, Sex } from "@/lib/ecg/types";

export interface PtbxlCase {
  ecgId: number;
  age: number;
  sex: Sex;
  /** Cardiologist SCP label from PTB-XL. */
  label: "LVH_positive" | "control";
  cohortLabel: CohortLabel;
  stratFold: number;
  recordingDate: string;
  scpCodes: string;
  /** Measured QRS voltages (mV) used by both voltage criteria. */
  sv1: number;
  rv5: number;
  rv6: number;
  ravl: number;
  sv3: number;
  sokolowLyonSum: number;
  cornellSum: number;
  cornellThreshold: number;
  sokolowLyonPositive: boolean;
  cornellPositive: boolean;
  note: string;
}

/**
 * Three real PTB-XL recordings from the held-out test fold (strat_fold 10),
 * chosen to cover a concordant positive, a clear negative and a discordant
 * case. Voltages, ages, sexes and labels are the measured/recorded values.
 */
export const PTBXL_CASES: PtbxlCase[] = [
''')
for c in cases:
    w("  {\n")
    w('    ecgId: %d,\n' % c["ecgId"])
    w('    age: %d,\n' % c["age"])
    w('    sex: "%s",\n' % c["sex"])
    w('    label: "%s",\n' % c["label"])
    w('    cohortLabel: "%s",\n' % c["cohortLabel"])
    w('    stratFold: %d,\n' % c["stratFold"])
    w('    recordingDate: "%s",\n' % c["recordingDate"])
    w('    scpCodes: "%s",\n' % esc(c["scpCodes"]))
    for k in ("sv1", "rv5", "rv6", "ravl", "sv3"):
        w('    %s: %s,\n' % (k, c[k]))
    w('    sokolowLyonSum: %s,\n' % c["sokolowLyonSum"])
    w('    cornellSum: %s,\n' % c["cornellSum"])
    w('    cornellThreshold: %s,\n' % c["cornellThreshold"])
    w('    sokolowLyonPositive: %s,\n' % ("true" if c["sokolowLyonPositive"] else "false"))
    w('    cornellPositive: %s,\n' % ("true" if c["cornellPositive"] else "false"))
    w('    note:\n      "%s",\n' % esc(c["note"]))
    w("  },\n")
w("];\n\n")

w('''/** Real cohort counts from the committed label/split tables. */
export const DATASET_STATS = {
  dataset: "%s",
  generated: "%s",
  testSplit: "%s",
  totalRecordings: %d,
  excludedLowCertainty: %d,
  totalUsed: %d,
  train: { total: %d, lvh: %d },
  val: { total: %d, lvh: %d },
  test: { total: %d, lvh: %d, control: %d },
} as const;

/** CNN headline performance on the held-out test fold. */
export const CNN_HEADLINE = {
  caught: %d,
  ofPositives: %d,
  falseAlarms: %d,
  ofControls: %d,
  rocAuc: %s,
} as const;

''' % (mj["dataset"], mj["generated"], mj["test_split"],
       sum(all_lab.values()), all_lab["LVH_low_certainty"], len(rows),
       splits["train"]["total"], splits["train"]["lvh"],
       splits["val"]["total"], splits["val"]["lvh"],
       splits["test"]["total"], splits["test"]["lvh"], splits["test"]["control"],
       caught, test_lvh, false_alarms, splits["test"]["control"], cnn["roc_auc"]))

w('''export interface CnnEpoch {
  epoch: number;
  loss: number;
  valLoss: number;
  auprc: number;
  valAuprc: number;
  auroc: number;
  valAuroc: number;
}

/** Real per-epoch CNN training history (early-stopped after %d epochs). */
export const CNN_TRAINING_HISTORY: CnnEpoch[] = [
''' % len(hist))
for e in hist:
    w('  { epoch: %d, loss: %s, valLoss: %s, auprc: %s, valAuprc: %s, auroc: %s, valAuroc: %s },\n'
      % (e["epoch"], e["loss"], e["valLoss"], e["auprc"], e["valAuprc"], e["auroc"], e["valAuroc"]))
w("];\n\n")

w('''/**
 * Measured test-set metrics (PTB-XL strat_fold 10), copied from
 * backend/models/metrics.json. Thresholds were tuned on validation fold 9.
 */
export const MODEL_METRICS = [
''')
for m in metrics:
    w("  {\n")
    w('    model: "%s",\n' % esc(m["model"]))
    w('    family: "%s" as const,\n' % m["family"])
    for k in ("accuracy", "precision", "sensitivity", "specificity", "f1", "rocAuc"):
        w('    %s: %s,\n' % (k, m[k]))
    if m["prAuc"] is not None:
        w('    prAuc: %s,\n' % m["prAuc"])
    w("  },\n")
w("];\n")

io.open(P("src/lib/real-data.ts"), "w", encoding="utf-8", newline="\n").write(out.getvalue())
print("wrote src/lib/real-data.ts (%d bytes)" % len(out.getvalue()))
print("cases:", ", ".join("ecg %d %s %d %s" % (c["ecgId"], c["sex"], c["age"], c["label"]) for c in cases))
print("CNN headline: %d/%d caught, %d false alarms, AUC %s" % (caught, test_lvh, false_alarms, cnn["roc_auc"]))
