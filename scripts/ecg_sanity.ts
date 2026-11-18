/**
 * Sanity check: run the waveform renderer + criteria engine and print the
 * measured values for the three real PTB-XL library recordings. The printed
 * sums must match data/metadata/feature_rows.csv for those ecg_ids.
 */
import { createLibraryAnalyses } from "../src/lib/case-library";

const demos = createLibraryAnalyses();
for (const a of demos) {
  const sl = a.criteria.sokolowLyon;
  const co = a.criteria.cornell;
  console.log(
    `${a.meta.code} (${a.meta.sex}, ${a.meta.age}) bpm=${a.waveform.bpm}`,
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
  if (a.predictions.length === 0) {
    console.log("  Models: awaiting FastAPI backend (no local inference)");
  } else {
    for (const p of a.predictions) {
      console.log(`  ${p.model}=${p.probability} (${p.positive})`);
    }
  }
  console.log(
    `  Samples/lead=${a.waveform.leads["II"].length} beats=${a.waveform.beats.length}`,
  );
}
