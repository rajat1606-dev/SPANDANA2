/**
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
  {
    ecgId: 9869,
    age: 67,
    sex: "Male",
    label: "LVH_positive",
    cohortLabel: "lvh-positive",
    stratFold: 10,
    recordingDate: "1993-02-28",
    scpCodes: "{'1AVB': 100.0, 'LVH': 100.0, 'ISC_': 100.0, 'SR': 0.0}",
    sv1: 2.591,
    rv5: 5.422,
    rv6: 2.906,
    ravl: 1.789,
    sv3: 3.236,
    sokolowLyonSum: 8.013,
    cornellSum: 5.025,
    cornellThreshold: 2.8,
    sokolowLyonPositive: true,
    cornellPositive: true,
    note:
      "Concordant positive: both voltage criteria exceed threshold in a cardiologist-confirmed LVH recording (SCP LVH 100%, with 1AVB and ISC_).",
  },
  {
    ecgId: 8963,
    age: 71,
    sex: "Female",
    label: "control",
    cohortLabel: "lvh-negative",
    stratFold: 10,
    recordingDate: "1992-09-11",
    scpCodes: "{'NORM': 100.0, 'SR': 0.0}",
    sv1: 0.21,
    rv5: 0.879,
    rv6: 0.706,
    ravl: 0.335,
    sv3: 0.367,
    sokolowLyonSum: 1.089,
    cornellSum: 0.702,
    cornellThreshold: 2.0,
    sokolowLyonPositive: false,
    cornellPositive: false,
    note:
      "Clear negative: a recording reported as fully normal (SCP NORM 100%); both criteria sit far below threshold.",
  },
  {
    ecgId: 21325,
    age: 83,
    sex: "Male",
    label: "LVH_positive",
    cohortLabel: "lvh-positive",
    stratFold: 10,
    recordingDate: "2000-09-04",
    scpCodes: "{'LAFB': 100.0, 'LVH': 100.0, 'STACH': 0.0}",
    sv1: 1.882,
    rv5: 0.775,
    rv6: 0.4545,
    ravl: 1.4185,
    sv3: 5.0535,
    sokolowLyonSum: 2.657,
    cornellSum: 6.472,
    cornellThreshold: 2.8,
    sokolowLyonPositive: false,
    cornellPositive: true,
    note:
      "Discordant, and the clinically interesting case: Cornell is positive but Sokolow-Lyon misses this cardiologist-confirmed LVH recording (SCP LVH 100%, with LAFB).",
  },
];

/** Real cohort counts from the committed label/split tables. */
export const DATASET_STATS = {
  dataset: "PTB-XL v1.0.3, 100 Hz",
  generated: "2026-11-15T09:34:48",
  testSplit: "strat_fold 10 (patient-wise, untouched by training/tuning)",
  totalRecordings: 21799,
  excludedLowCertainty: 1047,
  totalUsed: 20752,
  train: { total: 16597, lvh: 887 },
  val: { total: 2070, lvh: 97 },
  test: { total: 2085, lvh: 101, control: 1984 },
} as const;

/** CNN headline performance on the held-out test fold. */
export const CNN_HEADLINE = {
  caught: 72,
  ofPositives: 101,
  falseAlarms: 28,
  ofControls: 1984,
  rocAuc: 0.9802,
} as const;

export interface CnnEpoch {
  epoch: number;
  loss: number;
  valLoss: number;
  auprc: number;
  valAuprc: number;
  auroc: number;
  valAuroc: number;
}

/** Real per-epoch CNN training history (early-stopped after 21 epochs). */
export const CNN_TRAINING_HISTORY: CnnEpoch[] = [
  { epoch: 1, loss: 0.65939, valLoss: 0.1167, auprc: 0.05353, valAuprc: 0.6076, auroc: 0.50269, valAuroc: 0.96179 },
  { epoch: 2, loss: 0.46243, valLoss: 0.24062, auprc: 0.05253, valAuprc: 0.5986, auroc: 0.50191, valAuroc: 0.96704 },
  { epoch: 3, loss: 0.39637, valLoss: 0.1354, auprc: 0.05649, valAuprc: 0.67496, auroc: 0.49095, valAuroc: 0.96921 },
  { epoch: 4, loss: 0.39434, valLoss: 0.19804, auprc: 0.05555, valAuprc: 0.74008, auroc: 0.4986, valAuroc: 0.97587 },
  { epoch: 5, loss: 0.37915, valLoss: 0.21112, auprc: 0.05162, valAuprc: 0.73669, auroc: 0.49813, valAuroc: 0.97675 },
  { epoch: 6, loss: 0.36666, valLoss: 0.28496, auprc: 0.0537, valAuprc: 0.74731, auroc: 0.51503, valAuroc: 0.97676 },
  { epoch: 7, loss: 0.36736, valLoss: 0.12611, auprc: 0.0539, valAuprc: 0.69318, auroc: 0.49238, valAuroc: 0.9729 },
  { epoch: 8, loss: 0.35483, valLoss: 0.11606, auprc: 0.05325, valAuprc: 0.68831, auroc: 0.51411, valAuroc: 0.97097 },
  { epoch: 9, loss: 0.35122, valLoss: 0.13179, auprc: 0.0518, valAuprc: 0.74115, auroc: 0.49902, valAuroc: 0.9734 },
  { epoch: 10, loss: 0.32288, valLoss: 0.21646, auprc: 0.05529, valAuprc: 0.76316, auroc: 0.4957, valAuroc: 0.97531 },
  { epoch: 11, loss: 0.29332, valLoss: 0.13882, auprc: 0.05345, valAuprc: 0.75128, auroc: 0.49009, valAuroc: 0.97513 },
  { epoch: 12, loss: 0.29419, valLoss: 0.10542, auprc: 0.05517, valAuprc: 0.75997, auroc: 0.5066, valAuroc: 0.97408 },
  { epoch: 13, loss: 0.27117, valLoss: 0.16204, auprc: 0.05318, valAuprc: 0.76723, auroc: 0.50527, valAuroc: 0.97531 },
  { epoch: 14, loss: 0.27179, valLoss: 0.10268, auprc: 0.05364, valAuprc: 0.75871, auroc: 0.49218, valAuroc: 0.97516 },
  { epoch: 15, loss: 0.29245, valLoss: 0.23067, auprc: 0.05449, valAuprc: 0.7716, auroc: 0.52125, valAuroc: 0.97335 },
  { epoch: 16, loss: 0.27013, valLoss: 0.1478, auprc: 0.0557, valAuprc: 0.75507, auroc: 0.50235, valAuroc: 0.97119 },
  { epoch: 17, loss: 0.26765, valLoss: 0.09291, auprc: 0.0531, valAuprc: 0.76795, auroc: 0.50858, valAuroc: 0.96994 },
  { epoch: 18, loss: 0.25446, valLoss: 0.15209, auprc: 0.05768, valAuprc: 0.74459, auroc: 0.50326, valAuroc: 0.97284 },
  { epoch: 19, loss: 0.2337, valLoss: 0.12676, auprc: 0.05451, valAuprc: 0.76183, auroc: 0.50749, valAuroc: 0.97128 },
  { epoch: 20, loss: 0.20793, valLoss: 0.15348, auprc: 0.05474, valAuprc: 0.75552, auroc: 0.49134, valAuroc: 0.97186 },
  { epoch: 21, loss: 0.21437, valLoss: 0.12922, auprc: 0.05372, valAuprc: 0.76559, auroc: 0.50147, valAuroc: 0.97163 },
];

/**
 * Measured test-set metrics (PTB-XL strat_fold 10), copied from
 * backend/models/metrics.json. Thresholds were tuned on validation fold 9.
 */
export const MODEL_METRICS = [
  {
    model: "Sokolow–Lyon",
    family: "criterion" as const,
    accuracy: 0.9381,
    precision: 0.4079,
    sensitivity: 0.6139,
    specificity: 0.9546,
    f1: 0.4901,
    rocAuc: 0.9181,
    prAuc: 0.4384,
  },
  {
    model: "Cornell",
    family: "criterion" as const,
    accuracy: 0.8916,
    precision: 0.2407,
    sensitivity: 0.5743,
    specificity: 0.9078,
    f1: 0.3392,
    rocAuc: 0.833,
    prAuc: 0.2402,
  },
  {
    model: "Perceptron",
    family: "ml" as const,
    accuracy: 0.9535,
    precision: 0.5189,
    sensitivity: 0.5446,
    specificity: 0.9743,
    f1: 0.5314,
    rocAuc: 0.9322,
    prAuc: 0.5174,
  },
  {
    model: "CNN",
    family: "ml" as const,
    accuracy: 0.9727,
    precision: 0.72,
    sensitivity: 0.7129,
    specificity: 0.9859,
    f1: 0.7164,
    rocAuc: 0.9802,
    prAuc: 0.7813,
  },
];
