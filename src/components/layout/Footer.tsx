"use client";

import { HeartPulse } from "lucide-react";

export function Footer() {
  return (
    <footer className="no-print mt-auto border-t border-[#dfe6ef] bg-white">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide text-[#0b1728]">
              <HeartPulse className="h-4 w-4 text-[#1d6fbe]" aria-hidden />
              SPANDANA — AI Cardiac Intelligence
              <span className="ml-1 hidden text-[11px] font-medium italic text-muted-foreground sm:inline">
                “See Beyond the Heartbeat.”
              </span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              LVH screening from 10-second 12-lead ECGs. Not a certified medical
              diagnostic system and not a replacement for clinicians, ECG
              interpretation or echocardiography. Nothing here constitutes
              medical advice.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 text-[11px] text-muted-foreground md:items-end">
            <span className="rounded-full border border-[#dfe6ef] px-2 py-0.5">Not for clinical use</span>
            <span>v0.1.0 · FastAPI-ready</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
