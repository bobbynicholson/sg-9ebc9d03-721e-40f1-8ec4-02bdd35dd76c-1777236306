import * as React from "react";
import { ArrowUpRight, ArrowDownRight, Route } from "lucide-react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";

// Desk-panel shadow: layered and soft. A crisp 1px contact line plus a
// wide low-alpha ambient makes panels feel physically seated on the
// canvas without the floaty marketing-card look.
const SOFT_SHADOW =
  "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_16px_-8px_rgba(15,23,42,0.08),0_24px_48px_-24px_rgba(15,23,42,0.16)]";

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
        "relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#e9edf3_0%,#f6f8fb_320px,#f6f8fb_100%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_320px,#0f172a_100%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-950/10 dark:bg-white/10"
      />
      {/* Brand wash: a soft top band in the tenant's colours so every
          page opens with a hint of their identity, fading to neutral
          before the content grid starts. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,rgb(var(--brand-primary-rgb)/0.055),rgb(var(--brand-secondary-rgb)/0.02)_60%,transparent)] dark:opacity-20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(60%_120%_at_18%_0%,rgba(255,255,255,0.65),transparent_70%)] dark:hidden"
      />
      <div
        className={cn(
          "relative z-0 w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-9",
          width === "narrow" ? "mx-auto max-w-3xl" : "max-w-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Page header: title + optional subtitle, leading icon tile, and actions.
 *
 * `variant="hero"` swaps the underlined text header for a full-width command
 * band. Two appearances:
 * - `"brand"` (default on tenant surfaces): the band is PAINTED in the
 *   tenant's own colours - a primary→secondary gradient (the admin-chosen
 *   white-label palette) with a soft contrast scrim so white type stays
 *   legible on any brand hue. No fixed dark slate anywhere.
 * - `"dark"` (default on /admin/platform): the slate-950 command band that
 *   pairs with the super-admin forced-dark rail.
 * When `appearance` is omitted it resolves from the route: only the
 * super-admin platform pages get the dark slate band; every tenant surface
 * (company admin, account, team and client portals) carries the tenant
 * brand band. Actions render inside a scoped `dark` class so shadcn
 * outline/ghost controls pick dark styling on the band automatically.
 * `meta` is an optional chip row under the subtitle (live counts, badges). */
export function PortalHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
  variant = "default",
  appearance,
  meta,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
  variant?: "default" | "hero";
  /** Hero band paint: "brand" = tenant colours, "dark" = slate command
   *  band. Defaults by route (platform → dark, everything else → brand). */
  appearance?: "brand" | "dark";
  meta?: React.ReactNode;
}) {
  const router = useRouter();
  if (variant === "hero") {
    const pathname = router.pathname || "";
    const resolvedAppearance =
      appearance ?? (pathname.includes("/admin/platform") ? "dark" : "brand");
    const isBrand = resolvedAppearance === "brand";
    return (
      <header
        className={cn(
          "relative mb-7 overflow-hidden rounded-2xl border px-5 py-6 text-white sm:px-7 sm:py-7",
          isBrand
            ? "border-white/15 bg-[linear-gradient(130deg,rgb(var(--brand-primary-rgb)),rgb(var(--brand-secondary-rgb)))]"
            : "border-slate-800 bg-slate-950",
          SOFT_SHADOW,
          className,
        )}
      >
        {isBrand ? (
          <>
            {/* Contrast scrim: deepens the tenant colour just enough for
                white type without ever reading as a dark header. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.14),rgba(2,6,23,0.32))]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_150%_at_0%_0%,rgba(255,255,255,0.16),transparent_55%)]"
            />
          </>
        ) : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_150%_at_0%_0%,rgb(var(--brand-primary-rgb)/0.30),transparent_55%),radial-gradient(110%_140%_at_100%_0%,rgb(var(--brand-secondary-rgb)/0.18),transparent_60%)]"
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20"
        />
        <div className="relative space-y-5">
          <div className="flex min-w-0 items-start gap-4">
            {Icon && (
              <span className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white shadow-sm backdrop-blur-sm">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-brand-display text-balance text-[1.85rem] font-semibold leading-[1.1] tracking-tight sm:text-4xl">
                {title}
              </h1>
              {subtitle && (
                <p
                  className={cn(
                    "mt-2 max-w-4xl text-pretty text-sm leading-6",
                    isBrand ? "text-white/85" : "text-slate-300",
                  )}
                >
                  {subtitle}
                </p>
              )}
              {meta && (
                <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>
              )}
            </div>
          </div>
          {actions && (
            <div className="dark flex w-full max-w-full flex-wrap items-center justify-start gap-2 border-t border-white/10 pt-4 lg:justify-end">
              {actions}
            </div>
          )}
        </div>
      </header>
    );
  }
  return (
    <header
      className={cn(
        "relative mb-7 grid gap-4 border-b border-slate-300/70 pb-6 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/12 via-white to-brand-secondary/10 text-brand-primary shadow-sm dark:border-brand-primary/30 dark:from-brand-primary/15 dark:via-slate-900 dark:to-brand-secondary/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-brand-display text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-4xl text-pretty text-sm leading-6 text-slate-600 dark:text-slate-400">
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
      {/* Short brand accent seated on the divider - the one flourish
          each page carries, everything else stays neutral. */}
      <span
        aria-hidden="true"
        className="absolute -bottom-px left-0 h-[2px] w-24 rounded-full bg-gradient-to-r from-brand-primary via-brand-primary/70 to-transparent"
      />
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
        "!mb-7 flex items-center justify-between gap-3 text-xs",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200/90 bg-white/80 px-3 py-1.5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
        <Route className="h-3.5 w-3.5 shrink-0 text-brand-primary/70" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          <span className="truncate">{surface.scope}</span>
          {parent && <span className="text-slate-300 dark:text-slate-600">/</span>}
          {parent && <span className="truncate">{parent}</span>}
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="truncate font-semibold text-slate-950 dark:text-white">{page}</span>
        </div>
      </div>
      <span className="hidden shrink-0 rounded-full border border-slate-200/90 bg-white/80 px-3 py-1.5 font-medium uppercase tracking-wider text-slate-400 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-500 sm:inline-flex">
        {surface.area}
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
        "mb-6 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/95 sm:p-5",
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
        "rounded-xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/95",
        SOFT_SHADOW,
        interactive &&
          "cursor-pointer transition-[box-shadow,border-color,transform] duration-200 ease-standard hover:-translate-y-0.5 hover:border-brand-primary/30 hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_16px_32px_-16px_rgba(15,23,42,0.18),0_32px_64px_-32px_rgba(15,23,42,0.22)] dark:hover:border-brand-primary/40",
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
      <h2 className="flex items-center gap-2 text-sm font-semibold leading-5 tracking-normal text-slate-950 dark:text-white">
        <span aria-hidden="true" className="h-3.5 w-1 shrink-0 rounded-full bg-brand-primary/60" />
        {title}
      </h2>
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
        "group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/95",
        SOFT_SHADOW,
        className,
      )}
    >
      {/* Hairline brand tick in the top corner - reads as a designed
          object without shouting. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-[2px] w-10 rounded-br-full bg-gradient-to-r from-brand-primary/70 to-transparent"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/12 to-brand-secondary/8 text-brand-primary dark:border-brand-primary/30 dark:from-brand-primary/15 dark:to-brand-secondary/10 dark:text-brand-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-slate-950 dark:text-white sm:text-3xl">
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
