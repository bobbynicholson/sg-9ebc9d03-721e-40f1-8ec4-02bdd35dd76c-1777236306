import { useEffect } from "react";

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
    // Some older browsers use addListener
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // @ts-expect-error -- legacy fallback
    mql.addListener(onChange);
    // @ts-expect-error -- legacy fallback
    return () => mql.removeListener(onChange);
  }, [open, setOpen]);
}
