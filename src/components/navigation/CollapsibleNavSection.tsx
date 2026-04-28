/**
 * Collapsible nav section -- one accordion group inside a sidebar.
 *
 * Used by AdminNav, PlatformNav, and any other portal nav that has more
 * than ~6 items so the user can hide groups they don't need today.
 *
 * Behaviour:
 * - Per-section open state, persisted to localStorage under
 *   `nav-section-open:{storageKey}` so the nav remembers the user's
 *   choice across sessions and across devices using the same browser.
 * - `defaultOpen` is the *initial* state if no preference is stored yet.
 *   The smart defaults are set at the call site (e.g. "Core Management"
 *   defaults open; "Branding & Settings" defaults closed).
 * - When a section contains the active route, the section auto-expands
 *   so the highlighted item is always visible. The user's explicit choice
 *   is still remembered for any non-active section.
 * - Sidebar-collapsed state (the icon-only mode) hides section headers
 *   entirely and renders items flat -- no accordion, just tooltips.
 *
 * The "open everything" / "close everything" UX lives in the parent nav,
 * not here -- this component just renders one section.
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleNavSectionProps {
  title: string;
  /** Stable id used as the localStorage key. Use role-prefixed ids
   *  (e.g. "admin:core") so two navs never collide on the same key. */
  storageKey: string;
  /** Whether the section is open the first time the user sees it. */
  defaultOpen?: boolean;
  /** When true, render flat with no header / no accordion control. Used
   *  when the parent sidebar is in icon-only collapsed mode. */
  flatMode?: boolean;
  /** When true, this section contains the currently active route -- the
   *  section will auto-expand even if the user previously closed it. */
  containsActiveRoute?: boolean;
  children: React.ReactNode;
}

export function CollapsibleNavSection({
  title,
  storageKey,
  defaultOpen = true,
  flatMode = false,
  containsActiveRoute = false,
  children,
}: CollapsibleNavSectionProps) {
  const lsKey = `nav-section-open:${storageKey}`;

  // Hydrate from localStorage on mount. We use a lazy initialiser so the
  // very first render uses the correct value and we don't get an open ->
  // close flicker.
  const [userOpen, setUserOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const saved = window.localStorage.getItem(lsKey);
    if (saved === "true") return true;
    if (saved === "false") return false;
    return defaultOpen;
  });

  // If the active route lives inside this section, force-expand it so the
  // user can always see where they are. We don't write this to storage --
  // their explicit preference is preserved for when they navigate away.
  const open = containsActiveRoute ? true : userOpen;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(lsKey, String(userOpen));
  }, [lsKey, userOpen]);

  if (flatMode) {
    return <div className="space-y-1">{children}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setUserOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-2 px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform duration-200",
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
