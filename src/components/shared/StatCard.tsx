"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "blue",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "blue" | "cyan" | "navy" | "amber" | "green";
  className?: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-[#e9f0fa] text-[#174a8c]",
    cyan: "bg-cyan-50 text-cyan-700",
    navy: "bg-[#1c1917] text-cyan-300",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <Card className={cn("p-5 shadow-sm transition-shadow hover:shadow-md", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="sp-tabular mt-1.5 truncate text-2xl font-bold tracking-tight text-[#1c1917]">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </Card>
  );
}

export function SectionHeading({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#1c1917]">
          {Icon && <Icon className="h-5 w-5 text-[#1f63b8]" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
