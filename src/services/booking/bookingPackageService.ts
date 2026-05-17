/**
 * bookingPackageService -- Wave 70.45
 *
 * CRUD + lifecycle for booking_packages. Each package groups
 * multiple orders (wedding setup Fri + function Sat + strike Sun
 * = one package, three orders).
 *
 * See supabase/migrations/20260518704500_wave70_45_booking_packages
 * for the schema.
 *
 * Service-role versions exist for cron / API endpoints that bypass
 * RLS; the default versions use the browser anon client and rely
 * on the tenant-scoped RLS policies defined in the migration.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as defaultSb } from "@/integrations/supabase/client";

export type BookingPackageStatus = "draft" | "active" | "completed" | "cancelled";

export interface BookingPackage {
  id: string;
  company_id: string;
  name: string;
  primary_client_id: string | null;
  primary_contact_id: string | null;
  status: BookingPackageStatus;
  notes: string | null;
  venue_summary: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface BookingPackageWithOrders extends BookingPackage {
  orders: Array<{
    id: string;
    order_number: string | null;
    event_name: string | null;
    event_date: string | null;
    event_time: string | null;
    status: string | null;
    guest_count: number | null;
    total_amount: number | null;
  }>;
}

/**
 * Create a fresh package. Orders are linked separately via
 * linkOrderToPackage() so a caller can spin up the package first +
 * then add events one by one (matches the typical operator flow:
 * confirm the umbrella event, then add each day's specifics).
 */
export async function createPackage(
  input: {
    company_id: string;
    name: string;
    primary_client_id?: string | null;
    primary_contact_id?: string | null;
    venue_summary?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    notes?: string | null;
    created_by?: string | null;
  },
  client?: any,
): Promise<{ ok: boolean; package?: BookingPackage; error?: string }> {
  const sb = client || defaultSb;
  const { data, error } = await sb
    .from("booking_packages")
    .insert([{
      company_id: input.company_id,
      name: input.name,
      primary_client_id: input.primary_client_id ?? null,
      primary_contact_id: input.primary_contact_id ?? null,
      venue_summary: input.venue_summary ?? null,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by ?? null,
      status: "draft",
    }])
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, package: data as BookingPackage };
}

/**
 * Link an existing order to a package. Idempotent -- safe to call
 * even if the order is already linked (re-link to same package is
 * a no-op; re-link to different package replaces).
 *
 * Side effect: if the package was draft, promote to active so it
 * surfaces in the active-packages list.
 */
export async function linkOrderToPackage(
  orderId: string,
  packageId: string,
  client?: any,
): Promise<{ ok: boolean; error?: string }> {
  const sb = client || defaultSb;
  const { error: updErr } = await sb
    .from("orders")
    .update({ package_id: packageId })
    .eq("id", orderId);
  if (updErr) return { ok: false, error: updErr.message };
  // Promote draft -> active when first order is linked.
  const { data: pkg } = await sb
    .from("booking_packages")
    .select("status")
    .eq("id", packageId)
    .maybeSingle();
  if (pkg && (pkg as any).status === "draft") {
    await sb.from("booking_packages").update({ status: "active" }).eq("id", packageId);
  }
  return { ok: true };
}

/**
 * Detach an order from its package. The order keeps existing but
 * becomes standalone again. If detaching leaves the package with
 * no remaining orders, the package is NOT auto-deleted -- the
 * operator may want to add other orders to it later. Use
 * deletePackage() explicitly to remove.
 */
export async function unlinkOrderFromPackage(
  orderId: string,
  client?: any,
): Promise<{ ok: boolean; error?: string }> {
  const sb = client || defaultSb;
  const { error } = await sb
    .from("orders")
    .update({ package_id: null })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Get a package with all its linked orders (in event_date order).
 * Returns null if the package doesn't exist or is soft-deleted.
 */
export async function getPackage(
  packageId: string,
  client?: any,
): Promise<BookingPackageWithOrders | null> {
  const sb = client || defaultSb;
  const { data: pkg } = await sb
    .from("booking_packages")
    .select("*")
    .eq("id", packageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pkg) return null;
  const { data: orders } = await sb
    .from("orders")
    .select("id, order_number, event_name, event_date, event_time, status, guest_count, total_amount")
    .eq("package_id", packageId)
    .is("deleted_at", null)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });
  return {
    ...(pkg as BookingPackage),
    orders: (orders || []) as BookingPackageWithOrders["orders"],
  };
}

/**
 * List all packages for a company. Optionally filter by status.
 */
export async function listPackages(
  companyId: string,
  options?: { status?: BookingPackageStatus[]; limit?: number },
  client?: any,
): Promise<BookingPackage[]> {
  const sb = client || defaultSb;
  let q = sb
    .from("booking_packages")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true, nullsFirst: false });
  if (options?.status && options.status.length > 0) {
    q = q.in("status", options.status);
  }
  if (options?.limit) q = q.limit(options.limit);
  const { data } = await q;
  return (data || []) as BookingPackage[];
}

/**
 * Cancel a whole package -- cascades to every linked order via
 * the existing cancelOrder workflow. Use this when the entire
 * multi-day booking falls through (e.g. wedding cancelled).
 */
export async function cancelPackage(
  packageId: string,
  reason: string,
  client?: any,
): Promise<{ ok: boolean; ordersCancelled: number; error?: string }> {
  const sb = client || defaultSb;
  // Flip package status first so the UI reflects the cancellation
  // even if some downstream order cancels error out.
  const { error: pkgErr } = await sb
    .from("booking_packages")
    .update({ status: "cancelled" })
    .eq("id", packageId);
  if (pkgErr) return { ok: false, ordersCancelled: 0, error: pkgErr.message };

  // Cascade to every linked, non-terminal order.
  const { data: orders } = await sb
    .from("orders")
    .select("id, status")
    .eq("package_id", packageId)
    .is("deleted_at", null);
  const cancellable = (orders || []).filter((o: any) =>
    !["cancelled", "delivered", "completed", "refunded"].includes(o.status),
  );

  // Use the existing cancelOrder workflow per order so the full
  // cascade (refund, equipment release, comms stop) runs. This is
  // a server-side helper call -- callers in the browser should
  // invoke via the /api/orders/[id]/cancel endpoint per order to
  // get the full audit trail. For batch use in the API endpoint
  // below, we call the workflow directly.
  let cancelled = 0;
  for (const o of cancellable as Array<{ id: string }>) {
    try {
      const { cancelOrder } = await import("@/services/order/orderWorkflow");
      const r = await cancelOrder({
        orderId: o.id,
        actorUserId: null,
        reasonCategory: "package_cancelled",
        reason: `Package cancelled: ${reason}`,
      } as any);
      if (r && ((r as any).success || (r as any).ok)) cancelled += 1;
    } catch (err) {
      console.warn("[bookingPackageService] cancel child order failed:", err);
    }
  }
  return { ok: true, ordersCancelled: cancelled };
}

/**
 * Soft-delete a package. Does NOT delete the linked orders -- they
 * become standalone again (package_id becomes orphaned but is
 * already nullable + ON DELETE SET NULL). Use cancelPackage() if
 * the intent is to cancel the orders too.
 */
export async function deletePackage(
  packageId: string,
  client?: any,
): Promise<{ ok: boolean; error?: string }> {
  const sb = client || defaultSb;
  const { error } = await sb
    .from("booking_packages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", packageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Update package metadata (name, notes, venue_summary, dates,
 * primary contact / client). Status changes go through the
 * dedicated cancel / promote helpers so cascades fire.
 */
export async function updatePackage(
  packageId: string,
  patch: Partial<Pick<BookingPackage, "name" | "notes" | "venue_summary" | "starts_at" | "ends_at" | "primary_client_id" | "primary_contact_id">>,
  client?: any,
): Promise<{ ok: boolean; error?: string }> {
  const sb = client || defaultSb;
  const { error } = await sb
    .from("booking_packages")
    .update(patch)
    .eq("id", packageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
