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
    blue: "text-[#1f63b8]",
    cyan: "text-[#1f63b8]",
    navy: "text-[#6b6158]",
    amber: "text-amber-700",
    green: "text-emerald-700",
  };
  return (
    <Card className={cn("p-5", className)}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", tones[tone])} aria-hidden />
        {label}
      </p>
      {/* Proportional figures: tabular-nums is for columns, not display values. */}
      <p className="mt-2 truncate text-[26px] font-semibold leading-none tracking-tight text-[#1c1917]">
        {value}
      </p>
      {sub && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{sub}</p>}
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
