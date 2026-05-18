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
 * - When a section contains the active route, the section auto-expands
 *   so the highlighted item is always visible.
 * - Sidebar-collapsed state (the icon-only mode) hides section headers
 *   entirely and renders items flat - no accordion, just tooltips.
 */
import { useState } from "react";
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
  /** When true, this section contains the currently active route - the
   *  section will auto-expand even if the user previously closed it. */
  containsActiveRoute?: boolean;
  children: React.ReactNode;
}

export function CollapsibleNavSection({
  title,
  storageKey: _storageKey,
  defaultOpen = true,
  flatMode = false,
  containsActiveRoute = false,
  children,
}: CollapsibleNavSectionProps) {
  void _storageKey;

  // In-memory only. Each mount starts at the section's defaultOpen state;
  // we don't persist the user's manual toggles. This is intentional so
  // navigating between pages always resets the menu to its smart defaults.
  const [userOpen, setUserOpen] = useState<boolean>(defaultOpen);

  // If the active route lives inside this section, force-expand it so the
  // user can always see where they are.
  const open = containsActiveRoute ? true : userOpen;

  if (flatMode) {
    return <div className="space-y-1">{children}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setUserOpen((v) => !v)}
        className="w-full flex items-center justify-between mt-3 mb-1 px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
        aria-expanded={open}
      >
        <span className="truncate">{title}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 text-slate-400 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {/* Animated open/close. We keep the items in the DOM when closed
          so layout doesn't jank, just hide them with CSS so the accordion
          is fast and screen-readers can still find them when opened. */}
      <div
        className={cn(
          "space-y-1 overflow-hidden transition-all duration-200",
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 pointer-events-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}
