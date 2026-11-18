"use client";

/**
 * Analysis Reports — professional, printable research report containing
 * the ECG visualisation, screening results, criteria calculations and a
 * model-comparison snapshot for the selected recording.
 */

import { FileText, Printer, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnalysisSelector } from "@/components/shared/AnalysisSelector";
import { EcgGrid } from "@/components/ecg/EcgGrid";
import { useAnalysesStore, useSelectedAnalysis } from "@/store/analyses";
import { MODEL_METRICS } from "@/lib/real-data";
import { format } from "date-fns";

export function ReportsView({ onNavigate }: { onNavigate: (v: "upload") => void }) {
  const analyses = useAnalysesStore((s) => s.analyses);
  const selected = useSelectedAnalysis();

  if (!selected) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground shadow-sm">
        No recording available. Upload a recording or pick one from the PTB-XL library.
      </Card>
    );
  }

  const sl = selected.criteria.sokolowLyon;
  const co = selected.criteria.cornell;
  const [perceptron, cnn] = selected.predictions;
  const decoded = selected.meta.signalOrigin === "decoded-file";
  const durationSec = selected.waveform.durationSec;
  const durationLabel = durationSec % 1 === 0 ? durationSec.toFixed(0) : durationSec.toFixed(1);
  const hrLabel = selected.spec.bpm > 0 ? `${selected.spec.bpm} bpm` : "n/a (not detectable)";

  return (
    <div className="space-y-5">
      {/* Toolbar (never printed) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <AnalysisSelector
          value={selected.id}
          analyses={analyses}
          onChange={(id) => useAnalysesStore.getState().selectAnalysis(id)}
        />
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white" onClick={() => onNavigate("upload")}>
            New recording
          </Button>
          <Button className="bg-[#0b1728] hover:bg-[#12233a]" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Report paper */}
      <Card className="mx-auto w-full max-w-4xl p-0 shadow-md print:shadow-none">
        <div className="p-6 sm:p-10">
          {/* Report header */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0b1728] pb-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0b1728]">
                <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
                  <path
                    d="M4 34 H18 L23 22 L31 46 L37 27 L41 34 H60"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <p className="text-lg font-bold tracking-[0.12em] text-[#0b1728]">SPANDANA</p>
                <p className="text-[11px] font-medium text-muted-foreground">
                  AI Cardiac Intelligence · “See Beyond the Heartbeat.”
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[#0b1728]">ECG LVH Screening Report</p>
              <p className="text-[11px] text-muted-foreground">
                Research report · recorded {format(new Date(selected.createdAt), "dd MMM yyyy")}
              </p>
              <div className="mt-1.5 flex justify-end">
                <Badge variant="outline" className="border-sky-300 bg-sky-50 font-medium text-sky-800">
                  Not a clinical document
                </Badge>
              </div>
            </div>
          </div>

          {/* Recording metadata */}
          <section className="print-break mt-6">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#1d6fbe]">1 · Recording</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-lg border border-[#e4eaf2] bg-[#f8fafd] p-4 text-[13px] sm:grid-cols-4">
              {[
                ["Recording ID", selected.meta.code],
                ["Subject", `${selected.meta.sex}, ${selected.meta.age} yrs`],
                ["Heart rate", hrLabel],
                ["Beats in window", String(selected.waveform.beats.length)],
                ["Duration", `${durationLabel} s`],
                ["Leads", "12 (standard)"],
                ["Sampling", `${selected.waveform.sampleRate} Hz`],
                [
                  "Source",
                  decoded
                    ? `Decoded in-browser: ${selected.meta.sourceFile ?? "file"}`
                    : selected.meta.source === "ptbxl-library"
                      ? "PTB-XL library (measured voltages)"
                      : `Upload: ${selected.meta.sourceFile ?? "file"}`,
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="sp-tabular mt-0.5 font-semibold text-[#0b1728]">{v}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ECG visualisation */}
          <section className="print-break mt-7">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#1d6fbe]">2 · 12-lead ECG</h3>
            <div className="mt-3">
              <EcgGrid
                waveform={selected.waveform}
                showScaleNote={false}
                note={
                  decoded
                    ? "Signal decoded in-browser from the uploaded recording · auto-scaled display"
                    : "Trace rendered from the recording’s measured voltages · auto-scaled display"
                }
              />
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              {decoded
                ? "Real decoded samples · voltage criteria measured from the decoded signal."
                : "PTB-XL recording · voltage criteria are the dataset’s measured values; the trace is rendered from them."}
            </p>
          </section>

          {/* Traditional criteria */}
          <section className="print-break mt-7">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#1d6fbe]">
              3 · Traditional voltage criteria
            </h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-[#e4eaf2]">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#e4eaf2] bg-[#f8fafd] text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3.5 py-2 font-semibold">Criterion</th>
                    <th className="px-3.5 py-2 font-semibold">Formula</th>
                    <th className="px-3.5 py-2 text-right font-semibold">Measured</th>
                    <th className="px-3.5 py-2 text-right font-semibold">Threshold</th>
                    <th className="px-3.5 py-2 text-right font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="sp-tabular">
                  <tr className="border-b border-[#eef2f8]">
                    <td className="px-3.5 py-2.5 font-semibold text-[#0b1728]">Sokolow–Lyon</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11.5px]">S(V1) + R(V5|V6)</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {sl.sv1.toFixed(2)} + {sl.rv56.toFixed(2)} = <strong>{sl.sum.toFixed(2)} mV</strong>
                    </td>
                    <td className="px-3.5 py-2.5 text-right">≥ 3.50 mV</td>
                    <td className={`px-3.5 py-2.5 text-right font-bold ${sl.positive ? "text-red-700" : "text-emerald-700"}`}>
                      {sl.positive ? "POSITIVE" : "NEGATIVE"}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2.5 font-semibold text-[#0b1728]">Cornell</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11.5px]">R(aVL) + S(V3)</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {co.ravl.toFixed(2)} + {co.sv3.toFixed(2)} = <strong>{co.sum.toFixed(2)} mV</strong>
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      ≥ {co.threshold.toFixed(1)} mV ({selected.meta.sex.toLowerCase()})
                    </td>
                    <td className={`px-3.5 py-2.5 text-right font-bold ${co.positive ? "text-red-700" : "text-emerald-700"}`}>
                      {co.positive ? "POSITIVE" : "NEGATIVE"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Agreement: {selected.criteria.agreement.replace(/-/g, " ")} · References: {sl.reference} {co.reference}
            </p>
          </section>

          {/* AI screening */}
          <section className="print-break mt-7">
            <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[#1d6fbe]">
              4 · AI screening results
            </h3>
            {selected.predictions.length === 0 ? (
              <p className="mt-3 rounded-lg border border-[#e4eaf2] bg-[#f8fafd] p-4 text-[12px] leading-relaxed text-muted-foreground">
                No model output for this recording. Perceptron and CNN scores are
                produced only by the FastAPI research backend; start it and re-run
                the analysis to include them in this report. The voltage criteria
                above were measured directly from the recording.
              </p>
            ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { p: perceptron, arch: "Linear model · 12 voltage features" },
                { p: cnn, arch: "1-D CNN · 10 s × 12 leads tensor" },
              ].map(({ p, arch }) => (
                <div key={p.model} className="rounded-lg border border-[#e4eaf2] p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[#0b1728]">
                      {p.model === "cnn" ? "CNN Model" : "Perceptron Model"}
                    </p>
                    <span className={`text-sm font-bold ${p.positive ? "text-red-700" : "text-emerald-700"}`}>
                      {(p.probability * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{arch}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef2f8]">
                    <div
                      className={`h-full rounded-full ${p.positive ? "bg-red-600" : "bg-[#1d6fbe]"}`}
                      style={{ width: `${p.probability * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {p.positive ? "Above" : "Below"} 0.50 threshold · {p.latencyMs} ms ·
                    backend inference
                  </p>
                </div>
              ))}
            </div>
            )}
          </section>

          {/* Model comparison snapshot */}
          <section className="print-break mt-7">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#1d6fbe]">
              5 · Benchmark snapshot (PTB-XL test set)
            </h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-[#e4eaf2]">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#e4eaf2] bg-[#f8fafd] text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Method</th>
                    <th className="px-3 py-2 text-right font-semibold">Accuracy</th>
                    <th className="px-3 py-2 text-right font-semibold">Sensitivity</th>
                    <th className="px-3 py-2 text-right font-semibold">Specificity</th>
                    <th className="px-3 py-2 text-right font-semibold">F1</th>
                    <th className="px-3 py-2 text-right font-semibold">ROC-AUC</th>
                  </tr>
                </thead>
                <tbody className="sp-tabular">
                  {MODEL_METRICS.map((m) => (
                    <tr key={m.model} className="border-b border-[#eef2f8] last:border-0">
                      <td className="px-3 py-2 font-semibold text-[#0b1728]">{m.model}</td>
                      <td className="px-3 py-2 text-right">{m.accuracy.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{m.sensitivity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{m.specificity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{m.f1.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{m.rocAuc.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              Measured on the PTB-XL test fold (strat_fold 10); thresholds tuned on
              validation fold 9.
            </p>
          </section>

          {/* Interpretation */}
          <section className="print-break mt-7">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#1d6fbe]">
              6 · Research interpretation
            </h3>
            <div className="mt-3 rounded-lg border border-[#e4eaf2] bg-[#f8fafd] p-4">
              <p className="text-[13px] leading-relaxed text-[#47566b]">
                <span className="font-semibold capitalize text-[#0b1728]">{selected.interpretation}</span>{" "}
                — {selected.notes}
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <p className="text-[11.5px] leading-relaxed text-amber-800">
                  <strong>Disclaimer.</strong> This report was generated by SPANDANA. It is not a
                  certified medical diagnostic system and must not be used for clinical
                  decision-making. It does not replace ECG interpretation by a qualified
                  clinician, echocardiography or professional medical judgment. The
                  LVH labels shown are cardiologist SCP statements from PTB-XL, not
                  echocardiographic confirmation.
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-[#dfe6ef] pt-4 text-[10.5px] text-muted-foreground">
            <span>
              SPANDANA v0.1.0 · Generated {format(new Date(), "dd MMM yyyy, HH:mm")}
            </span>
            <Badge variant="outline" className="bg-white text-[10px]">
              Not a medical device
            </Badge>
          </div>
        </div>
      </Card>

      <div className="no-print mx-auto max-w-4xl">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Tip: use “Print / Save as PDF” for an archival copy — the sidebar, header and footer are
          automatically excluded from the printed page.
        </p>
      </div>
    </div>
  );
}
