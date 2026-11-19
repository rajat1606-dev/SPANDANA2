"use client";

import { ShieldAlert } from "lucide-react";
import { NAV_SECTIONS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/store/analyses";

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-xl bg-[#2a2320] ring-1 ring-[#38302b]",
        className,
      )}
    >
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
        <path
          d="M4 34 H18 L23 22 L31 46 L37 27 L41 34 H60"
          fill="none"
          stroke="#2a78d6"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function NavButton({
  item,
  current,
  onNavigate,
}: {
  item: NavItem;
  current: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  const active = current === item.id;
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors",
        active
          ? "bg-[#2a2320] font-semibold text-white"
          : "text-[#c7d3e2] hover:bg-[#2a2320]/60 hover:text-white",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#8ab4e8]" />
      )}
      <Icon
        className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#8ab4e8]" : "text-[#7d93ad] group-hover:text-[#a9bcd2]")}
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
      {item.hint && (
        <span
          className={cn(
            "ml-auto rounded-sm border px-1.5 py-0.5 text-[10px] font-medium",
            active ? "border-[#8ab4e8]/40 text-[#8ab4e8]" : "border-[#38302b] text-[#9a8f85]",
          )}
        >
          {item.hint}
        </span>
      )}
    </button>
  );
}

export function SidebarContent({
  current,
  onNavigate,
}: {
  current: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[#1c1917]">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <BrandMark />
        <div className="min-w-0">
          <p className="text-[17px] font-bold tracking-[0.14em] text-white">SPANDANA</p>
          <p className="truncate text-[11px] font-medium text-[#7d93ad]">
            AI Cardiac Intelligence
          </p>
        </div>
      </div>
      <div className="mx-5 mb-4 rounded-lg border border-[#38302b] bg-[#0e1d31] px-3 py-2">
        <p className="text-[11px] italic tracking-wide text-[#8ab4e8]/90">
          “See Beyond the Heartbeat.”
        </p>
      </div>

      {/* Navigation */}
      <nav className="sp-sidebar-scroll flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#5c7189]">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavButton key={item.id} item={item} current={current} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Safety notice */}
      <div className="border-t border-[#38302b] px-4 py-4">
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Not a medical device
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-[#9fb2c8]">
            Outputs must not be used for clinical decisions.
          </p>
        </div>
        <p className="mt-3 text-center text-[10px] text-[#5c7189]">
          SPANDANA v0.1.0
        </p>
      </div>
    </div>
  );
}

export function Sidebar({
  current,
  onNavigate,
}: {
  current: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
      <SidebarContent current={current} onNavigate={onNavigate} />
    </aside>
  );
}

export { BrandMark, ShieldAlert };
