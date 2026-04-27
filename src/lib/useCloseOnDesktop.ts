import { useEffect } from "react";

/**
 * Mirrors the sidebar's collapsed state onto <html data-sidebar-collapsed>
 * so global CSS can shrink page wrappers' left padding from 256/288px down
 * to the icon-only 80px. Without this the dashboard content stays padded
 * for the expanded sidebar even when it's collapsed -- huge dead gap.
 */
export function useSyncSidebarCollapsed(isCollapsed: boolean) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.sidebarCollapsed = isCollapsed ? "true" : "false";
    return () => {
      // On unmount, reset so a non-collapsed-aware page (e.g. public site)
      // doesn't inherit a stale collapsed state.
      delete document.documentElement.dataset.sidebarCollapsed;
    };
  }, [isCollapsed]);
}

/**
 * Auto-closes a mobile nav drawer when the viewport crosses the `lg`
 * breakpoint (1024px). Without this, opening the hamburger sheet on
 * mobile and then dragging the window wider leaves the overlay on top
 * of the desktop sidebar -- you end up with two sidebars stuck on
 * screen at once. Tailwind defaults: lg=1024.
 */
export function useCloseOnDesktop(open: boolean, setOpen: (v: boolean) => void) {
  useEffect(() => {
    if (typeof window === "undefined" || !open) return;
    const mql = window.matchMedia("(min-width: 1024px)");
    if (mql.matches) {
      setOpen(false);
      return;
    }
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    // Modern browsers use addEventListener; older Safari (< 14) only had
    // addListener. TypeScript's lib types both as deprecated-but-present,
    // so no @ts-expect-error needed.
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [open, setOpen]);
}
