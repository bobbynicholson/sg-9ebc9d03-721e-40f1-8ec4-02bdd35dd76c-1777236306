import * as React from "react";
import { ArrowUpRight, ArrowDownRight, Route } from "lucide-react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";

// Desk-panel shadow: a tighter operational surface than the earlier
// floaty card treatment. It separates dense tools without making every
// page feel like a stack of marketing cards.
const SOFT_SHADOW =
  "shadow-[0_1px_1px_rgba(15,23,42,0.04),0_14px_28px_-24px_rgba(15,23,42,0.35)]";

/**
 * Shared container primitives for the staff portals. One definition so every
 * page's shell, header, cards and stat tiles are identical - consistent AND
 * a touch more refined (rounded-2xl, hairline borders, soft shadow, generous
 * padding, brand-driven icon tile and route strip). Product-register restraint:
 * tenant branding is the accent, slate is the neutral, dark-mode aware throughout.
 */

/** Page wrapper: neutral ground + responsive container. */
export function PortalShell({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * `default` = full desktop width (dashboards, lists, tables) - the shell
   * sits flush against the sidebar offset and uses the whole viewport so
   * there's no wasted empty rail; `narrow` = max-w-3xl, centred (settings
   * and single-column reading layouts that look wrong stretched wide).
   */
  width?: "default" | "narrow";
}) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_260px,#0f172a_100%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-950/10 dark:bg-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(90deg,rgb(var(--brand-primary-rgb)/0.012),rgb(var(--brand-secondary-rgb)/0.008),rgb(var(--brand-accent-rgb)/0.012))] dark:opacity-10"
      />
      <div
        className={cn(
          "relative z-0 w-full px-4 py-5 sm:px-6 sm:py-7 lg:px-8",
          width === "narrow" ? "mx-auto max-w-3xl" : "max-w-none",
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
    <header
      className={cn(
        "mb-6 grid gap-4 border-b border-slate-300/70 pb-5 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-brand-display text-balance text-[1.55rem] font-semibold leading-tight tracking-normal text-slate-950 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-4xl text-pretty text-sm leading-6 text-slate-600 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex w-full max-w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}

function humanizeSegment(segment: string) {
  if (!segment || segment.startsWith("[") || segment === "index") return "";
  return segment
    .replace(/\?.*$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function visibleRouteSegments(pathname: string) {
  const hidden = new Set(["admin", "account", "client-portal", "team-portal", "c"]);
  return pathname
    .split("/")
    .filter(Boolean)
    .filter((segment) => !hidden.has(segment) && !segment.startsWith("[") && segment !== "index");
}

function routeSurface(pathname: string) {
  if (pathname.includes("/admin/platform")) {
    return { scope: "Platform", area: "Internal" };
  }
  if (pathname.includes("/client-portal") || pathname.startsWith("/client/") || pathname.startsWith("/c/")) {
    return { scope: "Client", area: "Private" };
  }
  if (pathname.includes("/team-portal/kitchen")) {
    return { scope: "Kitchen", area: "Team" };
  }
  if (pathname.includes("/team-portal/driver")) {
    return { scope: "Driver", area: "Field" };
  }
  if (pathname.includes("/team-portal/waiter")) {
    return { scope: "Service", area: "Team" };
  }
  if (pathname.includes("/team-portal/shopping")) {
    return { scope: "Shopping", area: "Procurement" };
  }
  if (pathname.includes("/team-portal/cleaning")) {
    return { scope: "Cleaning", area: "Close-out" };
  }
  if (pathname.includes("/admin")) {
    return { scope: "Admin", area: "Tenant" };
  }
  if (pathname.includes("/account/")) {
    return { scope: "Account", area: "Personal" };
  }
  if (pathname.includes("/order/")) {
    return { scope: "Order", area: "Shared" };
  }
  return { scope: "Workspace", area: "Page" };
}

/** Page-level workbench strip mounted by route files below PortalHeader. */
export function PageWorkbench({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const pathname = router.pathname || "";
  const surface = routeSurface(pathname);
  const segments = visibleRouteSegments(pathname);
  const page = humanizeSegment(segments[segments.length - 1] || "dashboard") || "Dashboard";
  const parentCandidate = humanizeSegment(segments[segments.length - 2] || "");
  const parent = parentCandidate === surface.scope ? "" : parentCandidate;

  return (
    <nav
      aria-label="Page context"
      className={cn(
        "!mb-7 flex flex-col gap-2 border-b border-slate-200/80 pb-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Route className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
          <span className="truncate">{surface.scope}</span>
          {parent && <span className="text-slate-400">/</span>}
          {parent && <span className="truncate">{parent}</span>}
          <span className="text-slate-400">/</span>
          <span className="truncate text-slate-950 dark:text-white">{page}</span>
        </div>
      </div>
      <span className="truncate font-medium text-slate-500 dark:text-slate-400">
        {surface.area} - {pathname.replace(/\[(.*?)\]/g, ":$1")}
      </span>
    </nav>
  );
}

type PortalOverviewTone = "brand" | "neutral" | "success" | "warning" | "danger";

const OVERVIEW_TONES: Record<PortalOverviewTone, string> = {
  brand: "border-slate-300 bg-slate-50 text-slate-800 border-l-brand-primary dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:border-l-brand-primary",
  neutral: "border-slate-300 bg-slate-50 text-slate-700 border-l-slate-300 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:border-l-slate-600",
  success: "border-slate-300 bg-slate-50 text-slate-800 border-l-slate-300 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:border-l-slate-600",
  warning: "border-slate-300 bg-slate-50 text-slate-800 border-l-amber-400/70 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:border-l-amber-500/70",
  danger: "border-slate-300 bg-slate-50 text-slate-800 border-l-rose-400/70 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:border-l-rose-500/70",
};

export interface PortalOverviewItem {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: PortalOverviewTone;
}

/** Consistent first-screen summary band for role portals. */
export function PortalOverview({
  eyebrow,
  title,
  description,
  items,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  items?: PortalOverviewItem[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mb-6 rounded-lg border border-slate-300/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/95 sm:p-5",
        SOFT_SHADOW,
        className,
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 dark:text-white">
            {title}
          </h2>
          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              {description}
            </p>
          )}
          {actions && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>

        {items && items.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((item, index) => {
              const Icon = item.icon;
              const tone = item.tone || "neutral";
              return (
                <div
                  key={index}
                  className={cn(
                    "min-w-0 rounded-lg border border-l-2 px-3 py-3",
                    OVERVIEW_TONES[tone],
                  )}
                >
                  <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    <p className="truncate text-xs font-semibold">{item.label}</p>
                  </div>
                  <p className="mt-2 truncate text-xl font-semibold leading-none tabular-nums">
                    {item.value}
                  </p>
                  {item.helper && (
                    <p className="mt-1 line-clamp-2 text-xs leading-4 opacity-80">
                      {item.helper}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
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
        "rounded-lg border border-slate-300/80 bg-white dark:border-slate-800 dark:bg-slate-900/95",
        SOFT_SHADOW,
        interactive &&
          "cursor-pointer transition-[box-shadow,border-color,transform] duration-200 ease-standard hover:-translate-y-px hover:border-slate-400 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_18px_36px_-26px_rgba(15,23,42,0.45)] dark:hover:border-slate-700",
        padded && "p-4 sm:p-5",
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
    <div
      className={cn(
        "mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800",
        className,
      )}
    >
      <h2 className="text-sm font-semibold leading-5 tracking-normal text-slate-950 dark:text-white">{title}</h2>
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
        "rounded-lg border border-slate-300/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/95",
        SOFT_SHADOW,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold leading-4 text-slate-600 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-primary/20 bg-brand-primary/10 text-brand-primary dark:border-brand-primary/30 dark:bg-brand-primary/10 dark:text-brand-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none tracking-normal tabular-nums text-slate-950 dark:text-white sm:text-[1.75rem]">
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
                  : "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/10 dark:text-brand-primary",
            )}
          >
            {dir === "up" && <ArrowUpRight className="h-3 w-3" />}
            {dir === "down" && <ArrowDownRight className="h-3 w-3" />}
            {trend.label}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs leading-4 text-slate-600 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
