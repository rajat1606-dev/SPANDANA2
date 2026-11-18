/**
 * 12-lead ECG trace renderer. Draws a physiologically-shaped waveform from
 * target QRS voltages; used to display PTB-XL recordings whose raw samples
 * are not bundled. Criteria read the measured voltages, not this drawing.
 *
 * Produces deterministic, physiologically-shaped 10-second recordings:
 * P wave, QRS complex (Q / R / S), T wave and a small U wave are modelled
 * as gaussian components per beat; per-lead amplitude profiles control the
 * morphology so that Sokolow-Lyon and Cornell voltages can be curated for
 * teaching scenarios. NOT real patient data and NOT a clinical signal model.
 */

import {
  LEAD_NAMES,
  type EcgWaveform,
  type LeadAmplitudes,
  type LeadName,
  type LeadTargets,
  type WaveformSpec,
} from "./types";
import { buildRealWaveform } from "./real-signal";

export const SAMPLE_RATE = 500; // Hz
export const DURATION_SEC = 10;

/* ------------------------------------------------------------------ */
/* Deterministic PRNG                                                  */
/* ------------------------------------------------------------------ */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(seedStr: string): () => number {
  const seedFn = xmur3(seedStr);
  let a = seedFn();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Baseline (normal) amplitude profile, mV                             */
/* ------------------------------------------------------------------ */

export const BASE_PROFILE: Record<LeadName, LeadTargets> = {
  I: { r: 0.75, s: 0.1, q: 0.05, p: 0.1, t: 0.28 },
  II: { r: 1.3, s: 0.12, q: 0.07, p: 0.16, t: 0.38 },
  III: { r: 0.55, s: 0.18, q: 0.06, p: 0.08, t: 0.16 },
  aVR: { r: 0.1, s: 0.95, q: 0.02, p: -0.12, t: -0.24 },
  aVL: { r: 0.45, s: 0.15, q: 0.05, p: 0.06, t: 0.16 },
  aVF: { r: 0.95, s: 0.14, q: 0.06, p: 0.12, t: 0.26 },
  V1: { r: 0.25, s: 1.1, q: 0.01, p: 0.05, t: -0.06 },
  V2: { r: 0.55, s: 1.35, q: 0.01, p: 0.06, t: 0.3 },
  V3: { r: 1.05, s: 1.05, q: 0.01, p: 0.08, t: 0.38 },
  V4: { r: 1.75, s: 0.75, q: 0.02, p: 0.1, t: 0.42 },
  V5: { r: 2.0, s: 0.45, q: 0.03, p: 0.09, t: 0.36 },
  V6: { r: 1.55, s: 0.25, q: 0.04, p: 0.08, t: 0.28 },
};

/** Merge per-lead overrides over the baseline profile. */
export function buildProfile(
  overrides: Partial<Record<LeadName, Partial<LeadTargets>>>,
): Record<LeadName, LeadTargets> {
  const out = {} as Record<LeadName, LeadTargets>;
  for (const lead of LEAD_NAMES) {
    out[lead] = { ...BASE_PROFILE[lead], ...(overrides[lead] ?? {}) };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Beat component timings (seconds relative to beat onset)             */
/* ------------------------------------------------------------------ */

const T_P = 0.0;
const W_P = 0.03;
const T_Q = 0.052;
const W_Q = 0.009;
const T_R = 0.075;
const W_R = 0.011;
const T_S = 0.102;
const W_S = 0.013;
const T_T = 0.26;
const W_T = 0.05;
const T_U = 0.44;
const W_U = 0.035;

const gauss = (x: number, center: number, width: number) =>
  Math.exp(-0.5 * Math.pow((x - center) / width, 2));

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

function beatTimes(bpm: number, rng: () => number): number[] {
  const rr = 60 / bpm;
  const times: number[] = [];
  let t = 0.18 + rng() * 0.04;
  while (t < DURATION_SEC - rr * 0.6) {
    times.push(t);
    t += rr * (1 + (rng() - 0.5) * 0.06);
  }
  return times;
}

function leadSamples(
  targets: LeadTargets,
  beats: number[],
  rng: () => number,
  phase: number,
): number[] {
  const n = SAMPLE_RATE * DURATION_SEC;
  const y = new Array<number>(n).fill(0);

  // Slight respiration-locked baseline wander (kept very small so that
  // measured voltages stay within ±0.01 mV of the curated targets).
  const w1 = 0.02 * Math.sin(2 * Math.PI * 0.3 * phase);
  const w2 = 0.012 * Math.cos(2 * Math.PI * 0.17 * phase);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = w1 * Math.sin(2 * Math.PI * 0.3 * t + phase) + w2 * Math.sin(2 * Math.PI * 0.17 * t + phase * 1.7);

    for (const tb of beats) {
      const dt = t - tb;
      if (dt < -0.12 || dt > 0.6) continue;
      v +=
        targets.p * gauss(dt, T_P, W_P) -
        targets.q * gauss(dt, T_Q, W_Q) +
        targets.r * gauss(dt, T_R, W_R) -
        targets.s * gauss(dt, T_S, W_S) +
        targets.t * gauss(dt, T_T, W_T) +
        0.04 * gauss(dt, T_U, W_U);
    }
    y[i] = v + (rng() - 0.5) * 0.012;
  }
  return y;
}

/** Per-beat QRS amplitude measurement relative to the local isoelectric baseline. */
function measureAmplitudes(
  samples: number[],
  beats: number[],
): LeadAmplitudes {
  const rPeaks: number[] = [];
  const sTroughs: number[] = [];

  for (const tb of beats) {
    const baseStart = Math.max(0, Math.round((tb - 0.03) * SAMPLE_RATE));
    const baseEnd = Math.min(samples.length - 1, Math.round((tb - 0.004) * SAMPLE_RATE));
    let baseline = 0;
    for (let i = baseStart; i <= baseEnd; i++) baseline += samples[i];
    baseline /= Math.max(1, baseEnd - baseStart + 1);

    const rStart = Math.round((tb + 0.04) * SAMPLE_RATE);
    const rEnd = Math.min(samples.length - 1, Math.round((tb + 0.13) * SAMPLE_RATE));
    let rMax = -Infinity;
    for (let i = rStart; i <= rEnd; i++) rMax = Math.max(rMax, samples[i]);

    const sStart = Math.round((tb + 0.075) * SAMPLE_RATE);
    const sEnd = Math.min(samples.length - 1, Math.round((tb + 0.18) * SAMPLE_RATE));
    let sMin = Infinity;
    for (let i = sStart; i <= sEnd; i++) sMin = Math.min(sMin, samples[i]);

    if (Number.isFinite(rMax)) rPeaks.push(rMax - baseline);
    if (Number.isFinite(sMin)) sTroughs.push(baseline - sMin);
  }

  const avg = (arr: number[], fallback: number) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;

  return {
    r: Math.max(0, Math.round(avg(rPeaks, 0) * 1000) / 1000),
    s: Math.max(0, Math.round(avg(sTroughs, 0) * 1000) / 1000),
  };
}

/**
 * Generate the runtime waveform from a spec.
 *
 * Two branches:
 *  - `spec.parsed` present → the REAL decoded recording is used as-is
 *    (amplitudes were measured at the full original rate; beats are
 *    re-detected on the stored samples for the display counters).
 *  - otherwise → deterministic renderer driven by the spec’s voltages.
 */
export function generateWaveform(spec: WaveformSpec): EcgWaveform {
  if (spec.parsed) {
    return buildRealWaveform(spec.parsed, spec.bpm);
  }

  const rng = mulberry32(spec.seed);
  const beats = beatTimes(spec.bpm, rng);

  const leads = {} as Record<LeadName, number[]>;
  const amplitudes = {} as Record<LeadName, LeadAmplitudes>;

  LEAD_NAMES.forEach((lead, idx) => {
    // Clone the rng stream so lead order never affects the noise pattern.
    const leadRng = mulberry32(`${spec.seed}::${lead}`);
    leads[lead] = leadSamples(spec.profile[lead], beats, leadRng, idx * 0.9);
    // A rendered trace only approximates the target voltages, so a spec may
    // carry authoritative measured amplitudes (real PTB-XL recordings). Only
    // the component the dataset actually measured is overridden.
    const drawn = measureAmplitudes(leads[lead], beats);
    const real = spec.measured?.[lead];
    amplitudes[lead] = real
      ? { r: real.r ?? drawn.r, s: real.s ?? drawn.s }
      : drawn;
  });

  return {
    sampleRate: SAMPLE_RATE,
    durationSec: DURATION_SEC,
    bpm: spec.bpm,
    beats,
    leads,
    amplitudes,
    hrSource: "config",
  };
}

/** Min–max decimation of a lead signal to a display-friendly point count. */
export function decimateLead(samples: number[], targetPoints: number): number[] {
  if (samples.length <= targetPoints) return samples;
  const bucket = samples.length / targetPoints;
  const out: number[] = [];
  for (let b = 0; b < targetPoints; b++) {
    const start = Math.floor(b * bucket);
    const end = Math.min(samples.length, Math.floor((b + 1) * bucket));
    let minIdx = start;
    let maxIdx = start;
    for (let i = start; i < end; i++) {
      if (samples[i] < samples[minIdx]) minIdx = i;
      if (samples[i] > samples[maxIdx]) maxIdx = i;
    }
    // Preserve temporal order to avoid zig-zag artifacts.
    if (minIdx === maxIdx) {
      out.push(samples[minIdx]);
    } else if (minIdx < maxIdx) {
      out.push(samples[minIdx], samples[maxIdx]);
    } else {
      out.push(samples[maxIdx], samples[minIdx]);
    }
  }
  return out;
}
