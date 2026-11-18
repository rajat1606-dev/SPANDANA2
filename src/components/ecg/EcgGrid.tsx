"use client";

/**
 * EcgGrid — classic 12-lead ECG rendering on standard ECG graph paper.
 * Waveforms are drawn as SVG polylines over a CSS millimetre-grid;
 * the vertical gain is auto-scaled (labelled) and the decimation keeps
 * QRS peaks crisp while staying DOM-friendly.
 */

import { useMemo } from "react";
import { decimateLead } from "@/lib/ecg/waveform";
import { LEAD_NAMES, type EcgWaveform, type LeadName } from "@/lib/ecg/types";
import "./ecg-paper.css";

const INK = "#14263c";

interface EcgGridProps {
  waveform: EcgWaveform;
  /** Subset of leads to display (default: all 12). */
  leads?: LeadName[];
  /** CSS grid columns classes; defaults to the classic 3-across on xl. */
  className?: string;
  /** Fixed trace colour (defaults to ECG ink). */
  color?: string;
  /** Draw animation for freshly generated traces. */
  animate?: boolean;
  /** Display gain note. */
  showScaleNote?: boolean;
  /** Overrides the default note text under the grid (provenance-aware). */
  note?: string;
}

export function EcgGrid({
  waveform,
  leads = [...LEAD_NAMES],
  className = "",
  color = INK,
  animate = false,
  showScaleNote = true,
  note,
}: EcgGridProps) {
  const rows = useMemo(() => {
    const maxAbs = Math.max(
      0.5,
      ...leads.flatMap((l) => {
        const s = waveform.leads[l] ?? [];
        let m = 0;
        for (let i = 0; i < s.length; i += 4) {
          const a = Math.abs(s[i]);
          if (a > m) m = a;
        }
        return [m];
      }),
    );
    // Auto gain: mV → px, clamped so tall LVH complexes still fit.
    const gain = Math.min(26, Math.max(13, 56 / maxAbs));

    return leads.map((lead) => {
      const samples = waveform.leads[lead] ?? [];
      const pts = decimateLead(samples, 620);
      const mid = 60;
      const points = pts
        .map((v, i) => `${(i / (pts.length - 1)) * 1000},${(mid - v * gain).toFixed(1)}`)
        .join(" ");
      return { lead, points };
    });
  }, [waveform, leads]);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ lead, points }) => (
          <div
            key={lead}
            className="ecg-paper relative overflow-hidden rounded-md border border-[#eed4d7]"
          >
            <span className="absolute left-2 top-1 z-10 rounded-sm bg-white/70 px-1 text-[11px] font-semibold tracking-wide text-[#7c2d34]">
              {lead}
            </span>
            <svg
              viewBox="0 0 1000 120"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label={`ECG lead ${lead} waveform`}
            >
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className={animate ? "sp-draw" : undefined}
              />
            </svg>
            {/* fixed aspect area */}
            <div className="h-28 sm:h-24 xl:h-[104px]" />
          </div>
        ))}
      </div>
      {(showScaleNote || note) && (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          {note ??
            "Display sweep 25 mm/s · auto-scaled gain (nominal 10 mm/mV) · rendered from measured voltages"}
        </p>
      )}
    </div>
  );
}

/** Compact single-lead sparkline for cards and lists (lead II by default). */
export function LeadSparkline({
  waveform,
  lead = "II",
  color = "#1d6fbe",
  className = "h-10 w-full",
  strokeWidth = 1.8,
}: {
  waveform: EcgWaveform;
  lead?: LeadName;
  color?: string;
  className?: string;
  strokeWidth?: number;
}) {
  const points = useMemo(() => {
    const pts = decimateLead(waveform.leads[lead] ?? [], 260);
    const maxAbs = Math.max(0.5, ...pts.map((v) => Math.abs(v)));
    const mid = 30;
    const gain = 24 / maxAbs;
    return pts
      .map((v, i) => `${(i / (pts.length - 1)) * 1000},${(mid - v * gain).toFixed(1)}`)
      .join(" ");
  }, [waveform, lead]);

  return (
    <svg
      viewBox="0 0 1000 60"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
