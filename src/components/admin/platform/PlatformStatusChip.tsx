import { cn } from "@/lib/utils";

/**
 * One status pill for the platform owner pages, so a subscription or
 * trial state reads the same on Companies, Subscriptions and Trials.
 * Colours follow the portal rule: green = fine, sky = info,
 * amber = needs attention, rose = urgent, slate = closed.
 */
export type PlatformTone = "good" | "info" | "warn" | "bad" | "muted";

const TONE_CLASS: Record<PlatformTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  warn: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  bad: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  muted: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const DOT_CLASS: Record<PlatformTone, string> = {
  good: "bg-emerald-500",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  muted: "bg-slate-400",
};

const SUBSCRIPTION: Record<string, { label: string; tone: PlatformTone }> = {
  active: { label: "Active", tone: "good" },
  trial: { label: "Trial", tone: "info" },
  past_due: { label: "Past due", tone: "warn" },
  suspended: { label: "Suspended", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
  canceled: { label: "Cancelled", tone: "muted" },
  churned: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export function PlatformChip({
  tone,
  children,
  className,
}: {
  tone: PlatformTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[tone])} />
      {children}
    </span>
  );
}

/** Subscription state ("active", "past_due", ...) as a readable pill. */
export function SubscriptionStatusChip({ status }: { status: string | null | undefined }) {
  const key = String(status || "").toLowerCase();
  const known = SUBSCRIPTION[key];
  const label = known?.label ?? (key ? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Unknown");
  return <PlatformChip tone={known?.tone ?? "muted"}>{label}</PlatformChip>;
}
