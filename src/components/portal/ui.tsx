import * as React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Soft, layered card shadow — a tight contact shadow plus a wide, faint
// ambient one. Reads as quiet depth, not a hard drop shadow.
const SOFT_SHADOW =
  "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)]";

/**
 * Shared container primitives for the staff portals. One definition so every
 * page's shell, header, cards and stat tiles are identical — consistent AND
 * a touch more refined (rounded-2xl, hairline borders, soft shadow, generous
 * padding, neutral icon tile with an amber glyph). Product-register restraint:
 * amber is the accent, slate is the neutral, dark-mode aware throughout.
 */

/** Page wrapper: neutral ground + centred responsive container. */
export function PortalShell({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** `default` = max-w-6xl (most pages); `narrow` = max-w-3xl (settings, single-column lists). */
  width?: "default" | "narrow";
}) {
  return (
    <div className={cn("min-h-screen bg-slate-50 dark:bg-slate-950", className)}>
      <div
        className={cn(
          "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8",
          width === "narrow" ? "max-w-3xl" : "max-w-6xl",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Page header: title + optional subtitle, leading icon tile, and actions. */
export function PortalHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-amber-500">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard panel/card. Set `interactive` for clickable rows/cards (hover lift). */
export function PortalCard({
  children,
  className,
  padded = true,
  interactive = false,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900",
        SOFT_SHADOW,
        interactive &&
          "cursor-pointer transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_16px_40px_-18px_rgba(15,23,42,0.22)] dark:hover:border-slate-700",
        padded && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Row at the top of a card: title + optional trailing action/link. */
export function PortalCardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
      {action}
    </div>
  );
}

/** Consistent KPI / stat block. Optional `trend` shows a small up/down chip. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Small trend chip, e.g. {label: "+12%", dir: "up"}. */
  trend?: { label: React.ReactNode; dir?: "up" | "down" | "flat" };
  className?: string;
}) {
  const dir = trend?.dir ?? "up";
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900",
        SOFT_SHADOW,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-slate-900 dark:text-white">
          {value}
        </p>
        {trend && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
              dir === "down"
                ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                : dir === "flat"
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
            )}
          >
            {dir === "up" && <ArrowUpRight className="h-3 w-3" />}
            {dir === "down" && <ArrowDownRight className="h-3 w-3" />}
            {trend.label}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
