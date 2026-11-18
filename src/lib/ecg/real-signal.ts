/**
 * SPANDANA – AI Cardiac Intelligence · real-signal measurement.
 *
 * Simple, transparent signal-processing primitives applied to DECODED
 * (real) recordings. Every function here is deterministic and documented
 * so the UI can describe exactly what was computed:
 *
 *  - Amplitudes: per-lead median of the whole trace is used as the
 *    isoelectric baseline; R = max(signal − baseline); S = max(0, baseline − min).
 *    (Global measurement — deliberately simple, never presented as clinical.)
 *  - Heart rate: fixed-threshold R-peak detector (0.4 × peak deviation,
 *    250 ms refractory) on lead II; reported only when ≥ 3 beats are found.
 *  - Storage: leads are decimated to ≤ 250 Hz for localStorage persistence;
 *    criteria amplitudes are measured at the FULL original rate and stored
 *    alongside so results never drift between sessions.
 *
 * This module never produces model predictions — AI outputs come solely
 * from the FastAPI backend.
 */

import type { EcgWaveform, LeadAmplitudes, LeadName, ParsedSpecData } from "./types";
import { LEAD_NAMES } from "./types";
import type { ParsedSignal } from "./parsers";

export const STORAGE_RATE_LIMIT = 250; // Hz

/* ------------------------------------------------------------------ */
/* Baseline + amplitudes                                               */
/* ------------------------------------------------------------------ */

export function medianOf(values: number[]): number {
  const arr = [...values].sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const mid = arr.length >> 1;
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Global per-lead QRS amplitude measurement relative to the median
 * baseline. Honest about its simplicity — the UI labels the method.
 */
export function measureRealAmplitudes(
  leads: Record<LeadName, number[]>,
): Record<LeadName, LeadAmplitudes> {
  const out = {} as Record<LeadName, LeadAmplitudes>;
  for (const lead of LEAD_NAMES) {
    const samples = leads[lead] ?? [];
    if (samples.length === 0) {
      out[lead] = { r: 0, s: 0 };
      continue;
    }
    const baseline = medianOf(samples);
    let max = -Infinity;
    let min = Infinity;
    for (const v of samples) {
      if (v > max) max = v;
      if (v < min) min = v;
    }
    out[lead] = {
      r: Math.max(0, round3(max - baseline)),
      s: Math.max(0, round3(baseline - min)),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* R-peak detection (fixed threshold, refractory window)               */
/* ------------------------------------------------------------------ */

/**
 * Detect R-peak times (seconds) on a single lead. Returns an empty array
 * when the signal is too flat or too few peaks are found — the caller
 * then reports "heart rate unavailable" instead of inventing a value.
 */
export function detectRPeaks(samples: number[], sampleRate: number): number[] {
  if (samples.length < sampleRate * 3) return [];
  const baseline = medianOf(samples);
  let peak = 0;
  for (const v of samples) {
    const a = Math.abs(v - baseline);
    if (a > peak) peak = a;
  }
  if (peak < 0.3) return []; // < 0.3 mV deviation — not detectable reliably

  const threshold = 0.4 * peak;
  const refractory = Math.round(0.25 * sampleRate);
  const search = Math.round(0.15 * sampleRate);

  const peaks: number[] = [];
  let i = 0;
  while (i < samples.length) {
    if (samples[i] - baseline > threshold) {
      // Local maximum within the next 150 ms window.
      let bestIdx = i;
      const end = Math.min(samples.length, i + search);
      for (let j = i; j < end; j++) {
        if (samples[j] > samples[bestIdx]) bestIdx = j;
      }
      peaks.push(bestIdx / sampleRate);
      i = bestIdx + refractory;
    } else {
      i++;
    }
  }
  return peaks.length >= 3 ? peaks : [];
}

export function bpmFromPeaks(peaks: number[]): number | null {
  if (peaks.length < 3) return null;
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  const meanRr = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (meanRr < 0.3 || meanRr > 2) return null; // 30–200 bpm sanity window
  const bpm = Math.round(60 / meanRr);
  return bpm >= 30 && bpm <= 200 ? bpm : null;
}

/* ------------------------------------------------------------------ */
/* Storage down-sampling + parsed spec assembly                        */
/* ------------------------------------------------------------------ */

/** Decimate a lead to ≤ limit Hz, rounding values to µV precision. */
function downsampleLead(samples: number[], rate: number, limit: number): number[] {
  const factor = Math.max(1, Math.ceil(rate / limit));
  if (factor === 1) return samples.map((v) => Math.round(v * 100000) / 100000);
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += factor) {
    out.push(Math.round(samples[i] * 100000) / 100000);
  }
  return out;
}

/**
 * Build the persistable parsed-spec payload from a decoded signal:
 * HR is detected at full rate, amplitudes are measured at full rate,
 * and leads are decimated only for storage/display size.
 */
export function buildParsedSpec(signal: ParsedSignal): ParsedSpecData {
  const rhythmLead = signal.leads["II"]?.length ? signal.leads["II"] : signal.leads["I"];
  const peaks = detectRPeaks(rhythmLead, signal.sampleRate);
  const bpm = bpmFromPeaks(peaks);

  const leads = {} as Record<LeadName, number[]>;
  for (const lead of LEAD_NAMES) {
    leads[lead] = downsampleLead(signal.leads[lead], signal.sampleRate, STORAGE_RATE_LIMIT);
  }

  return {
    kind: signal.kind,
    sampleRate: signal.sampleRate,
    durationSec: signal.durationSec,
    leads,
    amplitudes: measureRealAmplitudes(signal.leads),
    bpm: bpm ?? 0,
    hrSource: bpm !== null ? "detected" : "unavailable",
    detail: signal.detail,
    warnings: signal.warnings,
  };
}

/** Rebuild a runtime waveform from a persisted parsed spec. */
export function buildRealWaveform(
  parsed: ParsedSpecData,
  bpm: number,
): EcgWaveform {
  const rhythmLead = parsed.leads["II"]?.length ? parsed.leads["II"] : parsed.leads["I"];
  return {
    sampleRate: parsed.sampleRate,
    durationSec: parsed.durationSec,
    bpm,
    beats: detectRPeaks(rhythmLead, parsed.sampleRate),
    leads: parsed.leads,
    amplitudes: parsed.amplitudes,
    hrSource: parsed.hrSource,
  };
}
