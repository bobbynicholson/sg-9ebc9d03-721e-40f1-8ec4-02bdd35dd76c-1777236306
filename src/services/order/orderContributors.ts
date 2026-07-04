/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-order "who actually helped" recorder.
 *
 * One tiny best-effort wrapper around the record_order_contributor RPC
 * (migration 20260705130000) so every area - kitchen, cleaning, driver,
 * waiter, shopping - credits the acting user the same way. The RPC upserts
 * (order_id, user_id, area) and bumps last_at + actions on repeat, so
 * calling this on every action is safe and cheap.
 *
 * Deliberately swallows all errors: contributor tracking must NEVER break
 * the underlying action (a delivery, a served phase, a purchased tick). If
 * the RPC isn't deployed yet it just no-ops. The <OrderContributors>
 * component reads the rows back and renders "Helped by / Delivered by /
 * Served by / Shopped by ..." per section.
 */
import { supabase } from "@/integrations/supabase/client";

export type ContributorArea =
  | "kitchen"
  | "cleaning"
  | "shopping"
  | "driver"
  | "waiter"
  | "service";

export async function recordOrderContributor(
  orderId: string | null | undefined,
  userId: string | null | undefined,
  area: ContributorArea,
): Promise<void> {
  if (!orderId || !userId) return;
  try {
    await (supabase as any).rpc("record_order_contributor", {
      p_order_id: orderId,
      p_user_id: userId,
      p_area: area,
    });
  } catch {
    /* best-effort contributor tracking - never block the action */
  }
}
