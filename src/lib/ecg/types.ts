/**
 * SPANDANA – AI Cardiac Intelligence
 * Core ECG domain types.
 *
 * Waveform traces are either decoded from an uploaded recording, or
 * rendered from the measured voltages of a real PTB-XL recording. AI
 * predictions are only ever produced by the FastAPI research backend.
 */

export const LEAD_NAMES = [
  "I",
  "II",
  "III",
  "aVR",
  "aVL",
  "aVF",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
] as const;

export type LeadName = (typeof LEAD_NAMES)[number];

/** Limb + precordial lead grouping for the classic 12-lead layout. */
export const LEAD_GROUPS: { name: string; leads: LeadName[] }[] = [
  { name: "Limb leads", leads: ["I", "II", "III"] },
  { name: "Augmented limb leads", leads: ["aVR", "aVL", "aVF"] },
  { name: "Precordial leads V1–V3", leads: ["V1", "V2", "V3"] },
  { name: "Precordial leads V4–V6", leads: ["V4", "V5", "V6"] },
];

/** Target deflection amplitudes (mV) used by the waveform renderer. */
export interface LeadTargets {
  /** R-peak amplitude (positive deflection, mV). */
  r: number;
  /** S-wave depth (positive magnitude, mV). */
  s: number;
  /** Q-wave depth (positive magnitude, mV). */
  q: number;
  /** P-wave amplitude (can be negative for aVR, mV). */
  p: number;
  /** T-wave amplitude (negative in strain patterns, mV). */
  t: number;
}

/**
 * Persistable payload of a DECODED (real) recording. Leads are decimated
 * to ≤ 250 Hz for localStorage; amplitudes are measured at the full
 * original rate and stored so criteria never drift between sessions.
 */
export interface ParsedSpecData {
  kind: "csv" | "dat" | "dat+hea";
  sampleRate: number;
  durationSec: number;
  /** All 12 leads in mV, decimated for storage. */
  leads: Record<LeadName, number[]>;
  /** Amplitudes measured at the full original rate. */
  amplitudes: Record<LeadName, LeadAmplitudes>;
  /** Detected heart rate in bpm (0 = not reliably detectable). */
  bpm: number;
  hrSource: "detected" | "unavailable";
  /** Parse report + decoder assumptions, shown verbatim in the UI. */
  detail: string;
  warnings: string[];
}

/**
 * Deterministic specification from which a 10-second 12-lead waveform
 * can be regenerated (stored instead of raw samples to keep state light).
 * When `parsed` is present the waveform is the REAL decoded signal
 * instead of the rendered output.
 */
export interface WaveformSpec {
  seed: string;
  /** Heart rate: configured for rendered specs, detected for parsed ones (0 = unavailable). */
  bpm: number;
  profile: Record<LeadName, LeadTargets>;
  parsed?: ParsedSpecData;
  /**
   * Authoritative per-lead amplitudes that override whatever is measured
   * from a rendered trace. Used by the real PTB-XL case library so the
   * criteria are computed from the dataset's own measured voltages rather
   * than from the drawing, which only approximates the morphology.
   */
  measured?: Partial<Record<LeadName, Partial<LeadAmplitudes>>>;
}

/** Measured QRS amplitudes for one lead (mV, S given as positive magnitude). */
export interface LeadAmplitudes {
  r: number;
  s: number;
}

export interface EcgWaveform {
  sampleRate: number;
  durationSec: number;
  bpm: number;
  /** Beat onset times (seconds) — rendered grid or detected R peaks. */
  beats: number[];
  leads: Record<LeadName, number[]>;
  /** Amplitudes measured from the signal (mV). */
  amplitudes: Record<LeadName, LeadAmplitudes>;
  /** Where the displayed heart rate comes from ("config" = nominal, not detected). */
  hrSource?: "config" | "detected" | "unavailable";
}

export type Sex = "Male" | "Female";

export type AnalysisSource = "ptbxl-library" | "file-upload";

/**
 * Provenance of the displayed waveform.
 *  - "decoded-file"  : real samples parsed from an uploaded recording
 *  - "reconstructed" : real PTB-XL measured voltages, trace rendered for
 *                      display because the raw signal is not in the repo
 */
export type SignalOrigin = "decoded-file" | "reconstructed";

/** Cardiologist SCP outcome for a library recording. */
export type CohortLabel = "lvh-positive" | "lvh-negative" | "borderline";

export interface PatientMeta {
  code: string;
  age: number;
  sex: Sex;
  source: AnalysisSource;
  sourceFile?: string;
  /** Cardiologist SCP outcome for a library recording (not echo-confirmed). */
  cohortLabel: CohortLabel;
  /** "decoded-file" = waveform parsed from the uploaded recording in-browser. Optional for pre-v2 persisted analyses. */
  signalOrigin?: SignalOrigin;
}

export interface SokolowLyonResult {
  /** |S| in V1 (mV). */
  sv1: number;
  /** max(R in V5, R in V6) (mV). */
  rv56: number;
  /** SV1 + RV5/V6 (mV). */
  sum: number;
  threshold: number;
  positive: boolean;
  reference: string;
}

export interface CornellResult {
  /** R in aVL (mV). */
  ravl: number;
  /** |S| in V3 (mV). */
  sv3: number;
  sum: number;
  threshold: number;
  positive: boolean;
  reference: string;
}

export interface CriteriaResult {
  sokolowLyon: SokolowLyonResult;
  cornell: CornellResult;
  /** Both criteria positive → concordant positive, etc. */
  agreement: "both-positive" | "both-negative" | "discordant";
}

export type ModelId = "perceptron" | "cnn";

export interface ModelPrediction {
  model: ModelId;
  /** LVH probability in [0,1], from the FastAPI research backend. */
  probability: number;
  positive: boolean;
  /** Decision threshold used (tuned on validation fold 9). */
  threshold: number;
  latencyMs: number;
  /** Top contributing features, when the backend reports them. */
  contributions: { feature: string; weight: number; value: number }[];
}

export type Interpretation = "positive" | "negative" | "discordant";

export interface EcgAnalysis {
  id: string;
  createdAt: string;
  meta: PatientMeta;
  /** Deterministic spec — the full waveform is regenerated from this. */
  spec: WaveformSpec;
  /** Runtime waveform (regenerated from spec; not persisted). */
  waveform: EcgWaveform;
  criteria: CriteriaResult;
  /** Empty until the FastAPI backend returns real inference. */
  predictions: ModelPrediction[];
  interpretation: Interpretation;
  notes: string;
  /** TRUE while no backend model has scored this recording. */
  awaitingBackend: boolean;
}

/** Public performance metrics for the model comparison module. */
export interface ModelMetrics {
  model: string;
  family: "criterion" | "ml";
  accuracy: number;
  precision: number;
  sensitivity: number;
  specificity: number;
  f1: number;
  rocAuc: number;
}
