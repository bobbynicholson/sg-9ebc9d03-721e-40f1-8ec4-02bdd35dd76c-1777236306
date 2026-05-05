/**
 * useNavScrollRestore -- keep a sidebar scroll position pinned across
 * page navigations.
 *
 * Without this, the Pages Router remounts the layout on every route
 * change, the sidebar's scroll container snaps to top, and a menu
 * item the operator clicked near the bottom of the menu effectively
 * teleports off-screen. Pure restore by design -- no "scroll active
 * link into view" cleverness, because that fights the operator's
 * intent (they just chose where to look). On hard page loads
 * sessionStorage is empty, so the sidebar starts at top -- expected.
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
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";

const STORAGE_PREFIX = "nav-scroll:";

export function useNavScrollRestore<T extends HTMLElement = HTMLDivElement>(key: string) {
  const ref = useRef<T | null>(null);
  const router = useRouter();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // shadcn ScrollArea wraps the actual scroller in a Radix viewport
    // div. Native overflow containers are themselves the scroller.
    const viewport: HTMLElement =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") || root;

    const storageKey = STORAGE_PREFIX + key;
    const savedRaw = sessionStorage.getItem(storageKey);
    const target = savedRaw !== null && Number.isFinite(Number(savedRaw)) ? Number(savedRaw) : 0;

    // Browsers clamp scrollTop to (scrollHeight - clientHeight). On a
    // fresh remount, the Radix viewport's children may not have laid
    // out yet, so scrollHeight is still small and our restore silently
    // clamps to 0. Retry across a handful of frames until either the
    // scroll position takes or we've waited long enough that the page
    // is clearly settled at the top. Six frames is roughly 100ms at
    // 60fps -- imperceptible, plenty of time for layout to flush.
    let frames = 0;
    const MAX_FRAMES = 6;
    let raf = 0;
    const tryRestore = () => {
      if (target === 0) return; // nothing to do
      const max = viewport.scrollHeight - viewport.clientHeight;
      const desired = Math.min(target, Math.max(0, max));
      viewport.scrollTop = desired;
      // If we couldn't reach the target yet (content too short),
      // schedule another attempt. If desired === 0 because saved was
      // 0, we're done.
      if (viewport.scrollTop < target && frames < MAX_FRAMES) {
        frames += 1;
        raf = requestAnimationFrame(tryRestore);
      }
    };
    raf = requestAnimationFrame(tryRestore);

    // Suppress the listener for the first ~150ms after a navigation
    // so any browser-driven scroll resets during mount don't overwrite
    // the saved position with 0. After that window, real user scrolls
    // are persisted as normal.
    let listenerArmed = false;
    const armTimer = window.setTimeout(() => {
      listenerArmed = true;
    }, 150);

    const onScroll = () => {
      if (!listenerArmed) return;
      sessionStorage.setItem(storageKey, String(viewport.scrollTop));
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(armTimer);
      viewport.removeEventListener("scroll", onScroll);
    };
    // Re-run on path change so the restore fires after every navigation.
  }, [key, router.asPath]);

  return ref;
}
