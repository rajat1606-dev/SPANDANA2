"use client";

/**
 * Signal Visualization — full 12-lead ECG display with lead labels,
 * a rhythm strip and the measured per-lead QRS amplitudes.
 */

import { useState } from "react";
import { Activity, Grid3x3, Info, Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AnalysisMetaRow, AnalysisSelector } from "@/components/shared/AnalysisSelector";
import { SignalOriginBadge } from "@/components/shared/badges";
import { SectionHeading } from "@/components/shared/StatCard";
import { EcgGrid } from "@/components/ecg/EcgGrid";
import { useAnalysesStore, useSelectedAnalysis } from "@/store/analyses";
import type { LeadName } from "@/lib/ecg/types";
import { cn } from "@/lib/utils";

const CRITERIA_LEADS: LeadName[] = ["V1", "V3", "V5", "V6", "aVL"];

export function VisualizationView({ onNavigate }: { onNavigate: (v: "criteria") => void }) {
  const analyses = useAnalysesStore((s) => s.analyses);
  const selected = useSelectedAnalysis();
  const [showAll, setShowAll] = useState(true);

  if (!selected) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground shadow-sm">
        No recording available. Upload a recording or pick one from the PTB-XL library.
      </Card>
    );
  }

  const decoded = selected.meta.signalOrigin === "decoded-file";
  const leads = showAll ? undefined : (["I", "II", "V1", "V5"] as LeadName[]);
  const hrLabel = selected.spec.bpm > 0 ? `${selected.spec.bpm} bpm` : "n/a";
  const hrSub =
    selected.waveform.hrSource === "detected"
      ? "detected"
      : selected.waveform.hrSource === "unavailable"
        ? "not detectable"
        : "configured";

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-5">
        {/* Selection + meta */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AnalysisSelector
            value={selected.id}
            analyses={analyses}
            onChange={(id) => useAnalysesStore.getState().selectAnalysis(id)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("cursor-default bg-white", showAll && "border-[#1d6fbe] text-[#14508f]")}
            >
              12-lead layout
            </Badge>
            <SignalOriginBadge meta={selected.meta} />
          </div>
        </div>

        <AnalysisMetaRow analysis={selected} />

        {/* Full 12-lead grid */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Grid3x3 className="h-5 w-5 text-[#1d6fbe]" aria-hidden />
                {showAll ? "Standard 12-lead display" : "Key-lead display"} — {selected.meta.code}
              </span>
              <span className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-7 bg-white text-xs", showAll && "border-[#1d6fbe] text-[#14508f]")}
                  onClick={() => setShowAll(true)}
                >
                  All 12 leads
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-7 bg-white text-xs", !showAll && "border-[#1d6fbe] text-[#14508f]")}
                  onClick={() => setShowAll(false)}
                >
                  Key leads
                </Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EcgGrid
              waveform={selected.waveform}
              leads={leads}
              animate
              note={
                decoded
                  ? "Display sweep auto-scaled · signal decoded from the uploaded file (real samples)"
                  : "Display sweep 25 mm/s · auto-scaled gain (nominal 10 mm/mV) · rendered from measured voltages"
              }
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
          {/* Rhythm strip */}
          <Card className="shadow-sm xl:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-[#1d6fbe]" aria-hidden />
                Rhythm strip — Lead II ({selected.waveform.durationSec % 1 === 0 ? selected.waveform.durationSec.toFixed(0) : selected.waveform.durationSec.toFixed(1)} s)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EcgGrid
                waveform={selected.waveform}
                leads={["II"]}
                showScaleNote={false}
                className="[&>div]:grid-cols-1"
              />
              <div className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                {[
                  { label: `Heart rate (${hrSub})`, value: hrLabel },
                  {
                    label: selected.waveform.hrSource === "config" ? "Beats in window" : "R peaks detected",
                    value: String(selected.waveform.beats.length),
                  },
                  { label: "Duration", value: `${selected.waveform.durationSec.toFixed(1)} s` },
                  { label: "Sampling", value: `${selected.waveform.sampleRate} Hz` },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-[#e4eaf2] bg-[#f8fafd] px-3 py-2.5">
                    <p className="sp-tabular text-lg font-bold text-[#0b1728]">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Measured amplitudes */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ruler className="h-5 w-5 text-[#1d6fbe]" aria-hidden /> Measured amplitudes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[420px] overflow-y-auto sp-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Lead</TableHead>
                      <TableHead className="text-right">R (mV)</TableHead>
                      <TableHead className="text-right pr-6">S (mV)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Object.entries(selected.waveform.amplitudes) as [LeadName, { r: number; s: number }][]).map(
                      ([lead, amp]) => {
                        const critical = CRITERIA_LEADS.includes(lead);
                        return (
                          <TableRow key={lead} className={critical ? "bg-[#e6f2fb]/50" : undefined}>
                            <TableCell className="pl-6 font-mono text-xs font-semibold">
                              {lead}
                              {critical && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="ml-1.5 inline h-3 w-3 text-[#1d6fbe]" aria-label="Used by voltage criteria" />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">
                                    This lead feeds the Sokolow–Lyon / Cornell calculation.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="sp-tabular text-right">{amp.r.toFixed(2)}</TableCell>
                            <TableCell className="sp-tabular text-right pr-6">{amp.s.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      },
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-[#eef2f8] px-6 py-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Highlighted rows feed the voltage criteria.{" "}
                  <button className="font-medium text-[#1d6fbe] hover:underline" onClick={() => onNavigate("criteria")}>
                    Open Traditional Analysis →
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <SectionHeading
          title="About this signal"
          description={
            decoded
              ? "Traces are rendered from the signal decoded in-browser from the uploaded recording (auto-scaled for display). Amplitudes are measured globally against the median baseline — a deliberately simple research measurement, not a clinical interpretation."
              : "This trace is rendered at 500 Hz over 10 seconds from the recording’s measured QRS voltages — PTB-XL’s raw signal archive is not bundled with this build, so the morphology is illustrative while the voltages driving both criteria are the dataset’s own. Uploaded recordings are decoded in-browser from a CSV matrix or PhysioNet-style .dat/.hea record and show real samples."
          }
        />
      </div>
    </TooltipProvider>
  );
}
