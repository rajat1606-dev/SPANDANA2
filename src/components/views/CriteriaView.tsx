"use client";

/**
 * Traditional Analysis — Sokolow–Lyon and Cornell voltage criteria with
 * transparent formulas, measured components and threshold comparisons.
 */

import {
  Calculator,
  FileText,
  Info,
  Ruler,
  Shuffle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { AnalysisMetaRow, AnalysisSelector } from "@/components/shared/AnalysisSelector";
import { CriterionPill, SignalOriginBadge } from "@/components/shared/badges";
import { MODEL_COLORS } from "@/lib/chart-palette";
import { useAnalysesStore, useSelectedAnalysis } from "@/store/analyses";
import { criterionExplanations } from "@/lib/ecg/criteria";

export function CriteriaView({ onNavigate }: { onNavigate: (v: "screening" | "visualization" | "reports") => void }) {
  const analyses = useAnalysesStore((s) => s.analyses);
  const selected = useSelectedAnalysis();

  if (!selected) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground shadow-sm">
        No recording available. Upload a recording or pick one from the PTB-XL library.
      </Card>
    );
  }

  const { sokolowLyon: sl, cornell: co, agreement } = selected.criteria;
  const explanations = criterionExplanations(selected.meta.sex);
  const decoded = selected.meta.signalOrigin === "decoded-file";

  const slChart = [
    {
      name: "SV1 + RV5/V6",
      measured: sl.sum,
      fill: sl.positive ? "#b91c1c" : MODEL_COLORS["Sokolow–Lyon"],
    },
  ];
  const coChart = [
    {
      name: `RaVL + SV3`,
      measured: co.sum,
      fill: co.positive ? "#b91c1c" : MODEL_COLORS.Cornell,
    },
  ];

  const agreementCopy: Record<typeof agreement, { title: string; body: string }> = {
    "both-positive": {
      title: "Concordant positive",
      body: "Both standard voltage criteria exceed their thresholds. In the research workflow this is the strongest traditional-criteria signal, though echocardiographic correlation remains the reference standard.",
    },
    "both-negative": {
      title: "Concordant negative",
      body: "Neither criterion reaches its threshold. Note that ECG voltage criteria miss a substantial share of echo-confirmed LVH cases (published sensitivity is roughly 10–50%), so a negative screen does not exclude LVH.",
    },
    discordant: {
      title: "Discordant criteria",
      body: "The two criteria disagree for this recording. Discordance is common in borderline voltage ranges and is one of the motivations for evaluating machine-learned models alongside classical criteria.",
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AnalysisSelector
          value={selected.id}
          analyses={analyses}
          onChange={(id) => useAnalysesStore.getState().selectAnalysis(id)}
        />
        <Badge variant="outline" className="border-sky-300 bg-sky-50 font-medium text-sky-800">
          Measured voltages
        </Badge>
      </div>

      <AnalysisMetaRow analysis={selected} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Sokolow–Lyon */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Ruler className="h-5 w-5 text-[#1f63b8]" aria-hidden /> Sokolow–Lyon criterion
              </span>
              <CriterionPill positive={sl.positive} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-[#1c1917] px-4 py-3 text-center">
              <p className="font-mono text-sm text-cyan-300">
                S(V1) + R(V5 <span className="text-[#7d93ad]">or</span> V6) ≥ 3.5 mV
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-[#e7e2db] bg-[#faf8f4] py-2.5">
                <p className="sp-tabular text-lg font-bold text-[#1c1917]">{sl.sv1.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">S in V1 (mV)</p>
              </div>
              <div className="rounded-lg border border-[#e7e2db] bg-[#faf8f4] py-2.5">
                <p className="sp-tabular text-lg font-bold text-[#1c1917]">{sl.rv56.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">R in V5/V6 (mV)</p>
              </div>
              <div className={`rounded-lg border py-2.5 ${sl.positive ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                <p className={`sp-tabular text-lg font-bold ${sl.positive ? "text-red-700" : "text-emerald-700"}`}>
                  {sl.sum.toFixed(2)}
                </p>
                <p className="text-[11px] text-muted-foreground">Sum (mV)</p>
              </div>
            </div>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slChart} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, Math.max(4.5, sl.sum + 0.8)]} hide />
                  <YAxis type="category" dataKey="name" hide />
                  <ReferenceLine x={sl.threshold} stroke="#1c1917" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Bar dataKey="measured" name="Measured sum (mV)" barSize={22} radius={[0, 5, 5, 0]}>
                    <Cell fill={slChart[0].fill} />
                  </Bar>
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} mV`, "Measured"]} contentStyle={{ borderRadius: 10, fontSize: 12, borderColor: "#e0dad1" }} cursor={{ fill: "#f5f1ea" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{explanations.sl}</p>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <FileText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {sl.reference}
            </p>
          </CardContent>
        </Card>

        {/* Cornell */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-[#1f63b8]" aria-hidden /> Cornell criterion
              </span>
              <CriterionPill positive={co.positive} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-[#1c1917] px-4 py-3 text-center">
              <p className="font-mono text-sm text-cyan-300">
                R(aVL) + S(V3) ≥ {co.threshold.toFixed(1)} mV{" "}
                <span className="text-[#7d93ad]">({selected.meta.sex.toLowerCase()})</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-[#e7e2db] bg-[#faf8f4] py-2.5">
                <p className="sp-tabular text-lg font-bold text-[#1c1917]">{co.ravl.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">R in aVL (mV)</p>
              </div>
              <div className="rounded-lg border border-[#e7e2db] bg-[#faf8f4] py-2.5">
                <p className="sp-tabular text-lg font-bold text-[#1c1917]">{co.sv3.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">S in V3 (mV)</p>
              </div>
              <div className={`rounded-lg border py-2.5 ${co.positive ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                <p className={`sp-tabular text-lg font-bold ${co.positive ? "text-red-700" : "text-emerald-700"}`}>
                  {co.sum.toFixed(2)}
                </p>
                <p className="text-[11px] text-muted-foreground">Sum (mV)</p>
              </div>
            </div>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coChart} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, Math.max(3.6, co.sum + 0.8)]} hide />
                  <YAxis type="category" dataKey="name" hide />
                  <ReferenceLine x={co.threshold} stroke="#1c1917" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Bar dataKey="measured" name="Measured sum (mV)" barSize={22} radius={[0, 5, 5, 0]}>
                    <Cell fill={coChart[0].fill} />
                  </Bar>
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)} mV`, "Measured"]} contentStyle={{ borderRadius: 10, fontSize: 12, borderColor: "#e0dad1" }} cursor={{ fill: "#f5f1ea" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{explanations.cornell}</p>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <FileText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {co.reference}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Agreement + measurement note */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {agreement === "discordant" ? (
                <Shuffle className="h-5 w-5 text-amber-500" aria-hidden />
              ) : (
                <Info className="h-5 w-5 text-[#1f63b8]" aria-hidden />
              )}
              Criteria agreement — {agreementCopy[agreement].title}
              {agreement === "discordant" && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  borderline case
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-[#6b6158]">{agreementCopy[agreement].body}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="bg-white" onClick={() => onNavigate("screening")}>
                Compare with AI screening →
              </Button>
              <Button size="sm" variant="ghost" className="text-[#1f63b8]" onClick={() => onNavigate("visualization")}>
                Inspect waveform
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How the measurement works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <p className="rounded-md bg-[#faf8f4] p-2.5 text-[11.5px]">
              {decoded
                ? "Decoded recording: R/S extremes are measured globally against the median (isoelectric) baseline of each lead — a deliberately simple research measurement."
                : "For every beat, QRS peaks are measured relative to the local isoelectric baseline (TP segment) and averaged across the 10-second window."}
            </p>
            <p>
              S-wave depth is reported as a positive magnitude. Voltages are in millivolts;
              1 mV = 10 mm on standard paper.
            </p>
            <p className="rounded-md bg-[#faf8f4] p-2.5 text-[11.5px]">
              {decoded
                ? "Values derive from the real uploaded signal — research measurements, not clinical interpretations."
                : "Values are this PTB-XL recording’s own measured voltages — research measurements, not clinical interpretations."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
