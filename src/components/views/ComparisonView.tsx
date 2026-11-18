"use client";

/**
 * Model Comparison — Sokolow–Lyon vs Cornell vs Perceptron vs CNN across
 * accuracy, precision, sensitivity, specificity, F1-score, ROC-AUC (and
 * PR-AUC when provided).
 *
 * When the FastAPI backend is reachable the evaluation metrics (PTB-XL,
 * patient-wise test fold 10) are fetched live from
 * GET /api/v1/models/metrics, together with the measured ROC/PR curves.
 * Otherwise the table falls back to the SAME measured results bundled with
 * this build (MODEL_METRICS, copied from backend/models/metrics.json) — the
 * numbers are real either way; only the ROC curve shapes are then
 * approximated from the measured AUCs.
 */

import { useEffect, useMemo, useState } from "react";
import { GitCompare, LineChart as LineChartIcon, Plug, Table2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DemoDataBadge } from "@/components/shared/badges";
import { MODEL_METRICS } from "@/lib/demo-data";
import { rocCurveFromAuc } from "@/lib/stats";
import { fetchModelMetrics, type BackendModelMetric } from "@/lib/api";

const METRIC_COLS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "precision", label: "Precision" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "specificity", label: "Specificity" },
  { key: "f1", label: "F1-score" },
  { key: "rocAuc", label: "ROC-AUC" },
] as const;

const MODEL_COLORS: Record<string, string> = {
  "Sokolow–Lyon": "#7fb3e3",
  Cornell: "#089fbf",
  Perceptron: "#1d6fbe",
  CNN: "#0b1728",
};

const ROC_CURVES = [
  { model: "Sokolow–Lyon", color: "#7fb3e3" },
  { model: "Cornell", color: "#089fbf" },
  { model: "Perceptron", color: "#1d6fbe" },
  { model: "CNN", color: "#0b1728" },
];

const METRIC_DEFINITIONS: { term: string; text: string }[] = [
  { term: "Accuracy", text: "Share of all recordings classified correctly." },
  { term: "Precision", text: "Of recordings flagged LVH, how many truly have LVH." },
  { term: "Sensitivity", text: "Of truly LVH recordings, how many the method detects (recall)." },
  { term: "Specificity", text: "Of truly non-LVH recordings, how many are correctly cleared." },
  { term: "F1-score", text: "Harmonic mean of precision and sensitivity." },
  { term: "ROC-AUC", text: "Area under the ROC curve — ranking ability across thresholds." },
  { term: "PR-AUC", text: "Area under the precision-recall curve — ranking quality on the "
      + "rare-positive class; the fairest single number under heavy class imbalance." },
];

/** Curve sources for the ROC panel: backend curves when present, else
 *  binormal approximations derived from each model's ROC-AUC. */
const CURVE_KEYS: Record<string, string> = {
  "Sokolow–Lyon": "sokolow",
  Cornell: "cornell",
  Perceptron: "perceptron",
  CNN: "cnn",
};

export function ComparisonView() {
  const [realMetrics, setRealMetrics] = useState<BackendModelMetric[] | null>(null);
  const [realMeta, setRealMeta] = useState<
    import("@/lib/api").MetricsResponse["meta"]
  >(undefined);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchModelMetrics().then((res) => {
      if (!live) return;
      if (res && res.metrics.length > 0) {
        setRealMetrics(res.metrics);
        setRealMeta(res.meta);
        setFetchError(null);
      } else {
        setFetchError("backend offline or no metrics yet");
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const realCurves = realMeta?.roc_pr_curves;
  const realMetricsGenerated = realMeta?.generated ?? "";

  const metrics: BackendModelMetric[] = realMetrics
    ?? MODEL_METRICS.map((m) => ({ ...m }));
  const hasPrAuc = realMetrics?.every((m) => typeof m.prAuc === "number") ?? false;
  const metricCols = useMemo(
    () => [
      ...METRIC_COLS,
      ...(hasPrAuc ? [{ key: "prAuc" as const, label: "PR-AUC" }] : []),
    ],
    [hasPrAuc],
  );

  const rocData = useMemo(() => {
    const curves = ROC_CURVES.map((c) => {
      const src = realCurves?.[CURVE_KEYS[c.model]]?.roc;
      const points =
        src && src.fpr.length > 0
          ? src.fpr.map((f, i) => ({ fpr: f, tpr: src.tpr[i] ?? 0 }))
          : rocCurveFromAuc(
              metrics.find((m) => m.model === c.model)?.rocAuc ?? 0.5,
            );
      return { ...c, points };
    });
    // Merge into row objects keyed by model for Recharts.
    const fprs = Array.from(
      new Set(curves.flatMap((c) => c.points.map((p) => p.fpr))),
    ).sort((a, b) => a - b);
    return fprs.map((fpr) => {
      const row: Record<string, number> = { fpr };
      for (const c of curves) {
        const nearest = c.points.reduce((best, p) =>
          Math.abs(p.fpr - fpr) < Math.abs(best.fpr - fpr) ? p : best,
        );
        row[c.model] = nearest.tpr;
      }
      return row;
    });
  }, [realCurves, metrics]);

  const groupedData = useMemo(
    () =>
      metricCols.map((col) => {
        const row: Record<string, string | number> = { metric: col.label };
        for (const m of metrics) row[m.model] = m[col.key] ?? 0;
        return row;
      }),
    [metricCols, metrics],
  );

  const bestByColumn = useMemo(() => {
    const best: Record<string, string> = {};
    for (const col of metricCols) {
      let bestModel = "";
      let bestVal = -1;
      for (const m of metrics) {
        const v = m[col.key] ?? 0;
        if (v > bestVal) {
          bestVal = v;
          bestModel = m.model;
        }
      }
      best[col.key] = bestModel;
    }
    return best;
  }, [metricCols, metrics]);

  return (
    <div className="space-y-5">
      {/* Metrics table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Table2 className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Validation metrics by method
            </span>
            {realMetrics ? (
              <Badge className="bg-emerald-600">
                Real evaluation — PTB-XL test fold 10
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-sky-300 bg-sky-50 font-medium text-sky-800"
              >
                Measured — PTB-XL test fold 10 (bundled snapshot)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                {metricCols.map((c) => (
                  <TableHead key={c.key} className="text-right">
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.model}>
                  <TableCell className="font-semibold text-[#0b1728]">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: MODEL_COLORS[m.model] }} />
                      {m.model}
                    </span>
                  </TableCell>
                  {metricCols.map((c) => {
                    const isBest = bestByColumn[c.key] === m.model;
                    return (
                      <TableCell
                        key={c.key}
                        className={`sp-tabular text-right ${isBest ? "bg-[#e6f2fb] font-bold text-[#14508f]" : ""}`}
                      >
                        {(m[c.key] ?? 0).toFixed(2)}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <Badge variant="outline" className="bg-white text-[10.5px]">
                      {m.family === "criterion" || (m.family === undefined && (m.model === "Sokolow–Lyon" || m.model === "Cornell"))
                        ? "Voltage criterion"
                        : "ML model"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Highlighted cells mark the best value per column.{" "}
            {realMetrics ? (
              <>
                Values are the REAL SPANDANA results: patient-wise test split
                (strat_fold 10) of PTB-XL v1.0.3, thresholds tuned on validation
                fold 9 only. Labels are SCP ECG statements, not echo-confirmed
                diagnoses. Generated {realMetricsGenerated}.
              </>
            ) : (
              <>
                Values are the measured SPANDANA results bundled with this build
                (<code className="rounded bg-[#f1f5fa] px-1 font-mono">backend/models/metrics.json</code>):
                patient-wise test split (strat_fold 10) of PTB-XL v1.0.3, thresholds
                tuned on validation fold 9 only. Labels are SCP ECG statements, not
                echo-confirmed diagnoses. Connect the backend to serve them live,
                with measured ROC curves and PR-AUC.
              </>
            )}{" "}
            Source: <code className="rounded bg-[#f1f5fa] px-1 font-mono">GET /api/v1/models/metrics</code>.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Grouped bars */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitCompare className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Metric profile comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupedData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf4" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 10.5, fill: "#5b6b7f" }} tickLine={false} axisLine={{ stroke: "#dfe6ef" }} interval={0} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "#5b6b7f" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dfe6ef", fontSize: 12 }} cursor={{ fill: "#f1f5fa" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                {metrics.map((m) => (
                  <Bar key={m.model} dataKey={m.model} fill={MODEL_COLORS[m.model]} radius={[3, 3, 0, 0]} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ROC curves */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5 text-[#1d6fbe]" aria-hidden />{" "}
                {realCurves
                  ? "ROC curves (measured — test fold 10)"
                  : "ROC curves (binormal, approximated from measured AUC)"}
              </span>
              {realCurves ? (
                <Badge className="bg-emerald-600">REAL</Badge>
              ) : (
                <DemoDataBadge>Curve shape approximated</DemoDataBadge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rocData} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf4" />
                <XAxis
                  dataKey="fpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: "#5b6b7f" }}
                  tickLine={false}
                  axisLine={{ stroke: "#dfe6ef" }}
                  label={{ value: "False positive rate", position: "insideBottom", offset: -4, fontSize: 11, fill: "#5b6b7f" }}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: "#5b6b7f" }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "True positive rate", angle: -90, position: "insideLeft", offset: 18, fontSize: 11, fill: "#5b6b7f" }}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, borderColor: "#dfe6ef", fontSize: 12 }}
                  formatter={(value: number, name: string) => [value.toFixed(3), name]}
                  labelFormatter={(l) => `FPR ${Number(l).toFixed(2)}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" iconSize={14} />
                {ROC_CURVES.map((c) => (
                  <Line
                    key={c.model}
                    type="monotone"
                    dataKey={c.model}
                    stroke={c.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Definitions + integration note */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Metric definitions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {METRIC_DEFINITIONS.map((d) => (
              <div key={d.term} className="rounded-lg border border-[#e4eaf2] bg-[#f8fafd] px-3.5 py-2.5">
                <p className="text-xs font-bold text-[#0b1728]">{d.term}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{d.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-[#bfe0f2] bg-[#f4f9fd] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Live metrics integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
            {realMetrics ? (
              <>
                <p>
                  Live data from the FastAPI backend
                  {realMeta?.dataset ? ` — ${realMeta.dataset}` : ""}.
                  {realMeta?.test_split ? ` ${realMeta.test_split}.` : ""}
                </p>
                {fetchError ? (
                  <p className="rounded-md bg-white p-2.5 text-[11.5px]">{fetchError}</p>
                ) : null}
                <p className="rounded-md bg-white p-2.5 text-[11.5px]">
                  Regenerate the numbers with{" "}
                  <code className="rounded bg-[#f1f5fa] px-1 font-mono">python training/evaluate_all.py</code>{" "}
                  after re-training the models.
                </p>
              </>
            ) : (
              <>
                <p>
                  The table above uses the measured results bundled with this build
                  {fetchError ? ` (${fetchError})` : ""}. Connect the FastAPI backend
                  to serve them live, along with measured ROC curves and PR-AUC:
                </p>
                <ol className="ml-4 list-decimal space-y-1.5 text-[12.5px]">
                  <li>
                    Train the models: <code className="rounded bg-white px-1 font-mono">python training/train_perceptron.py</code>,{" "}
                    <code className="rounded bg-white px-1 font-mono">python training/train_cnn.py</code>.
                  </li>
                  <li>
                    Evaluate: <code className="rounded bg-white px-1 font-mono">python training/evaluate_all.py</code>{" "}
                    → serves <code className="rounded bg-white px-1 font-mono">GET /api/v1/models/metrics</code>.
                  </li>
                  <li>
                    Set <code className="rounded bg-white px-1 font-mono">NEXT_PUBLIC_FASTAPI_URL</code> and restart.
                  </li>
                </ol>
                <p className="rounded-md bg-white p-2.5 text-[11.5px]">
                  Until then the metrics shown are the committed snapshot of the real
                  evaluation; only the ROC curve shapes on this page are approximated.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
