"use client";

/**
 * AnalysisSelector — shared dropdown for picking the active recording,
 * plus a patient meta chip row. Used across the analysis modules so the
 * "which recording am I looking at?" context is always explicit.
 */

import { useAnalysesStore } from "@/store/analyses";
import { SourceBadge, SignalOriginBadge } from "@/components/shared/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { EcgAnalysis } from "@/lib/ecg/types";

export function AnalysisSelector({
  value,
  onChange,
  analyses,
}: {
  value: string | null;
  onChange: (id: string) => void;
  analyses: EcgAnalysis[];
}) {
  const hrLabel = (a: EcgAnalysis) =>
    a.spec.bpm > 0 ? `${a.spec.bpm} bpm` : "HR n/a";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value ?? undefined}
        onValueChange={onChange}
        aria-label="Select ECG recording"
      >
        <SelectTrigger className="w-[260px] bg-white">
          <SelectValue placeholder="Select recording" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {analyses.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold">{a.meta.code}</span>
                <span className="text-xs text-muted-foreground">
                  {a.meta.sex === "Male" ? "M" : "F"} {a.meta.age} · {hrLabel(a)}
                  {a.meta.source === "file-upload" ? " · upload" : ""}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AnalysisMetaRow({ analysis }: { analysis: EcgAnalysis }) {
  const wf = analysis.waveform;
  const duration =
    wf.durationSec % 1 === 0 ? wf.durationSec.toFixed(0) : wf.durationSec.toFixed(1);
  const hrLabel =
    analysis.spec.bpm > 0
      ? `${analysis.spec.bpm} bpm`
      : "HR not detectable";
  const hrTitle =
    analysis.waveform.hrSource === "detected"
      ? "Heart rate detected from the decoded signal with a fixed-threshold R-peak detector."
      : analysis.waveform.hrSource === "unavailable"
        ? "No reliable R-peak detection on this recording — heart rate is not displayed rather than invented."
        : "Nominal heart rate used to render the trace from the measured voltages.";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="secondary" className="font-mono text-[11px]">
        {analysis.meta.code}
      </Badge>
      <Badge variant="outline" className="bg-white">
        {analysis.meta.sex}, {analysis.meta.age} yrs
      </Badge>
      <Badge variant="outline" className="bg-white" title={hrTitle}>
        {hrLabel}
      </Badge>
      <Badge variant="outline" className="bg-white">
        {duration} s · 12-lead · {wf.sampleRate} Hz
      </Badge>
      <SourceBadge meta={analysis.meta} />
      <SignalOriginBadge meta={analysis.meta} />
      <span className="text-muted-foreground">
        {format(new Date(analysis.createdAt), "dd MMM yyyy, HH:mm")}
      </span>
    </div>
  );
}
