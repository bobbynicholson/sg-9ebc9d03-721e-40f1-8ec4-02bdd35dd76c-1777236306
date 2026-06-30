/**
 * Two small components meant to be slotted into the top of every portal
 * sidebar's mobile Sheet:
 *
 * - MobileSearchTrigger: a tappable pill that fires the global Cmd+K
 *   palette. Cmd+K is great on desktop but unreachable on a phone, so we
 *   surface it as a button that dispatches a `cmdk:open` window event.
 *
 * - MobileQuickActions: 2-3 role-aware shortcut tiles for "the thing
 *   this person came here to do right now" - driver wants today's
 *   route, kitchen wants today's prep, shopping wants the alerts page,
 *   admin wants today's events. Tile-style so it's thumb-friendly.
 */
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";

export function MobileSearchTrigger({
  accent = "bg-slate-50 hover:bg-slate-100 text-slate-700",
  hint = "Search anywhere...",
}: { accent?: string; hint?: string }) {
  const fire = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("cmdk:open"));
  };
  return (
    <button
      type="button"
      onClick={fire}
      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${accent} transition-colors`}
    >
      <Search className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-left">{hint}</span>
      <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
        <span>⌘</span>
        K
      </kbd>
    </button>
  );
}

export interface QuickAction {
  href: string;
  label: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon tile background, e.g. "from-orange-500 to-rose-500". */
  accent?: string;
  onClick?: () => void;
}

export function MobileQuickActions({
  actions,
  onNavigate,
}: {
  actions: QuickAction[];
  /** Called after the user taps an action, so the drawer can close. */
  onNavigate?: () => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="mb-2">
      <p className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Quick actions
      </p>
      <div className={`grid gap-2 ${actions.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href + a.label}
              href={a.href}
              onClick={() => { a.onClick?.(); onNavigate?.(); }}
              className="flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${a.accent || "from-slate-500 to-slate-600"} flex items-center justify-center shadow-sm`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 w-full">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{a.label}</div>
                {a.sub && (
                  <div className="text-[10px] text-slate-500 truncate">{a.sub}</div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
