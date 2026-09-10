/**
 * orderEvents - Wave 70.40
 *
 * Tiny client-side helper for broadcasting "this order changed --
 * if you're showing it anywhere, refetch" across the SPA.
 *
 * Pattern (set up in Wave 70.37 + 70.38):
 *
 *   1. After a successful order mutation, the call site emits a
 *      window-level CustomEvent: `cateringms:order-updated` with
 *      { orderId, source } in detail.
 *   2. Any page that reads orders (calendar, invoices, dashboard
 *      widgets, etc.) listens for the event AND for window focus,
 *      and refetches its data.
 *
 * Why a window event vs context vs Zustand etc:
 *   - Context only reaches descendants of the provider. Calendar
 *     and Invoices live under sibling pages - a global context
 *     would need to wrap _app.tsx and re-render the whole tree.
 *   - Zustand / Redux would work but adds a dep + an indirection
 *     for what is essentially "ping, refetch".
 *   - Window events are free, work everywhere in the SPA, and
 *     match the pattern already used for sidebar-FAB triggers
 *     (`{role}-fab:open-nav`).
 *
 * The helper is a no-op on the server - callable from anywhere
 * without a typeof-window guard.
 */
export const ORDER_UPDATED_EVENT = "cateringms:order-updated";

export interface OrderUpdatedDetail {
  /** The order id that changed. Listeners can use this to do
   *  targeted refetches if they want (most just refetch all). */
  orderId: string;
  /** Short string identifying which surface fired the event.
   *  Helps debugging + future analytics. Examples:
   *    "admin/orders:save", "admin/orders:cancel",
   *    "admin/invoices:mark-paid", "readiness-chip:force-close",
   *    "readiness-chip:regenerate-prep-tasks",
   *    "driver:pod-upload", "dispatch:assign-driver". */
  source: string;
  /** Optional hint about what specifically changed. Listeners
   *  can use this to refetch only the affected slice. None of
   *  the current listeners use it - here for forward-compat. */
  changed?: Array<"status" | "date" | "totals" | "driver" | "items" | "equipment" | "payments" | "prep" | "handover">;
}

export function emitOrderUpdated(orderId: string, source: string, changed?: OrderUpdatedDetail["changed"]) {
  if (typeof window === "undefined") return;
  if (!orderId) return;
  try {
    window.dispatchEvent(new CustomEvent<OrderUpdatedDetail>(ORDER_UPDATED_EVENT, {
      detail: { orderId, source, changed },
    }));
  } catch {
    // Some very old browsers throw on CustomEvent without polyfill --
    // the system is broadcast-best-effort, never block on the emit.
  }
}

/**
 * Hook-friendly listener helper. Use from useEffect:
 *
 *   useEffect(() => {
 *     const off = onOrderUpdated(() => { loadOrders(); });
 *     return off;
 *   }, []);
 *
 * Pass an optional filter to scope to a specific order id.
 */
export function onOrderUpdated(
  handler: (detail: OrderUpdatedDetail) => void,
  options?: { orderId?: string },
): () => void {
  if (typeof window === "undefined") return () => {};
  const filterId = options?.orderId;
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<OrderUpdatedDetail>).detail;
    if (!detail) return;
    if (filterId && detail.orderId !== filterId) return;
    handler(detail);
  };
  window.addEventListener(ORDER_UPDATED_EVENT, wrapped);
  return () => window.removeEventListener(ORDER_UPDATED_EVENT, wrapped);
}
