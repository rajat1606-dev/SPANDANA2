"use client";

import { useMemo } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  FlaskConical,
  Gauge,
  HeartPulse,
  ScanHeart,
  UploadCloud,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard, SectionHeading } from "@/components/shared/StatCard";
import { VerdictBadge } from "@/components/shared/badges";
import { LeadSparkline } from "@/components/ecg/EcgGrid";
import { useAnalysesStore, type ViewId } from "@/store/analyses";
import {
  CNN_HEADLINE,
  CNN_TRAINING_HISTORY,
  DATASET_STATS,
  MODEL_METRICS,
} from "@/lib/real-data";
import { formatDistanceToNow } from "date-fns";

const DONUT_COLORS = ["#0b1728", "#1d6fbe", "#089fbf", "#b45309"];

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const analyses = useAnalysesStore((s) => s.analyses);
  const selectAnalysis = useAnalysesStore((s) => s.selectAnalysis);

  const testLvhPct = (
    (DATASET_STATS.test.lvh / DATASET_STATS.test.total) *
    100
  ).toFixed(1);

  const outcomeSplit = useMemo(() => {
    const counts = { positive: 0, negative: 0, discordant: 0 };
    for (const a of analyses) counts[a.interpretation] += 1;
    return [
      { name: "No criteria met", value: counts.negative, key: "negative" },
      { name: "LVH pattern suspected", value: counts.positive, key: "positive" },
      { name: "Discordant", value: counts.discordant, key: "discordant" },
    ].filter((d) => d.value > 0);
  }, [analyses]);

  const recent = useMemo(
    () =>
      [...analyses]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 6),
    [analyses],
  );

  const aucData = MODEL_METRICS.map((m) => ({
    model: m.model,
    auc: Math.round(m.rocAuc * 100) / 100,
    family: m.family,
  }));

  const openAnalysis = (id: string, view: ViewId) => {
    selectAnalysis(id);
    onNavigate(view);
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-[#0b1728] text-white shadow-md">
        <div className="relative px-6 py-7 sm:px-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
                <FlaskConical className="h-3 w-3" aria-hidden /> Research prototype · PTB-XL results
              </Badge>
              <Badge variant="outline" className="hidden border-white/20 bg-white/5 text-white/80 sm:inline-flex">
                PTB-XL based workflow
              </Badge>
            </div>
            <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-[28px]">
              Screening Left Ventricular Hypertrophy from standard 12-lead ECGs
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#b9c8da]">
              SPANDANA compares classic voltage criteria (Sokolow–Lyon, Cornell) with
              Perceptron and CNN models on 10-second recordings. Every figure below is
              measured on PTB-XL — connect the FastAPI research backend to score your
              own recordings.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button
                className="bg-cyan-500 text-[#06212e] hover:bg-cyan-400"
                onClick={() => onNavigate("upload")}
              >
                <UploadCloud className="h-4 w-4" aria-hidden /> Upload ECG recording
              </Button>
              <Button
                variant="outline"
                className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => onNavigate("research")}
              >
                <BookOpen className="h-4 w-4" aria-hidden /> How the research works
              </Button>
            </div>
          </div>
          {/* Decorative ECG pulse */}
          <svg
            viewBox="0 0 600 160"
            className="pointer-events-none absolute -right-8 top-1/2 hidden h-40 w-[420px] -translate-y-1/2 opacity-30 lg:block"
            aria-hidden
          >
            <path
              d="M0 80 H120 L150 80 L165 40 L180 120 L195 55 L208 80 H320 L350 80 L365 30 L380 130 L395 50 L408 80 H600"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ScanHeart}
          label="PTB-XL recordings analysed"
          value={DATASET_STATS.totalUsed.toLocaleString()}
          sub={`${DATASET_STATS.excludedLowCertainty.toLocaleString()} low-certainty labels excluded`}
          tone="blue"
        />
        <StatCard
          icon={HeartPulse}
          label="LVH in held-out test fold"
          value={`${DATASET_STATS.test.lvh} (${testLvhPct}%)`}
          sub={`Of ${DATASET_STATS.test.total.toLocaleString()} recordings, cardiologist-confirmed`}
          tone="amber"
        />
        <StatCard
          icon={Activity}
          label="CNN detections on test fold"
          value={`${CNN_HEADLINE.caught}/${CNN_HEADLINE.ofPositives}`}
          sub={`${CNN_HEADLINE.falseAlarms} false alarms of ${CNN_HEADLINE.ofControls.toLocaleString()} controls`}
          tone="navy"
        />
        <StatCard
          icon={Gauge}
          label="Best ROC-AUC (PTB-XL test)"
          value={CNN_HEADLINE.rocAuc.toFixed(2)}
          sub="CNN · measured on PTB-XL test set"
          tone="cyan"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="shadow-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>CNN training history — validation (21 epochs)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={CNN_TRAINING_HISTORY} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="spAreaBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d6fbe" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#1d6fbe" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="spAreaCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#089fbf" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#089fbf" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf4" vertical={false} />
                <XAxis dataKey="epoch" tick={{ fontSize: 11, fill: "#5b6b7f" }} tickLine={false} axisLine={{ stroke: "#dfe6ef" }} interval="preserveStartEnd" />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "#5b6b7f" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, borderColor: "#dfe6ef", fontSize: 12 }}
                  labelStyle={{ fontWeight: 600, color: "#0b1728" }}
                />
                <Area type="monotone" dataKey="valAuroc" name="Validation ROC-AUC" stroke="#1d6fbe" strokeWidth={2} fill="url(#spAreaBlue)" />
                <Area type="monotone" dataKey="valAuprc" name="Validation PR-AUC" stroke="#089fbf" strokeWidth={2} fill="url(#spAreaCyan)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Workspace outcomes</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex h-[260px] flex-col">
            <ResponsiveContainer width="100%" height="70%">
              <PieChart>
                <Pie
                  data={outcomeSplit}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  strokeWidth={2}
                >
                  {outcomeSplit.map((entry, i) => (
                    <Cell key={entry.key} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dfe6ef", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="mt-1 space-y-1.5 text-xs text-muted-foreground">
              {outcomeSplit.map((entry, i) => (
                <li key={entry.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  {entry.name} — <span className="sp-tabular font-semibold text-[#0b1728]">{entry.value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Model performance + recent activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Model ROC-AUC (PTB-XL test set)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aucData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf4" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11, fill: "#5b6b7f" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="model" width={92} tick={{ fontSize: 11.5, fill: "#0b1728" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dfe6ef", fontSize: 12 }} cursor={{ fill: "#f1f5fa" }} />
                <Bar dataKey="auc" name="ROC-AUC" radius={[0, 5, 5, 0]} barSize={18}>
                  {aucData.map((d, i) => (
                    <Cell key={d.model} fill={i < 2 ? "#62a8e0" : i === 2 ? "#1d6fbe" : "#0b1728"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Full metric comparison in the{" "}
              <button className="font-medium text-[#1d6fbe] underline-offset-2 hover:underline" onClick={() => onNavigate("comparison")}>
                Model Comparison
              </button>{" "}
              module.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Recent activity</span>
              <Button variant="ghost" size="sm" className="text-[#1d6fbe] hover:text-[#14508f]" onClick={() => onNavigate("visualization")}>
                Open workspace <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-[#eef2f8] p-0">
            {recent.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openAnalysis(a.id, "visualization")}
                className="flex w-full items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-[#f6f9fc]"
              >
                <div className="w-28 shrink-0">
                  <p className="font-mono text-xs font-bold text-[#0b1728]">{a.meta.code}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.meta.sex === "Male" ? "Male" : "Female"}, {a.meta.age}
                  </p>
                </div>
                <div className="hidden w-40 sm:block">
                  <LeadSparkline waveform={a.waveform} className="h-9 w-full" />
                </div>
                <div className="hidden gap-1 md:flex">
                  <Badge variant="outline" className="bg-white text-[10.5px]">
                    SL {a.criteria.sokolowLyon.sum.toFixed(2)} mV
                  </Badge>
                  <Badge variant="outline" className="bg-white text-[10.5px]">
                    Cornell {a.criteria.cornell.sum.toFixed(2)} mV
                  </Badge>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <VerdictBadge verdict={a.interpretation} withLabel={false} />
                  <span className="hidden w-16 text-right text-[11px] text-muted-foreground lg:block">
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
