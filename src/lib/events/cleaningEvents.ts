/**
 * cleaningEvents - CLN2-F.
 *
 * Window-event bus for "the pre-event cleanliness checklist for
 * order X just went ready". Mirrors orderEvents.ts (Wave 70.40)
 * so the kitchen dashboard chip can flip from amber to green
 * within seconds of the last required tick, without waiting on
 * the postgres realtime channel.
 *
 * Why a window event sits alongside the supabase channel:
 *   - The cleaning dashboard and the kitchen dashboard often run
 *     on the SAME device (same tablet, two tabs). The realtime
 *     channel is for cross-device propagation; the window event
 *     is the same-device fast path.
 *   - The cleaning tick is an optimistic UI write that succeeds
 *     locally before the supabase round trip completes - emit
 *     once we know the server accepted it.
 */
export const CLEANING_READY_EVENT = "cateringms:cleaning-ready";

export interface CleaningReadyDetail {
  orderId: string;
  checklistId: string;
  kind: "pre_event" | "delivery_ready";
}

export function emitCleaningReady(detail: CleaningReadyDetail) {
  if (typeof window === "undefined") return;
  if (!detail.orderId || !detail.checklistId) return;
  try {
    window.dispatchEvent(new CustomEvent<CleaningReadyDetail>(CLEANING_READY_EVENT, {
      detail,
    }));
  } catch {
    // best-effort broadcast, never block on the emit.
  }
}

export function onCleaningReady(
  handler: (detail: CleaningReadyDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<CleaningReadyDetail>).detail;
    if (!detail) return;
    handler(detail);
  };
  window.addEventListener(CLEANING_READY_EVENT, wrapped);
  return () => window.removeEventListener(CLEANING_READY_EVENT, wrapped);
}
