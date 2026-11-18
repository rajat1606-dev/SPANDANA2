/**
 * SPANDANA – AI Cardiac Intelligence · real ECG file decoders.
 *
 * This module performs ACTUAL, TRANSPARENT parsing of uploaded recording
 * files in the browser — no synthetic substitution, no imaginary filters:
 *
 *   .csv/.txt  numeric sample matrix (one column per standard lead, mV or µV)
 *   .hea       PhysioNet-style header text file (record name, leads, rate,
 *              per-lead format / gain / baseline)
 *   .dat       PhysioNet-style binary signal file, decodes formats
 *              16 (signed 16-bit LE), 80 (unsigned 8-bit) and 212
 *              (two interleaved 12-bit samples per 3 bytes)
 *
 * Everything the decoder assumes (sampling rate inferred from recording
 * length, unit scaling, ADC gain when no header is provided) is reported
 * back as an explicit warning so the UI can show it verbatim to the user.
 *
 * Decoding a signal is measurement, not model inference — AI screening is
 * performed only by the FastAPI backend.
 */

import { LEAD_NAMES, type LeadName } from "./types";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type ParseErrorCode =
  | "empty-file"
  | "too-short"
  | "no-matrix"
  | "bad-columns"
  | "missing-leads"
  | "units-unknown"
  | "bad-binary"
  | "unsupported-format"
  | "lead-count"
  | "missing-dat"
  | "unknown-type";

export class EcgParseError extends Error {
  code: ParseErrorCode;
  hint?: string;

  constructor(code: ParseErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "EcgParseError";
    this.code = code;
    this.hint = hint;
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ParsedSignal {
  kind: "csv" | "dat" | "dat+hea";
  /** All 12 standard leads, in mV, at the original sample rate. */
  leads: Record<LeadName, number[]>;
  sampleRate: number;
  durationSec: number;
  /** Human-readable one-line parse report shown in the pipeline UI. */
  detail: string;
  /** Explicit assumptions the decoder had to make (shown to the user). */
  warnings: string[];
}

export interface HeaLeadSpec {
  file: string;
  format: number;
  gain: number;
  baseline: number;
  name: string;
}

export interface HeaHeader {
  recordName: string;
  nLeads: number;
  freq: number;
  leads: HeaLeadSpec[];
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const STANDARD_ORDER = LEAD_NAMES; // I, II, III, aVR, aVL, aVF, V1..V6

const HEADER_ALIASES: Record<string, LeadName> = {
  i: "I",
  ii: "II",
  iii: "III",
  avr: "aVR",
  avl: "aVL",
  avf: "aVF",
  v1: "V1",
  v2: "V2",
  v3: "V3",
  v4: "V4",
  v5: "V5",
  v6: "V6",
  mlii: "II", // MIT-BIH rhythm-lead alias
};

/** Common clinical sampling rates used for length-based inference. */
const RATE_CANDIDATES = [1000, 600, 512, 500, 360, 257, 250, 200, 128];

/**
 * Candidate rate whose resulting duration sits closest to the standard
 * 10-second recording while staying physically plausible (5–30 s).
 * The assumption is ALWAYS surfaced as a warning by the caller.
 */
function inferRate(sampleCount: number): { rate: number; durationSec: number } {
  let best = { rate: 500, delta: Infinity };
  for (const rate of RATE_CANDIDATES) {
    const durationSec = sampleCount / rate;
    if (durationSec < 5 || durationSec > 30) continue;
    const delta = Math.abs(durationSec - 10);
    if (delta < best.delta) best = { rate, delta };
  }
  if (!Number.isFinite(best.delta)) {
    // No candidate in range — fall back to 500 Hz if it yields ≥ 5 s.
    return { rate: 500, durationSec: sampleCount / 500 };
  }
  return { rate: best.rate, durationSec: sampleCount / best.rate };
}

/** Peak absolute magnitude, sampled at a bounded stride for speed. */
function signalPeak(columns: number[][]): number {
  let peak = 0;
  for (const col of columns) {
    const stride = Math.max(1, Math.floor(col.length / 20000));
    for (let i = 0; i < col.length; i += stride) {
      const a = Math.abs(col[i]);
      if (Number.isFinite(a) && a > peak) peak = a;
    }
  }
  return peak;
}

/** Median absolute value of an array (no allocation-heavy sort of pairs). */
function median(values: number[]): number {
  const arr = [...values].sort((a, b) => a - b);
  const mid = arr.length >> 1;
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/**
 * Normalise column voltages to mV based on the observed peak magnitude.
 * Returns unit = null when the magnitude matches neither mV nor µV ranges.
 */
function normaliseUnits(
  columns: number[][],
): { columns: number[][]; unit: "mV" | "µV" | null; peak: number } {
  const peak = signalPeak(columns);
  if (peak === 0) return { columns, unit: null, peak };
  if (peak >= 0.05 && peak <= 20) return { columns, unit: "mV", peak };
  if (peak >= 50 && peak <= 20000) {
    return { columns: columns.map((c) => c.map((v) => v / 1000)), unit: "µV", peak };
  }
  return { columns, unit: null, peak };
}

function isIncreasingTimeColumn(col: number[]): boolean {
  if (col.length < 10) return false;
  const step = col[1] - col[0];
  if (!Number.isFinite(step) || step <= 0) return false;
  for (let i = 2; i < col.length; i++) {
    if (col[i] <= col[i - 1]) return false;
  }
  return true;
}

function isTimeLabel(label: string): boolean {
  const k = label.toLowerCase().trim();
  return (
    k === "t" ||
    k === "ms" ||
    k === "s" ||
    k === "sec" ||
    k === "index" ||
    k === "sample" ||
    k === "samples" ||
    k.startsWith("time")
  );
}

/** Derive the sampling rate from a numeric time column (s or ms). */
function rateFromTimeValues(values: number[], warnings: string[]): number | null {
  if (values.length < 10) return null;
  const deltas: number[] = [];
  for (let i = 1; i < values.length; i++) deltas.push(values[i] - values[i - 1]);
  let stepSec = median(deltas);
  if (!Number.isFinite(stepSec) || stepSec <= 0) return null;
  if (stepSec > 0.5 && stepSec < 2000) {
    stepSec /= 1000; // column was in milliseconds
    warnings.push("Time column interpreted as milliseconds.");
  }
  if (stepSec > 0.0005 && stepSec < 0.02) {
    const rate = Math.round(1 / stepSec);
    warnings.push(`Sampling rate ${rate} Hz taken from the time column (exact).`);
    return rate;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* CSV / TXT decoder                                                   */
/* ------------------------------------------------------------------ */

export function parseCsvEcg(text: string, fileName: string): ParsedSignal {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 50) {
    throw new EcgParseError(
      "too-short",
      `${fileName}: only ${lines.length} usable rows — a multi-second recording needs thousands of samples.`,
      "Export the full 10-second recording, one row per sample.",
    );
  }

  // Delimiter detection over a representative sample of lines.
  const sample = lines.slice(0, Math.min(60, lines.length));
  const counts = { comma: 0, semicolon: 0, tab: 0, space: 0 };
  for (const line of sample) {
    counts.comma += (line.match(/,/g) ?? []).length;
    counts.semicolon += (line.match(/;/g) ?? []).length;
    counts.tab += (line.match(/\t/g) ?? []).length;
    counts.space += (line.match(/ +/g) ?? []).length;
  }
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const delimRe =
    delimiter === "comma" ? /,/ : delimiter === "semicolon" ? /;/ : delimiter === "tab" ? /\t/ : /\s+/;
  const decimalFix = delimiter === "semicolon"; // European CSV: ';' delimited, ',' decimals

  const rows = lines.map((line) =>
    line
      .split(delimRe)
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
  );
  if (decimalFix) {
    for (const r of rows) {
      for (let i = 0; i < r.length; i++) r[i] = r[i].replace(",", ".");
    }
  }

  const width = rows[0].length;
  if (rows.some((r) => r.length !== width)) {
    throw new EcgParseError(
      "bad-columns",
      `${fileName}: rows have inconsistent column counts (${width} in the first row).`,
      "Each row must contain one value per lead, separated by the same delimiter.",
    );
  }

  // Header row handling — map column names to standard leads when provided.
  let leadOrder: LeadName[] | null = null;
  let dataRows = rows;
  let startCol = 0;
  let rateFromTimeColumn: number | null = null;
  const firstRowNumeric = rows[0].every((c) => Number.isFinite(Number(c)));
  if (!firstRowNumeric) {
    const headerCells = rows[0];
    const mapped: (LeadName | null)[] = headerCells.map((cell) => {
      const key = cell.toLowerCase().replace(/^(lead[-_ ]?)|\[.*\]|\(.*\)/g, "").trim();
      return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s/g, "")] ?? null;
    });
    const anyMapped = mapped.some((m) => m !== null);
    // A leading time axis (e.g. "Time", "t", "ms") is dropped before the
    // 12-lead validation so "time + 12 leads" exports decode cleanly.
    if (mapped[0] === null && isTimeLabel(headerCells[0])) {
      startCol = 1;
      mapped.shift();
      warnings.push("Leading time column detected and excluded.");
    }
    if (anyMapped) {
      if (mapped.some((m) => m === null)) {
        throw new EcgParseError(
          "missing-leads",
          `${fileName}: header row does not name all 12 standard leads (${mapped
            .map((m, i) => (m === null ? `column ${i + startCol + 1}` : null))
            .filter(Boolean)
            .join(", ")} unrecognised).`,
          "Name columns I, II, III, aVR, aVL, aVF, V1…V6 or remove the header row.",
        );
      }
      leadOrder = mapped as LeadName[];
      dataRows = rows.slice(1);
      warnings.push("Lead order taken from the CSV header row.");
      if (startCol === 1) {
        rateFromTimeColumn = rateFromTimeValues(
          dataRows.map((r) => Number(r[0])),
          warnings,
        );
      }
    } else {
      throw new EcgParseError(
        "no-matrix",
        `${fileName}: first row is not numeric and its labels do not match the 12 standard lead names.`,
        "Expected columns I, II, III, aVR, aVL, aVF, V1…V6 (any consistent order).",
      );
    }
  }

  // Column extraction — a strictly increasing first column with 13 columns
  // (no header) is treated as a time axis as well.
  let widthData = dataRows[0].length - startCol;
  if (firstRowNumeric && widthData === 13) {
    const first = dataRows.map((r) => Number(r[0]));
    if (isIncreasingTimeColumn(first)) {
      startCol = 1;
      widthData = 12;
      warnings.push("Leading time column detected and excluded.");
      rateFromTimeColumn = rateFromTimeValues(first, warnings);
    }
  }
  if (widthData !== 12) {
    throw new EcgParseError(
      "bad-columns",
      `${fileName}: found ${widthData} numeric data columns — the platform decodes exactly 12 (one per standard lead).`,
      "Re-export the recording with all 12 leads as 12 columns.",
    );
  }

  const n = dataRows.length;
  if (n < 250) {
    throw new EcgParseError(
      "too-short",
      `${fileName}: only ${n} samples per lead — at least ~1,250 rows (5 s @ 250 Hz) are required.`,
    );
  }

  const columns: number[][] = [];
  for (let c = 0; c < 12; c++) {
    const col = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const v = Number(dataRows[i][startCol + c]);
      if (!Number.isFinite(v)) {
        throw new EcgParseError(
          "bad-columns",
          `${fileName}: non-numeric value "${dataRows[i][startCol + c]}" in row ${i + 1}, column ${startCol + c + 1}.`,
        );
      }
      col[i] = v;
    }
    columns.push(col);
  }

  const units = normaliseUnits(columns);
  if (!units.unit) {
    throw new EcgParseError(
      "units-unknown",
      `${fileName}: signal magnitude (peak ${signalPeak(columns).toPrecision(3)}) matches neither mV nor µV ECG ranges.`,
      "Export voltages in millivolts or microvolts.",
    );
  }
  warnings.push(
    units.unit === "µV"
      ? "Values scaled from µV to mV (unit detection from signal magnitude)."
      : "Values interpreted as mV (unit detection from signal magnitude).",
  );

  let rate: number;
  let durationSec: number;
  if (rateFromTimeColumn) {
    rate = rateFromTimeColumn;
    durationSec = n / rate;
  } else {
    const inferred = inferRate(n);
    rate = inferred.rate;
    durationSec = inferred.durationSec;
    warnings.push(
      `Sampling rate inferred as ${rate} Hz from the ${durationSec.toFixed(1)} s recording length — verify against the source device.`,
    );
  }

  const leads = {} as Record<LeadName, number[]>;
  const order = leadOrder ?? STANDARD_ORDER;
  for (let c = 0; c < 12; c++) leads[order[c]] = units.columns[c];

  return {
    kind: "csv",
    leads,
    sampleRate: rate,
    durationSec,
    detail: `12 leads × ${n.toLocaleString()} samples · ${rate} Hz · ${durationSec.toFixed(1)} s · ${units.unit}→mV`,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* PhysioNet .hea header parser                                        */
/* ------------------------------------------------------------------ */

export function parseHeaHeader(text: string, fileName: string): HeaHeader {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    throw new EcgParseError("no-matrix", `${fileName}: not a recognisable PhysioNet header file.`);
  }

  const first = lines[0].split(/\s+/);
  const nLeads = Number(first[1]);
  const freq = Number(first[2]);
  if (!Number.isFinite(nLeads) || !Number.isFinite(freq) || nLeads <= 0 || freq <= 0) {
    throw new EcgParseError(
      "no-matrix",
      `${fileName}: header first line must be "<record> <nLeads> <samplingFrequency> …".`,
    );
  }

  const leads: HeaLeadSpec[] = [];
  for (let i = 1; i <= nLeads && i < lines.length; i++) {
    const tokens = lines[i].split(/\s+/);
    const nameMatch = lines[i].match(/,\s*([A-Za-z0-9]+)\s*,?\s*$/);
    leads.push({
      file: tokens[0] ?? "",
      format: Number(tokens[1] ?? 16) || 16,
      gain: Number(tokens[2] ?? 200) || 200,
      baseline: Number(tokens[3] ?? 0) || 0,
      name: nameMatch ? nameMatch[1] : `ch${i}`,
    });
  }

  return { recordName: first[0], nLeads, freq, leads };
}

/* ------------------------------------------------------------------ */
/* PhysioNet .dat binary decoder                                       */
/* ------------------------------------------------------------------ */

const SUPPORTED_FORMATS = [16, 80, 212];

/** One 12-bit sample pair per 3 bytes (PhysioNet format 212). */
function decode212Pair(view: DataView, byteOffset: number): [number, number] {
  const b0 = view.getUint8(byteOffset);
  const b1 = view.getUint8(byteOffset + 1);
  const b2 = view.getUint8(byteOffset + 2);
  const s1 = b0 | ((b1 & 0x0f) << 8);
  const s2 = (b1 >> 4) | (b2 << 4);
  const sign12 = (x: number) => (x >= 2048 ? x - 4096 : x);
  return [sign12(s1), sign12(s2)];
}

export function parseDatFile(
  buffer: ArrayBuffer,
  fileName: string,
  hea?: HeaHeader,
  heaFileName?: string,
): ParsedSignal {
  const warnings: string[] = [];

  if (hea) {
    if (hea.nLeads !== 12) {
      throw new EcgParseError(
        "lead-count",
        `${heaFileName ?? "header"}: record "${hea.recordName}" contains ${hea.nLeads} leads — the SPANDANA pipeline requires 12-lead recordings.`,
        "Export a 12-lead record (12 channels in format 16 or 80).",
      );
    }
    const formats = [...new Set(hea.leads.map((l) => l.format))];
    if (formats.some((f) => !SUPPORTED_FORMATS.includes(f))) {
      throw new EcgParseError(
        "unsupported-format",
        `${heaFileName ?? "header"}: signal format(s) ${formats.join(", ")} are not supported by the in-browser decoder (supported: 16, 80, 212).`,
      );
    }
    if (formats.length !== 1) {
      throw new EcgParseError(
        "unsupported-format",
        `${heaFileName ?? "header"}: mixed per-lead formats (${formats.join(", ")}) are not supported.`,
      );
    }
  }

  const nLeads = hea?.nLeads ?? 12;
  const format = hea?.leads[0]?.format ?? 16;
  const bytes = buffer.byteLength;
  const view = new DataView(buffer);

  let samplesPerLead: number;
  let raw: number[][];

  if (format === 212) {
    // 3 bytes → 2 samples, alternating between the two packed leads.
    const pairs = Math.floor(bytes / 3);
    if (pairs < 250) {
      throw new EcgParseError("too-short", `${fileName}: fewer than 250 sample frames.`);
    }
    const cols: number[][] = [new Array<number>(pairs), new Array<number>(pairs)];
    for (let p = 0; p < pairs; p++) {
      const [a, b] = decode212Pair(view, p * 3);
      cols[0][p] = a;
      cols[1][p] = b;
    }
    samplesPerLead = pairs;
    raw = cols;
  } else {
    const bytesPerSample = format === 80 ? 1 : 2;
    const frameBytes = bytesPerSample * nLeads;
    if (bytes % frameBytes !== 0) {
      throw new EcgParseError(
        "bad-binary",
        `${fileName}: ${bytes.toLocaleString()} bytes is not a whole multiple of ${frameBytes} (${nLeads} leads × ${bytesPerSample} byte${bytesPerSample > 1 ? "s" : ""}, format ${format}).`,
        hea
          ? "Check that the .dat and .hea files belong to the same record."
          : "Without a .hea header the decoder assumes 12 leads of signed 16-bit little-endian samples.",
      );
    }
    samplesPerLead = bytes / frameBytes;
    if (samplesPerLead < 250) {
      throw new EcgParseError(
        "too-short",
        `${fileName}: only ${samplesPerLead} samples per lead — at least ~1,250 (5 s @ 250 Hz) are required.`,
      );
    }
    raw = [];
    for (let l = 0; l < nLeads; l++) {
      const col = new Array<number>(samplesPerLead);
      for (let i = 0; i < samplesPerLead; i++) {
        const idx = i * nLeads + l;
        if (bytesPerSample === 1) {
          col[i] = view.getUint8(idx);
        } else {
          col[i] = view.getInt16(idx * 2, true);
        }
      }
      raw.push(col);
    }
  }

  // Scaling to mV.
  let columns: number[][];
  if (hea) {
    columns = raw.map((col, l) => {
      const { gain, baseline } = hea.leads[l];
      return col.map((v) => (v - baseline) / gain);
    });
    warnings.push(`ADC gain/baseline applied from ${heaFileName ?? "header"} (gain ${hea.leads[0].gain} units/mV).`);
  } else {
    const assumedGain = 200;
    columns = raw.map((col) => col.map((v) => v / assumedGain));
    warnings.push(
      `No .hea header supplied — assumed 12 interleaved leads, format ${format}, ADC gain ${assumedGain} units/mV. Upload the matching .hea file for exact scaling.`,
    );
  }

  if (columns.length !== 12) {
    throw new EcgParseError(
      "lead-count",
      `${fileName}: decoded ${columns.length} leads — the SPANDANA pipeline requires 12-lead recordings.`,
    );
  }

  const units = normaliseUnits(columns);
  if (!units.unit) {
    throw new EcgParseError(
      "units-unknown",
      `${fileName}: scaled signal magnitude (peak ${signalPeak(columns).toPrecision(3)}) matches neither mV nor µV ECG ranges.`,
      hea ? undefined : "Upload the record's .hea header together with the .dat file.",
    );
  }
  if (units.unit === "µV") {
    columns = units.columns;
    warnings.push("Scaled values interpreted as µV and converted to mV.");
  }

  let rate: number;
  let durationSec: number;
  if (hea) {
    rate = hea.freq;
    durationSec = samplesPerLead / rate;
  } else {
    const inferred = inferRate(samplesPerLead);
    rate = inferred.rate;
    durationSec = inferred.durationSec;
    warnings.push(
      `Sampling rate inferred as ${rate} Hz from the ${durationSec.toFixed(1)} s recording length — verify against the source device.`,
    );
  }
  if (durationSec < 5) {
    throw new EcgParseError(
      "too-short",
      `${fileName}: recording is ${durationSec.toFixed(1)} s at ${rate} Hz — at least 5 s are required.`,
    );
  }

  // Assign leads: use header names where recognisable, standard order otherwise.
  const leads = {} as Record<LeadName, number[]>;
  const used = new Set<LeadName>();
  let headerMapped = 0;
  for (let l = 0; l < 12; l++) {
    const alias = hea
      ? HEADER_ALIASES[hea.leads[l]?.name.toLowerCase() ?? ""] ?? null
      : null;
    let target: LeadName = alias && !used.has(alias) ? alias : STANDARD_ORDER[l];
    if (used.has(target)) {
      target = STANDARD_ORDER.find((nm) => !used.has(nm)) as LeadName;
    }
    used.add(target);
    leads[target] = columns[l];
    if (alias && target === alias) headerMapped++;
  }
  if (hea && headerMapped < 12) {
    warnings.push(
      `${headerMapped}/12 header lead names matched standard names — remaining leads placed in standard order.`,
    );
  }

  return {
    kind: hea ? "dat+hea" : "dat",
    leads,
    sampleRate: rate,
    durationSec,
    detail: `format ${format} · 12 leads × ${samplesPerLead.toLocaleString()} samples · ${rate} Hz · ${durationSec.toFixed(1)} s`,
    warnings,
  };
}
