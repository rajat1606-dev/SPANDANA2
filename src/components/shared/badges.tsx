"use client";

/**
 * Shared semantic badges that make the provenance of every figure
 * explicit, so nothing can be mistaken for a clinical result.
 */

import { Badge } from "@/components/ui/badge";
import { FlaskConical, TriangleAlert, CheckCircle2, MinusCircle, Shuffle, Database, UploadCloud, Cpu, Gauge, FileSearch } from "lucide-react";
import type { Interpretation, PatientMeta } from "@/lib/ecg/types";
import { cn } from "@/lib/utils";

/**
 * Caution badge for a figure that is derived or approximated rather than
 * measured directly (for example a curve shape reconstructed from an AUC).
 */
export function ApproximationBadge({
  className,
  children = "Approximated",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-amber-300 bg-amber-50 font-medium text-amber-800",
        className,
      )}
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      {children}
    </Badge>
  );
}

/**
 * Signal provenance: a decoded uploaded recording (real samples parsed
 * in-browser) versus a trace rendered from a PTB-XL recording's measured
 * voltages. Model outputs are labelled separately — decoding is
 * measurement, not inference.
 */
export function SignalOriginBadge({ meta }: { meta: PatientMeta }) {
  if (meta.signalOrigin === "decoded-file") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-300 bg-emerald-50 font-medium text-emerald-800"
      >
        <FileSearch className="h-3 w-3" aria-hidden />
        Decoded from file
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-sky-300 bg-sky-50 font-medium text-sky-800"
    >
      <Database className="h-3 w-3" aria-hidden />
      Rendered from measured voltages
    </Badge>
  );
}

const verdictStyles: Record<Interpretation, { cls: string; icon: React.ElementType; label: string }> = {
  positive: {
    cls: "border-red-200 bg-red-50 text-red-700",
    icon: TriangleAlert,
    label: "LVH pattern suspected",
  },
  negative: {
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
    label: "No voltage criteria met",
  },
  discordant: {
    cls: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Shuffle,
    label: "Discordant results",
  },
};

export function VerdictBadge({
  verdict,
  className,
  withLabel = true,
}: {
  verdict: Interpretation;
  className?: string;
  withLabel?: boolean;
}) {
  const s = verdictStyles[verdict];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1 text-xs font-semibold", s.cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {withLabel ? s.label : verdict.toUpperCase()}
    </Badge>
  );
}

export function CriterionPill({ positive }: { positive: boolean }) {
  return positive ? (
    <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
      <TriangleAlert className="h-3 w-3" aria-hidden /> Positive
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
      <MinusCircle className="h-3 w-3" aria-hidden /> Negative
    </Badge>
  );
}

export function SourceBadge({ meta }: { meta: PatientMeta }) {
  return meta.source === "ptbxl-library" ? (
    <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-700">
      <Database className="h-3 w-3" aria-hidden /> PTB-XL library
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-800">
      <UploadCloud className="h-3 w-3" aria-hidden /> Uploaded file
    </Badge>
  );
}

export function ModelChip({ model }: { model: "perceptron" | "cnn" }) {
  const isP = model === "perceptron";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0b1728]">
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md",
          isP ? "bg-[#e6f2fb] text-[#14508f]" : "bg-cyan-50 text-cyan-700",
        )}
      >
        {isP ? <Cpu className="h-4 w-4" aria-hidden /> : <Gauge className="h-4 w-4" aria-hidden />}
      </span>
      {isP ? "Perceptron" : "CNN"}
    </span>
  );
}
