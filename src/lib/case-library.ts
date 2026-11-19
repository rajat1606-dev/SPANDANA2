/**
 * SPANDANA case library and analysis assembly.
 *
 * The library holds REAL PTB-XL recordings from the held-out test fold
 * (see src/lib/real-data.ts, generated from the committed research data).
 * Their ages, sexes, cardiologist labels and QRS voltages are the dataset's
 * own measured values, so both voltage criteria are computed from real
 * numbers. The raw 1.8 GB signal archive is not in the repository, so the
 * displayed trace is rendered from those measured voltages — the waveform
 * is an illustration of the morphology, the voltages are real.
 *
 * AI predictions are never produced here. They come only from the FastAPI
 * research backend; until it answers, `predictions` is empty and the UI
 * says so.
 */

import { computeCriteria, criteriaHeadline } from "@/lib/ecg/criteria";
import { buildProfile } from "@/lib/ecg/waveform";
import { generateWaveform } from "@/lib/ecg/waveform";
import { buildParsedSpec } from "@/lib/ecg/real-signal";
import type { ParsedSignal } from "@/lib/ecg/parsers";
import { PTBXL_CASES, type PtbxlCase } from "@/lib/real-data";
import {
  type EcgAnalysis,
  type Interpretation,
  type ModelPrediction,
  type ParsedSpecData,
  type PatientMeta,
  type Sex,
  type WaveformSpec,
} from "@/lib/ecg/types";

/* ------------------------------------------------------------------ */
/* Interpretation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Combine the voltage criteria with the model outputs. With no backend
 * predictions available the verdict rests on the criteria alone, rather
 * than collapsing to "discordant".
 */
export function deriveInterpretation(a: {
  criteria: EcgAnalysis["criteria"];
  predictions: ModelPrediction[];
}): Interpretation {
  const headline = criteriaHeadline(a.criteria);

  // Without model output the verdict rests on the two criteria alone, so a
  // disagreement between them is what "discordant" reports.
  if (a.predictions.length === 0) {
    if (a.criteria.agreement === "both-positive") return "positive";
    if (a.criteria.agreement === "both-negative") return "negative";
    return "discordant";
  }

  const aiPositives = a.predictions.filter((p) => p.positive).length;
  const aiAgreePos = aiPositives === a.predictions.length;
  const aiAgreeNeg = aiPositives === 0;

  if (headline === "positive" && aiAgreePos) return "positive";
  if (headline === "negative" && aiAgreeNeg) return "negative";
  return "discordant";
}

/* ------------------------------------------------------------------ */
/* Analysis assembly                                                   */
/* ------------------------------------------------------------------ */

export interface AssembleInput {
  id: string;
  createdAt: string;
  meta: PatientMeta;
  spec: WaveformSpec;
  notes: string;
  /** Predictions from the backend, when it has already answered. */
  predictions?: ModelPrediction[];
}

export function assembleAnalysis(input: AssembleInput): EcgAnalysis {
  const waveform = generateWaveform(input.spec);
  const criteria = computeCriteria(waveform, input.meta.sex);
  const predictions = input.predictions ?? [];
  return {
    id: input.id,
    createdAt: input.createdAt,
    meta: input.meta,
    spec: input.spec,
    notes: input.notes,
    waveform,
    criteria,
    predictions,
    interpretation: deriveInterpretation({ criteria, predictions }),
    awaitingBackend: predictions.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Real PTB-XL case library                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the display spec for one real recording. The five voltages the
 * criteria depend on are pinned to the dataset's measured values via
 * `measured`; the rest of the trace is rendered so the 12-lead view has
 * something to draw.
 */
function specForCase(c: PtbxlCase): WaveformSpec {
  const lvh = c.label === "LVH_positive";
  return {
    seed: `ptbxl-${c.ecgId}`,
    bpm: 72,
    profile: buildProfile({
      V1: { s: c.sv1 },
      V2: { s: Math.max(0.4, c.sv3 * 0.85) },
      V3: { s: c.sv3, t: lvh ? 0.05 : 0.12 },
      V4: { r: Math.max(0.6, c.rv5 * 0.8), s: Math.max(0.2, c.sv3 * 0.3) },
      V5: { r: c.rv5, t: lvh ? -0.16 : 0.18 },
      V6: { r: c.rv6, t: lvh ? -0.12 : 0.16 },
      aVL: { r: c.ravl, t: lvh ? -0.1 : 0.1 },
      I: { r: Math.max(0.4, c.ravl * 0.9), t: lvh ? -0.08 : 0.12 },
    }),
    // The dataset measured exactly these five components.
    measured: {
      V1: { s: c.sv1 },
      V3: { s: c.sv3 },
      V5: { r: c.rv5 },
      V6: { r: c.rv6 },
      aVL: { r: c.ravl },
    },
  };
}

function notesForCase(c: PtbxlCase): string {
  return (
    `Real PTB-XL recording ${c.ecgId} (recorded ${c.recordingDate}), held-out ` +
    `test fold ${c.stratFold}. Cardiologist SCP statements: ${c.scpCodes}. ` +
    `${c.note} Voltages are the dataset's measured values; the displayed trace ` +
    `is rendered from them because PTB-XL's raw signal archive is not bundled ` +
    `with this repository.`
  );
}

/** The real PTB-XL library shown in the workspace. */
export function createLibraryAnalyses(): EcgAnalysis[] {
  return PTBXL_CASES.map((c) =>
    assembleAnalysis({
      id: `ptbxl-${c.ecgId}`,
      createdAt: new Date(`${c.recordingDate}T12:00:00Z`).toISOString(),
      meta: {
        code: `PTB-XL ${c.ecgId}`,
        age: c.age,
        sex: c.sex,
        source: "ptbxl-library",
        cohortLabel: c.cohortLabel,
        signalOrigin: "reconstructed",
        recording: { sampleRate: c.sampleRate, durationSec: c.durationSec },
      },
      spec: specForCase(c),
      notes: notesForCase(c),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Decoded-file analysis (real uploaded signal)                        */
/* ------------------------------------------------------------------ */

export interface DecodedAnalysisInput {
  fileName: string;
  /** Result of the in-browser decoder (real samples, mV). */
  signal: ParsedSignal;
  sex: Sex;
  age: number;
  code: string;
  /** Index to stagger createdAt between multiple uploads. */
  order?: number;
  /** Pre-computed parsed spec (skips a redundant re-measurement). */
  parsed?: ParsedSpecData;
}

/**
 * Assemble an analysis whose waveform is the REAL signal decoded from the
 * uploaded file. Criteria are computed from the measured voltages; AI
 * predictions stay empty until the FastAPI backend scores the recording.
 */
export function createDecodedAnalysis(input: DecodedAnalysisInput): EcgAnalysis {
  const parsed = input.parsed ?? buildParsedSpec(input.signal);

  const spec: WaveformSpec = {
    seed: `decoded::${input.fileName}::${input.code}`,
    bpm: parsed.bpm,
    profile: buildProfile({}), // unused for parsed specs; keeps the shape uniform
    parsed,
  };

  const offset = (input.order ?? 0) * 2_000;
  return assembleAnalysis({
    id: `upl-${crypto.randomUUID()}`,
    createdAt: new Date(Date.now() - offset).toISOString(),
    meta: {
      code: input.code,
      age: input.age,
      sex: input.sex,
      source: "file-upload",
      sourceFile: input.fileName,
      signalOrigin: "decoded-file",
      recording: { sampleRate: parsed.sampleRate, durationSec: parsed.durationSec },
      cohortLabel: "borderline",
    },
    spec,
    notes:
      `Signal decoded in-browser from "${input.fileName}" (${parsed.detail}). ` +
      "Voltage criteria were measured from the decoded samples. AI results " +
      "appear once the FastAPI research backend has scored the recording.",
  });
}
