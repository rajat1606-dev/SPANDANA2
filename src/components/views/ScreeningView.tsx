"use client";

/**
 * AI Screening — Perceptron and CNN LVH probability outputs.
 *
 * Every probability here comes from the trained PTB-XL models served by the
 * FastAPI backend (see lib/api.ts). When the backend has not scored the
 * selected recording the view says so instead of showing a number.
 */

import { BrainCircuit, Cpu, Gauge, Info, ShieldAlert } from "lucide-react";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalysisMetaRow, AnalysisSelector } from "@/components/shared/AnalysisSelector";
import { ModelChip } from "@/components/shared/badges";
import { useAnalysesStore, useSelectedAnalysis } from "@/store/analyses";
import { cn } from "@/lib/utils";

function ProbabilityGauge({
  probability,
  positive,
  hue,
}: {
  probability: number;
  positive: boolean;
  hue: string;
}) {
  const data = [{ value: probability * 100, fill: positive ? "#b91c1c" : hue }];
  return (
    <div className="relative h-44 w-44">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: "#eef2f8" }} dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("sp-tabular text-3xl font-bold", positive ? "text-red-700" : "text-[#0b1728]")}>
          {(probability * 100).toFixed(1)}%
        </span>
        <span className="text-[11px] text-muted-foreground">LVH probability</span>
      </div>
    </div>
  );
}

function ContributionBars({
  contributions,
}: {
  contributions: { feature: string; weight: number; value: number }[];
}) {
  const scored = contributions.map((c) => ({ ...c, score: c.weight * c.value }));
  const max = Math.max(0.001, ...scored.map((s) => Math.abs(s.score)));
  return (
    <ul className="space-y-2">
      {scored.map((s) => (
        <li key={s.feature} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">{s.feature}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eef2f8]">
            <div
              className={cn("h-full rounded-full", s.score >= 0 ? "bg-[#1d6fbe]" : "bg-[#9fb2c8]")}
              style={{ width: `${(Math.abs(s.score) / max) * 100}%` }}
            />
          </div>
          <span className="sp-tabular w-16 text-right font-medium text-[#0b1728]">
            {s.score >= 0 ? "+" : ""}
            {s.score.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ScreeningView({ onNavigate }: { onNavigate: (v: "comparison" | "criteria") => void }) {
  const analyses = useAnalysesStore((s) => s.analyses);
  const selected = useSelectedAnalysis();

  if (!selected) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground shadow-sm">
        No recording available. Upload a recording or pick one from the PTB-XL library.
      </Card>
    );
  }

  // AI results come only from the FastAPI research backend. Until it has
  // scored this recording there is nothing truthful to display here.
  if (selected.predictions.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AnalysisSelector
            value={selected.id}
            analyses={analyses}
            onChange={(id) => useAnalysesStore.getState().selectAnalysis(id)}
          />
          <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
            Backend offline
          </Badge>
        </div>

        <AnalysisMetaRow analysis={selected} />

        <Card className="border-slate-200 bg-slate-50/60 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <div className="text-sm leading-relaxed text-slate-700">
              <span className="font-semibold text-slate-900">
                No model output for this recording yet.{" "}
              </span>
              Perceptron and CNN scores are produced only by the trained PTB-XL
              models behind the FastAPI backend. Start it with{" "}
              <code className="rounded bg-slate-200 px-1 font-mono text-[11px]">
                ./run_backend.ps1
              </code>{" "}
              and set{" "}
              <code className="rounded bg-slate-200 px-1 font-mono text-[11px]">
                NEXT_PUBLIC_FASTAPI_URL
              </code>
              ; the recording is then scored via{" "}
              <code className="rounded bg-slate-200 px-1 font-mono text-[11px]">
                POST /api/v1/screen
              </code>
              . The voltage criteria on the Traditional Analysis page are
              measured in-browser and remain available.
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5 text-sm text-muted-foreground">
            <button
              type="button"
              onClick={() => onNavigate("criteria")}
              className="font-semibold text-[#1d6fbe] underline-offset-2 hover:underline"
            >
              View the Sokolow–Lyon and Cornell results for this recording →
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [perceptron, cnn] = selected.predictions;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AnalysisSelector
          value={selected.id}
          analyses={analyses}
          onChange={(id) => useAnalysesStore.getState().selectAnalysis(id)}
        />
        <Badge className="bg-emerald-600">Backend inference</Badge>
      </div>

      <AnalysisMetaRow analysis={selected} />

      {/* Every value below came from the backend's trained models. */}
      <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="text-sm leading-relaxed text-emerald-800">
            <span className="font-semibold text-emerald-900">Real model inference. </span>
            The outputs below were produced by the trained Perceptron and CNN (PTB-XL research
            models) served by the FastAPI backend. SPANDANA is an academic prototype — never a
            substitute for clinical evaluation or echocardiography.
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Perceptron */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <ModelChip model="perceptron" />
              <Badge className="bg-emerald-600">REAL</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ProbabilityGauge probability={perceptron.probability} positive={perceptron.positive} hue="#1d6fbe" />
              <div className="min-w-[150px] flex-1 space-y-2 text-sm">
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    perceptron.positive
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  <p className="text-[11px] uppercase tracking-wide opacity-70">Screen result</p>
                  <p className="font-semibold">{perceptron.positive ? `Above ${perceptron.threshold.toFixed(2)} — LVH flagged` : `Below ${perceptron.threshold.toFixed(2)} — not flagged`}</p>
                </div>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Decision threshold</span>
                  <span className="sp-tabular font-semibold text-[#0b1728]">{perceptron.threshold.toFixed(2)}</span>
                </p>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Inference latency</span>
                  <span className="sp-tabular font-semibold text-[#0b1728]">{perceptron.latencyMs} ms</span>
                </p>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Feature space</span>
                  <span className="font-semibold text-[#0b1728]">12 voltage features</span>
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Linear decision contributions (weight × value)
              </p>
              <ContributionBars contributions={perceptron.contributions} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Single-layer perceptron: a linear decision boundary over QRS voltage features,
              trained with the perceptron update rule — the classic baseline for
              high-dimensional screening tasks.
            </p>
          </CardContent>
        </Card>

        {/* CNN */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <ModelChip model="cnn" />
              <Badge className="bg-emerald-600">REAL</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ProbabilityGauge probability={cnn.probability} positive={cnn.positive} hue="#089fbf" />
              <div className="min-w-[150px] flex-1 space-y-2 text-sm">
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    cnn.positive
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  <p className="text-[11px] uppercase tracking-wide opacity-70">Screen result</p>
                  <p className="font-semibold">{cnn.positive ? `Above ${cnn.threshold.toFixed(2)} — LVH flagged` : `Below ${cnn.threshold.toFixed(2)} — not flagged`}</p>
                </div>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Decision threshold</span>
                  <span className="sp-tabular font-semibold text-[#0b1728]">{cnn.threshold.toFixed(2)}</span>
                </p>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Inference latency</span>
                  <span className="sp-tabular font-semibold text-[#0b1728]">{cnn.latencyMs} ms</span>
                </p>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Input window</span>
                  <span className="font-semibold text-[#0b1728]">10 s × 12 leads</span>
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Learned feature emphasis (gradient saliency)
              </p>
              <ContributionBars contributions={cnn.contributions} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              1-D convolutional network over the raw 12-lead tensor (Conv1D → BatchNorm →
              ReLU → pooling blocks, global average pooling, dense sigmoid head) — learns
              morphology features directly instead of handcrafted voltages.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Consensus */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Cross-check with traditional criteria
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-[#e4eaf2] bg-[#f8fafd] p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Traditional headline</p>
            <p className="mt-1 text-sm font-semibold text-[#0b1728]">
              {selected.criteria.sokolowLyon.positive || selected.criteria.cornell.positive
                ? "At least one criterion positive"
                : "Both criteria negative"}
            </p>
          </div>
          <div className="rounded-lg border border-[#e4eaf2] bg-[#f8fafd] p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Model consensus</p>
            <p className="mt-1 text-sm font-semibold text-[#0b1728]">
              {perceptron.positive && cnn.positive
                ? "Both models above threshold"
                : !perceptron.positive && !cnn.positive
                  ? "Both models below threshold"
                  : "Models disagree"}
            </p>
          </div>
          <div className="rounded-lg border border-[#e4eaf2] bg-[#f8fafd] p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overall interpretation</p>
            <p className="mt-1 text-sm font-semibold capitalize text-[#0b1728]">{selected.interpretation}</p>
          </div>
          <div className="md:col-span-3 flex flex-wrap items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-xs text-muted-foreground">
              Research workflow: discordance between methods should trigger echocardiographic correlation.
            </p>
            <Button size="sm" variant="outline" className="ml-auto bg-white" onClick={() => onNavigate("comparison")}>
              <BrainCircuit className="h-4 w-4" aria-hidden /> Full model comparison
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
