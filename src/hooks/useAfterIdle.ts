import { useEffect, useState } from "react";

/**
 * True once the page has finished loading and the browser is idle (or after
 * `timeoutMs` at the latest). Used to mount non-urgent widgets - toasts,
 * route splash, header switchers - after the page instead of competing with
 * it while it loads. False on the server and on the first client render, so
 * server and client markup always match.
 */
export function useAfterIdle(timeoutMs = 3000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleId: number | undefined;
    let timer: number | undefined;
    const schedule = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      else timer = window.setTimeout(() => setReady(true), 200);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      const w = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [timeoutMs]);

  return ready;
}
