/**
 * useNavScrollRestore -- keep a sidebar scroll position pinned across
 * page navigations.
 *
 * The Pages Router remounts the layout on every route change, so the
 * sidebar's scroll container snaps to top by default. Without this
 * hook, a menu item the operator clicked near the bottom effectively
 * teleports off-screen the moment the new page loads. Pure restore --
 * we never auto-scroll the active link into view, because that fights
 * the operator's intent.
 *
 * Strategy:
 *   1. Save on every scroll AND on every click within the nav
 *      (capture phase) -- the click handler guarantees the latest
 *      scrollTop lands in sessionStorage before the browser tears
 *      the old DOM down.
 *   2. On mount, restore via useLayoutEffect (before paint) plus a
 *      requestAnimationFrame retry chain, because Radix may not have
 *      laid out the viewport's children when the first attempt runs.
 *   3. Listener is "armed" only after a 200ms grace period, so any
 *      browser-driven scrolls during mount (focus auto-scroll,
 *      layout settle, etc.) can't overwrite the saved value with 0.
 *
 * Works with both shadcn / Radix ScrollArea (where the actual
 * scrolling element is `[data-radix-scroll-area-viewport]` inside
 * the wrapper) and native overflow elements (the ref'd element
 * scrolls itself).
 *
 * Usage:
 *   const scrollRef = useNavScrollRestore("admin-nav");
 *   <ScrollArea ref={scrollRef}>...</ScrollArea>
 * or
 *   const scrollRef = useNavScrollRestore("client-nav");
 *   <nav ref={scrollRef} className="overflow-y-auto">...</nav>
 *
 * The key must be unique per nav component so two navs don't fight
 * over the same sessionStorage slot.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/router";

const STORAGE_PREFIX = "nav-scroll:";
// SSR-safe layout effect -- React warns if you use useLayoutEffect on
// the server. The hook only runs on the client (Pages Router pages)
// so this is purely a typecheck convenience.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useNavScrollRestore<T extends HTMLElement = HTMLDivElement>(key: string) {
  const ref = useRef<T | null>(null);
  const router = useRouter();

  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    // shadcn ScrollArea wraps the actual scroller in a Radix viewport
    // div. Native overflow containers are themselves the scroller.
    const viewport: HTMLElement =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") || root;

    const storageKey = STORAGE_PREFIX + key;
    const savedRaw = sessionStorage.getItem(storageKey);
    const target = savedRaw !== null && Number.isFinite(Number(savedRaw)) ? Number(savedRaw) : 0;

    // ---- 1. Restore -----------------------------------------------
    // Synchronous attempt first (useLayoutEffect runs before paint).
    // If layout hasn't settled, retry across a few frames until the
    // assignment actually sticks (or we've waited ~200ms).
    let frames = 0;
    const MAX_FRAMES = 12; // ~200ms at 60fps
    let raf = 0;
    const tryRestore = () => {
      if (target <= 0) return;
      const max = viewport.scrollHeight - viewport.clientHeight;
      const desired = Math.min(target, Math.max(0, max));
      viewport.scrollTop = desired;
      if (viewport.scrollTop < target && frames < MAX_FRAMES) {
        frames += 1;
        raf = requestAnimationFrame(tryRestore);
      }
    };
    tryRestore();
    if (target > 0 && viewport.scrollTop < target) {
      raf = requestAnimationFrame(tryRestore);
    }

    // ---- 2. Persist ------------------------------------------------
    // The scroll listener is suppressed for 200ms after mount so any
    // browser-driven scroll resets during layout don't trample the
    // saved value with 0. Real user scrolls afterwards persist as
    // normal.
    let listenerArmed = false;
    const armTimer = window.setTimeout(() => {
      listenerArmed = true;
    }, 200);

    const persist = () => {
      sessionStorage.setItem(storageKey, String(viewport.scrollTop));
    };

    const onScroll = () => {
      if (!listenerArmed) return;
      persist();
    };

    // Capture-phase click listener guarantees we save the current
    // scrollTop before the browser starts tearing down the DOM for the
    // new route. Without this, the OLD nav's scroll listener might not
    // get a final scroll event at the right scrollTop before unmount.
    const onClickCapture = () => {
      persist();
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("click", onClickCapture, { capture: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(armTimer);
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("click", onClickCapture, { capture: true } as EventListenerOptions);
    };
    // Re-run on path change so the restore fires after every navigation.
  }, [key, router.asPath]);

  return ref;
}
