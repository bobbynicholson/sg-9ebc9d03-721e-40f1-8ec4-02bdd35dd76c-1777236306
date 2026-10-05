/**
 * Collapsible nav section - one accordion group inside a sidebar.
 *
 * Used by AdminNav, PlatformNav, and any other portal nav that has more
 * than ~6 items so the user can hide groups they don't need today.
 *
 * Behaviour:
 * - Open state is in-memory only. We deliberately do NOT persist user
 *   toggles to localStorage. Bobby called this out as "the menu shouldn't
 *   stick" - once a user opens a section, navigating away should reset
 *   it back to the section's smart default on the next page load. The
 *   storageKey prop is kept for backwards compatibility but unused.
 * - `defaultOpen` controls the section's open state on every mount.
 * - The active route opens its group initially. A user's explicit toggle
 *   wins until the parent resets the group on a pathname change.
 * - Sidebar-collapsed state (the icon-only mode) hides section headers
 *   entirely and renders items flat - no accordion, just tooltips.
 */
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleNavSectionProps {
  title: string;
  /** Kept for backwards compatibility with existing callers. No longer
   *  used now that section state is in-memory only. */
  storageKey?: string;
  /** Whether the section is open on every fresh page load. */
  defaultOpen?: boolean;
  /** When true, render flat with no header / no accordion control. Used
   *  when the parent sidebar is in icon-only collapsed mode. */
  flatMode?: boolean;
  /** Open the active route's group initially; explicit toggles still win. */
  containsActiveRoute?: boolean;
  /** Brand-painted sidebars need light section headers on top of the
   *  tenant gradient instead of the neutral slate labels. */
  brandMode?: boolean;
  children: React.ReactNode;
}

export function CollapsibleNavSection({
  title,
  storageKey: _storageKey,
  defaultOpen = false,
  flatMode = false,
  containsActiveRoute = false,
  brandMode = false,
  children,
}: CollapsibleNavSectionProps) {
  void _storageKey;

  // In-memory only. Each mount starts at the section's defaultOpen state;
  // we don't persist the user's manual toggles. This is intentional so
  // navigating between pages always resets the menu to its smart defaults.
  const bodyId = useId();
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  // The active route supplies the initial state; explicit user toggles win.
  const open = userOpen ?? (containsActiveRoute || defaultOpen);

  if (flatMode) {
    return <div className="space-y-1">{children}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        className={cn(
          "w-full min-h-10 flex items-center justify-between mt-2 mb-1 rounded-lg px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
          brandMode
            ? "text-white/65 hover:text-white"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
        )}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="truncate">{title}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 transition-transform duration-200",
            brandMode ? "text-white/55" : "text-slate-400",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {/* Keep links mounted, but remove closed groups from keyboard focus
          and the accessibility tree. */}
      <div
        id={bodyId}
        hidden={!open}
        className={cn(
          "space-y-1 overflow-hidden transition-all duration-200",
          !open && "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
