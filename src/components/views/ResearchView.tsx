"use client";

/**
 * Research Information — LVH background, ECG technology, methodology,
 * the PTB-XL dataset, model architecture and limitations.
 */

import {
  Activity,
  BookOpen,
  Database,
  FlaskConical,
  Layers,
  Microscope,
  ScrollText,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/shared/StatCard";
import type { ViewId } from "@/store/analyses";

const PIPELINE = [
  {
    step: "1 · Acquisition",
    title: "Standard 10-second recording",
    body: "12-lead ECG captured at 500 Hz (I, II, III, aVR, aVL, aVF, V1–V6) — the cheapest and most widely available cardiac test.",
  },
  {
    step: "2 · Preprocessing",
    title: "Signal conditioning",
    body: "Baseline-wander removal, band-pass filtering and lead-quality checks. Implemented server-side by the FastAPI research backend.",
  },
  {
    step: "3a · Classical track",
    title: "Voltage criteria",
    body: "Sokolow–Lyon and Cornell sums computed from beat-averaged QRS amplitudes measured against the isoelectric baseline.",
  },
  {
    step: "3b · ML track",
    title: "Learned models",
    body: "A Perceptron on engineered voltage features and a 1-D CNN on the raw waveform tensor output calibrated LVH probabilities.",
  },
  {
    step: "4 · Integration",
    title: "Comparative interpretation",
    body: "Traditional and AI outputs are displayed side by side; discordance flags recordings for echocardiographic correlation.",
  },
];

const CNN_BLOCKS = [
  "Input — 10 s × 12 leads × 500 Hz (tensor)",
  "Conv1D(16) → BatchNorm → ReLU → MaxPool",
  "Conv1D(32) → BatchNorm → ReLU → MaxPool",
  "Conv1D(64) → BatchNorm → ReLU → MaxPool",
  "Global average pooling",
  "Dense(32) → Dropout(0.3) → Dense(1, sigmoid)",
];

export function ResearchView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <div className="space-y-8">
      {/* LVH primer */}
      <section>
        <SectionHeading
          icon={Microscope}
          title="What is Left Ventricular Hypertrophy?"
          description="The clinical problem SPANDANA researches."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="shadow-sm lg:col-span-2">
            <CardContent className="space-y-3 p-5 text-[13.5px] leading-relaxed text-[#47566b]">
              <p>
                <strong className="text-[#0b1728]">Left Ventricular Hypertrophy (LVH)</strong> is an
                abnormal thickening of the muscle of the heart&apos;s left pumping chamber. It is
                typically an adaptive response to chronic pressure overload — most commonly
                long-standing arterial hypertension, but also aortic stenosis and hypertrophic
                cardiomyopathy.
              </p>
              <p>
                LVH matters because it is an established independent risk factor for heart failure,
                atrial fibrillation, stroke and sudden cardiac death. Detecting it early allows
                risk stratification and treatment of the underlying cause.
              </p>
              <p>
                The clinical reference standard for chamber quantification is{" "}
                <strong className="text-[#0b1728]">echocardiography</strong>, which measures wall
                thickness and mass directly. ECG-based screening is far cheaper and faster, but
                substantially less sensitive — the exact trade-off this research platform
                investigates.
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#0b1728]">Common causes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-[13px] text-[#47566b]">
                {[
                  "Hypertension (most common)",
                  "Aortic valve stenosis",
                  "Hypertrophic cardiomyopathy",
                  "Athlete's heart (physiological)",
                  "Obesity and sleep apnoea",
                ].map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1d6fbe]" />
                    {c}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Methodology */}
      <section>
        <SectionHeading
          icon={Workflow}
          title="Methodology — the SPANDANA screening pipeline"
          description="How a 10-second recording flows through the research platform."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {PIPELINE.map((p) => (
            <Card key={p.step} className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#089fbf]">{p.step}</p>
                <p className="mt-1.5 text-[13.5px] font-bold text-[#0b1728]">{p.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ECG tech + criteria */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Why ECG can hint at LVH
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px] leading-relaxed text-[#47566b]">
            <p>
              Thickened left-ventricular walls generate larger electrical vectors. On the surface
              ECG this appears as taller R waves in lateral leads (V5, V6, I, aVL) and deeper S
              waves in right precordial leads (V1–V3).
            </p>
            <p>
              <strong className="text-[#0b1728]">Sokolow–Lyon (1949)</strong> sums the S wave in V1
              with the R wave in V5/V6 (≥ 3.5 mV).{" "}
              <strong className="text-[#0b1728]">Cornell (1987)</strong> combines R in aVL with S in
              V3 using sex-specific thresholds, improving performance.
            </p>
            <p>
              The fundamental limitation: voltage is also affected by body habitus, age, sex and
              conduction abnormalities — hence published sensitivities of only ~10–50% with high
              specificity. ECG criteria are useful rule-out aids, not diagnostic tests.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Dataset — PTB-XL
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["21,837", "clinical 12-lead ECGs"],
                ["10 s", "recording length"],
                ["500 Hz", "sampling rate"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-lg border border-[#e4eaf2] bg-[#f8fafd] px-2 py-3">
                  <p className="sp-tabular text-lg font-bold text-[#0b1728]">{v}</p>
                  <p className="text-[10.5px] leading-tight text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-[#47566b]">
              SPANDANA&apos;s methodology is designed around the{" "}
              <strong className="text-[#0b1728]">PTB-XL</strong> public dataset (Physikalisch-
              Technische Bundesanstalt, via PhysioNet): 12-lead recordings collected between 1989
              and 1996 with mostly 500 Hz sampling and multi-annotator SCP-ECG statements,
              including a hypertrophy annotation superclass for model training and evaluation.
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              This build bundles the measured voltages, labels and metrics for a small
              set of PTB-XL test-fold recordings; the raw ~1.8 GB signal archive is not
              included, so displayed traces are rendered from those voltages.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Model architecture */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Model architecture — Perceptron
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px] leading-relaxed text-[#47566b]">
            <p>
              A single-layer perceptron is the transparent baseline: it learns a weighted linear
              combination of 12 engineered voltage features (per-lead R/S amplitudes) followed by a
              sigmoid decision function.
            </p>
            <ul className="ml-4 list-disc space-y-1 text-[12.5px]">
              <li>Inputs: SV1, RV5, RV6, RaVL, SV3, … (12 features)</li>
              <li>Decision: ŷ = σ(wᵀx + b), threshold 0.5</li>
              <li>Strength: fully interpretable weights — see the AI Screening module</li>
            </ul>
            <p className="text-[11.5px] text-muted-foreground">
              Trained weights live with the research backend; connect it to see the real
              per-feature contributions in the AI Screening module.
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5 text-[#089fbf]" aria-hidden /> Model architecture — CNN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[13px] leading-relaxed text-[#47566b]">
              A compact 1-D convolutional network learns morphology directly from the raw
              12-lead tensor, capturing patterns beyond fixed voltage thresholds.
            </p>
            <ol className="space-y-1.5">
              {CNN_BLOCKS.map((b, i) => (
                <li key={b} className="flex items-center gap-2.5 rounded-md border border-[#e4eaf2] bg-[#f8fafd] px-3 py-1.5 text-[12px] text-[#0b1728]">
                  <span className="sp-tabular text-[10px] font-bold text-[#089fbf]">{String(i).padStart(2, "0")}</span>
                  {b}
                </li>
              ))}
            </ol>
            <p className="text-[11.5px] text-muted-foreground">
              Architecture description of the research design — the trained CNN runs in the
              FastAPI backend, not in the browser.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Limitations */}
      <section>
        <SectionHeading
          icon={ShieldAlert}
          title="Limitations & ethical considerations"
          description="Read this before drawing any conclusion from these results."
        />
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {[
              {
                t: "Not a certified device",
                d: "SPANDANA carries no CE/CDSCO/FDA mark. It must never guide diagnosis or treatment.",
              },
              {
                t: "Low sensitivity of ECG criteria",
                d: "Voltage criteria miss a large fraction of echo-confirmed LVH; a negative screen never excludes disease.",
              },
              {
                t: "Rendered waveforms",
                d: "Library voltages, labels and metrics are the measured PTB-XL values, but the drawn 12-lead trace is rendered from those voltages — PTB-XL’s raw signal archive is not bundled with this repository.",
              },
              {
                t: "Dataset shift & bias",
                d: "Models trained on PTB-XL may not generalise across devices, demographics and populations; validation on local data is mandatory.",
              },
              {
                t: "Privacy",
                d: "ECGs are personal health data. Upload only synthetic or fully anonymised recordings.",
              },
              {
                t: "Human oversight",
                d: "Any research output requires confirmation by echocardiography and review by a qualified clinician.",
              },
            ].map((l) => (
              <div key={l.t} className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <div>
                  <p className="text-[13px] font-bold text-[#0b1728]">{l.t}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#7a6a45]">{l.d}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* References */}
      <section>
        <SectionHeading icon={ScrollText} title="References" description="Key literature behind the methodology." />
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <ol className="space-y-2.5 text-[12.5px] leading-relaxed text-[#47566b]">
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1d6fbe]">1.</span>
                Sokolow M, Lyon TP. The ventricular complex in left ventricular hypertrophy as obtained by unipolar precordial and limb leads. <em>American Heart Journal</em>. 1949;37(1):161–186.
              </li>
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1d6fbe]">2.</span>
                Casale PN, Devereux RB, Alonso DR, Campo E, Kligfield P. Improved sex-specific criteria of left ventricular hypertrophy for electrocardiography and echocardiography. <em>Circulation</em>. 1987;75(3):565–572.
              </li>
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1d6fbe]">3.</span>
                Wagner P, et al. PTB-XL, a large publicly available electrocardiography dataset. <em>Scientific Data</em>. 2020;7:206.
              </li>
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1d6fbe]">4.</span>
                Goldberger AL, et al. PhysioBank, PhysioToolkit, and PhysioNet. <em>Circulation</em>. 2000;101(23):e215–e220.
              </li>
              <li className="flex gap-2.5">
                <span className="font-semibold text-[#1d6fbe]">5.</span>
                Lang RM, et al. Recommendations for cardiac chamber quantification by echocardiography in adults. <em>Journal of the American Society of Echocardiography</em>. 2015;28(1):1–39.
              </li>
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef2f8] pt-4">
              <FlaskConical className="h-4 w-4 text-[#1d6fbe]" aria-hidden />
              <p className="text-xs text-muted-foreground">
                Want the interactive side? Open the{" "}
                <button className="font-medium text-[#1d6fbe] hover:underline" onClick={() => onNavigate("upload")}>
                  ECG Analysis
                </button>{" "}
                module to explore the pipeline with the PTB-XL library or your own recordings.
              </p>
              <Badge variant="outline" className="ml-auto bg-white">
                <BookOpen className="mr-1 h-3 w-3" aria-hidden /> Module 8
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
