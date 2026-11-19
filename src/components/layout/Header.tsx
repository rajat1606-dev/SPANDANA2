"use client";

import { useEffect, useState } from "react";
import { Menu, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarContent } from "@/components/layout/Sidebar";
import { VIEW_META } from "@/lib/nav";
import { checkBackendHealth, type BackendStatus } from "@/lib/api";
import type { ViewId } from "@/store/analyses";
import { cn } from "@/lib/utils";

function BackendChip({ status }: { status: BackendStatus | null }) {
  const connected = !!status?.reachable;
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex",
        connected
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}
      title={
        connected
          ? "FastAPI research backend reachable — real inference will be used."
          : "FastAPI backend not connected. Voltage criteria still work; model predictions are unavailable."
      }
    >
      <span
        className={cn(
          "sp-pulse-dot h-1.5 w-1.5 rounded-full",
          connected ? "bg-emerald-500" : "bg-amber-500",
        )}
        aria-hidden
      />
      {connected ? "FastAPI connected" : "FastAPI offline"}
    </span>
  );
}

export function Header({
  view,
  onNavigate,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<BackendStatus | null>(null);

  useEffect(() => {
    let alive = true;
    checkBackendHealth().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const meta = VIEW_META[view];

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#e0dad1] bg-white/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-0 bg-[#1c1917] p-0">
            <SheetHeader className="border-b border-[#38302b] px-4 py-3">
              <SheetTitle className="text-left text-xs font-medium tracking-widest text-[#7d93ad]">
                SPANDANA NAVIGATION
              </SheetTitle>
              <SheetDescription className="sr-only">
                Primary navigation for the SPANDANA research modules
              </SheetDescription>
            </SheetHeader>
            <div className="h-[calc(100%-56px)]">
              <SidebarContent
                current={view}
                onNavigate={(v) => {
                  onNavigate(v);
                  setOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#1f63b8]">
            {meta.module} · SPANDANA Research Platform
          </p>
          <h1 className="truncate text-lg font-bold text-[#1c1917] sm:text-xl">{meta.title}</h1>
        </div>

        <BackendChip status={status} />
        <Button
          size="sm"
          className="hidden bg-[#1c1917] text-white hover:bg-[#2a2320] md:inline-flex"
          onClick={() => onNavigate("upload")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          New Analysis
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="md:hidden"
          aria-label="New analysis"
          onClick={() => onNavigate("upload")}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Persistent safety strip */}
      <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50/70 px-4 py-1.5 sm:px-6 lg:px-8">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        <p className="truncate text-[11px] text-amber-800">
          Not a certified diagnostic system. Do not use for clinical decisions; outputs do not replace ECG interpretation, echocardiography or medical judgment.
        </p>
      </div>
    </header>
  );
}
