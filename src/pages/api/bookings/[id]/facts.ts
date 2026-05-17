/**
 * GET /api/bookings/[id]/facts?role=admin|client|kitchen|driver|cleaning|shopping
 *
 * Wave 70.42 -- role-scoped booking facts. Returns the booking +
 * related artifacts the calling role is allowed to see. Money
 * fields are stripped server-side for staff roles -- callers can
 * inspect Network tab and confirm the payload never carried them.
 *
 * Auth: must be signed in. The role query param is validated
 * against the caller's actual role (so a kitchen_staff user can't
 * pass ?role=admin to get money fields). super_admin can request
 * any role for debugging.
 *
 * Why client-fetch rather than getServerSideProps:
 *   - Several surfaces want this data refreshed after an order
 *     edit (Wave 70.40 cateringms:order-updated listener) -- a
 *     useEffect + fetch pairs naturally with the event hook.
 *   - Server-side props would force a full route reload on each
 *     refetch; we want in-place data swap.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { loadBookingForRole, type BookingFactsRole } from "@/services/booking/bookingFacts";

const ROLE_TO_VARIANT: Record<string, BookingFactsRole | null> = {
  super_admin:   "admin",
  company_admin: "admin",
  admin:         "admin",
  owner:         "admin",
  region_admin:  "admin", // restricted admin sees admin view (gated downstream)
  sales_admin:   "admin",
  kitchen_staff: "kitchen",
  driver_staff:  "driver",
  cleaning_staff: "cleaning",
  shopping_staff: "shopping",
  client:        "client",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!orderId) return res.status(400).json({ error: "Order id required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const callerRole = ((profile as any)?.active_role || (profile as any)?.role || "").toString().toLowerCase();
    const callerCompanyId = (profile as any)?.company_id as string | undefined;

    // Determine the variant. super_admin can override via ?role.
    const requested = String(req.query.role || "").toLowerCase();
    let variant: BookingFactsRole | null = null;
    if (callerRole === "super_admin" && requested) {
      variant = (["admin", "client", "kitchen", "driver", "cleaning", "shopping"] as BookingFactsRole[])
        .includes(requested as BookingFactsRole) ? (requested as BookingFactsRole) : null;
    } else {
      variant = ROLE_TO_VARIANT[callerRole] ?? null;
    }
    if (!variant) {
      return res.status(403).json({ error: "Role not allowed", role: callerRole });
    }

    const facts = await loadBookingForRole(orderId, variant);
    if (!facts) return res.status(404).json({ error: "Booking not found" });

    // Cross-tenant guard: the loader uses service-role (bypasses
    // RLS); we enforce company match here so a sneaky orderId from
    // another tenant can't be probed.
    if (callerRole !== "super_admin") {
      // Re-fetch company_id for the guard. Cheap, single field.
      const { data: orderRow } = await (await import("@/lib/supabase/service")).getServiceSupabase()
        .from("orders")
        .select("company_id")
        .eq("id", orderId)
        .maybeSingle();
      if (callerCompanyId && (orderRow as any)?.company_id !== callerCompanyId) {
        return res.status(403).json({ error: "Wrong company" });
      }
    }

    return res.status(200).json({ ok: true, facts });
  } catch (err: any) {
    console.error("[/api/bookings/[id]/facts] crashed:", err);
    return res.status(500).json({ error: err?.message || "Crashed" });
  }
}
