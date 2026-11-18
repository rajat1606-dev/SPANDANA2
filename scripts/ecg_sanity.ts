/**
 * Regression check for the PTB-XL case library.
 *
 * The library displays a rendered trace, but both voltage criteria must be
 * computed from the dataset's own measured voltages, which reach the
 * criteria engine through `WaveformSpec.measured` (see lib/ecg/waveform.ts).
 * If that path ever breaks, the UI would quietly fall back to amplitudes
 * read off the drawing and still present them as PTB-XL measurements.
 *
 * So this script does not only print: it re-derives the criteria exactly as
 * the app does and asserts they match the values generated straight from
 * data/metadata/feature_rows.csv into lib/real-data.ts. Exits non-zero on
 * any mismatch.
 *
 *   npx tsx scripts/ecg_sanity.ts
 */
import { createLibraryAnalyses } from "../src/lib/case-library";
import { PTBXL_CASES } from "../src/lib/real-data";

/** Sums and thresholds are 3-decimal on both sides; absorb float noise only. */
const TOLERANCE = 1e-6;

/**
 * criteria.ts reports each voltage component rounded to 3 decimals, while
 * real-data.ts keeps the generator's 4-decimal value, so the expected
 * component is put through the same rounding before comparing.
 */
const round3 = (x: number) => Math.round(x * 1000) / 1000;

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) <= TOLERANCE
      : actual === expected;
  if (!ok) {
    failures += 1;
    console.error(`    FAIL ${label}: got ${String(actual)}, expected ${String(expected)}`);
  }
}

const analyses = createLibraryAnalyses();

if (analyses.length !== PTBXL_CASES.length) {
  console.error(
    `FAIL: library built ${analyses.length} analyses for ${PTBXL_CASES.length} cases`,
  );
  process.exit(1);
}

for (const a of analyses) {
  const ecgId = Number(a.id.replace("ptbxl-", ""));
  const expected = PTBXL_CASES.find((c) => c.ecgId === ecgId);

  if (!expected) {
    console.error(`FAIL: no PTBXL_CASES entry for ${a.id}`);
    failures += 1;
    continue;
  }

  const sl = a.criteria.sokolowLyon;
  const co = a.criteria.cornell;
  const before = failures;

  console.log(
    `${a.meta.code} (${a.meta.sex}, ${a.meta.age}) bpm=${a.waveform.bpm} fold=${expected.stratFold}`,
  );
  console.log(
    `  Sokolow-Lyon: SV1=${sl.sv1} RV5/6=${sl.rv56} sum=${sl.sum} >= ${sl.threshold} -> ${sl.positive}`,
  );
  console.log(
    `  Cornell:      RaVL=${co.ravl} SV3=${co.sv3} sum=${co.sum} >= ${co.threshold} -> ${co.positive}`,
  );
  console.log(
    `  Agreement=${a.criteria.agreement} Interpretation=${a.interpretation}`,
  );

  // Demographics drive the sex-specific Cornell cutoff.
  check("sex", a.meta.sex, expected.sex);
  check("age", a.meta.age, expected.age);

  // The five voltages the dataset actually measured must survive rendering.
  check("SV1", sl.sv1, round3(expected.sv1));
  check("RV5/6", sl.rv56, round3(Math.max(expected.rv5, expected.rv6)));
  check("RaVL", co.ravl, round3(expected.ravl));
  check("SV3", co.sv3, round3(expected.sv3));

  // ...and therefore so must the sums, thresholds and verdicts.
  check("Sokolow-Lyon sum", sl.sum, expected.sokolowLyonSum);
  check("Sokolow-Lyon positive", sl.positive, expected.sokolowLyonPositive);
  check("Cornell sum", co.sum, expected.cornellSum);
  check("Cornell threshold", co.threshold, expected.cornellThreshold);
  check("Cornell positive", co.positive, expected.cornellPositive);

  // Predictions only ever come from the FastAPI backend.
  if (a.predictions.length !== 0) {
    failures += 1;
    console.error(
      `    FAIL predictions: expected none locally, got ${a.predictions.length}`,
    );
  }

  console.log(
    failures === before
      ? "  OK — matches feature_rows.csv; models awaiting FastAPI backend"
      : "  MISMATCH against feature_rows.csv",
  );
  console.log(
    `  Samples/lead=${a.waveform.leads["II"].length} beats=${a.waveform.beats.length}`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${analyses.length} library recordings match the dataset values.`);
