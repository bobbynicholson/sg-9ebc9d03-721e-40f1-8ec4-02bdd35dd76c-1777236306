/**
 * POST /api/orders/amendment-request
 *
 * Client-facing endpoint to request a late change to a confirmed
 * order (guest count tweak, menu swap, venue change). The request
 * is captured in order_amendment_requests for the catering team to
 * review. Approval triggers the cascade (kitchen prep regen,
 * shopping list refresh, invoice diff) - handled by the admin
 * approval endpoint, not here.
 *
 * Auth: client must be authenticated AND own the order. The order
 * must be inside its company's amendment window
 * (is_order_amendable RPC).
 *
 * Body:
 *   {
 *     order_id: string,
 *     proposed_changes: {
 *       guest_count?: number,
 *       menu_items?: Array<...>,
 *       equipment_items?: Array<...>,
 *       special_instructions?: string,
 *       delivery_time?: string,    // ISO time
 *       venue_address?: string
 *     },
 *     client_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
// Static type import so we can name UserRole in casts at the call
// site. The runtime VALUE comes from a dynamic import inside the
// handler (kept that way to avoid loading types/app's full surface
// on cold-start). Aliased to avoid a name collision with the local
// `const { UserRole }` from the dynamic import.
import type { UserRole as UserRoleType } from "@/types/app";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_FIELDS = new Set([
  "guest_count",
  "menu_items",
  "equipment_items",
  "special_instructions",
  "delivery_time",
  "venue_address",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to request a change" });

    const { order_id, proposed_changes, client_notes } = (req.body || {}) as any;
    if (!order_id || typeof order_id !== "string") {
      return res.status(400).json({ error: "order_id is required" });
    }
    if (!proposed_changes || typeof proposed_changes !== "object" || Array.isArray(proposed_changes)) {
      return res.status(400).json({ error: "proposed_changes must be an object" });
    }

    // Strip any keys the client isn't allowed to amend. Everything
    // else (status, total, payment_status, anything financial /
    // workflow-related) is admin-only by design.
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(proposed_changes)) {
      if (ALLOWED_FIELDS.has(k)) sanitized[k] = v;
    }

    // Allow notes-only amendments. The dialog already lets the client
    // submit just a note (e.g. "please confirm dietaries before Friday")
    // without any field change, but the API used to reject these. The
    // amendment record still gets created so the catering team sees
    // the question in their review queue.
    const notesProvided = typeof client_notes === "string" && client_notes.trim().length > 0;
    if (Object.keys(sanitized).length === 0 && !notesProvided) {
      return res.status(400).json({
        error: "Add at least one field change or include a note for the team",
      });
    }

    // Look up the order + verify ownership + amendable window.
    const { data: order, error: orderErr } = await ssr
      .from("orders")
      .select("id, company_id, client_id, event_date, status, deleted_at")
      .eq("id", order_id)
      .maybeSingle();
    if (orderErr) {
      console.error("[orders/amendment-request] orders fetch failed:", orderErr);
    }
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Ownership: either the authenticated user is the linked client,
    // or they're admin/owner in the same company. Anything else
    // shouldn't be making this call.
    //
    // orders.client_id is a FK to clients.id (NOT auth.users.id), so
    // resolving "is this user the client on this order?" needs a join
    // through the clients table - match either clients.user_id =
    // auth.uid() OR clients.email = auth.email() (the second is a
    // fallback for clients who own the order via portal token but
    // haven't been linked to an auth user yet).
    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, email")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[orders/amendment-request] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    const isAdminInCompany =
      ["super_admin", "company_admin", "admin", "owner"].includes(role) &&
      (profile as any)?.company_id === (order as any).company_id;

    let isLinkedClient = false;
    if (!isAdminInCompany && (order as any).client_id) {
      const { data: clientRow, error: clientRowErr } = await ssr
        .from("clients")
        .select("id, user_id, email")
        .eq("id", (order as any).client_id)
        .maybeSingle();
      if (clientRowErr) {
        console.error("[orders/amendment-request] clients fetch failed:", clientRowErr);
      }
      if (clientRow) {
        const cr = clientRow as any;
        const userEmail = (user.email || (profile as any)?.email || "").toLowerCase().trim();
        const clientEmail = (cr.email || "").toLowerCase().trim();
        isLinkedClient =
          (cr.user_id && cr.user_id === user.id) ||
          (!!userEmail && !!clientEmail && userEmail === clientEmail);
      }
    }

    if (!isAdminInCompany && !isLinkedClient) {
      console.warn("[amendment-request] ownership denied", {
        order_id,
        user_id: user.id,
        order_client_id: (order as any).client_id,
      });
      return res.status(403).json({ error: "Not allowed to amend this order" });
    }

    // Amendable window: bypass the check for admins (they're typing
    // it up on behalf of the client and may be inside the cutoff
    // for legitimate reasons). Clients are gated.
    if (!isAdminInCompany) {
      const { data: amendable } = await ssr.rpc("is_order_amendable", {
        p_order_id: order_id,
      });
      if (amendable !== true) {
        return res.status(409).json({
          error: "This order is past the amendment cutoff. Please contact us directly.",
        });
      }
    }

    const { data: inserted, error } = await ssr
      .from("order_amendment_requests")
      .insert({
        order_id,
        company_id: (order as any).company_id,
        requested_by_user_id: user.id,
        proposed_changes: sanitized,
        client_notes: client_notes || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: dbErrorMessage(error) });

    // Notify the catering team. Broadcast to admin / owner roles for
    // the company so every operator who can act on the request sees
    // it. Previously this was a single createNotification with
    // recipient_id set to the COMPANY uuid - which matches no actual
    // user, so the row landed in the table but never appeared in any
    // operator's bell. Best-effort, non-blocking.
    try {
      const { notificationService } = await import("@/services/notificationService");
      const { UserRole } = await import("@/types/app");
      // Build a more useful summary so the bell row is actionable
      // without opening the dashboard. List the keys the client wants
      // changed plus a short notes snippet if they included one.
      const keysList = Object.keys(sanitized);
      const keysLabel = keysList.length > 0
        ? keysList.map((k) => k.replace(/_/g, " ")).join(", ")
        : "details";
      const notesSnippet = client_notes && typeof client_notes === "string"
        ? ` "${client_notes.trim().slice(0, 120)}${client_notes.trim().length > 120 ? "..." : ""}"`
        : "";
      await notificationService.broadcastNotification({
        companyId: (order as any).company_id,
        type: "amendment_requested",
        title: "Amendment requested",
        message: `A client wants to change ${keysLabel} on their confirmed order.${notesSnippet} Review and approve.`,
        priority: "high",
        link: `/admin/orders?orderId=${order_id}&amendment=${(inserted as any).id}`,
        // Source pointer powers the contextual CTA on the
        // notifications page (Review request / Edit order) - without
        // these, the row only got a generic "Open" button.
        relatedEntityType: "order",
        relatedEntityId: order_id,
        // Operator-facing roles. "owner" exists as a string in
        // profiles.role but isn't on the UserRole enum, so cast to
        // pass it through.
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as unknown as UserRoleType,
        ],
      });
    } catch (e) {
      console.warn("[amendment-request] notify failed:", e);
    }

    // Phase 5 #9: customer-facing ack email. Mirrors the
    // cancellation-request flow from Phase 4 #5. The client portal
    // toast already says "the team will confirm by email shortly";
    // we make that literally true so the customer has the request
    // in their inbox without waiting for the admin to approve.
    // Non-blocking - an email failure must not unwind the row.
    try {
      const { data: orderForEmail } = await ssr
        .from("orders")
        .select("order_number, client_name, client_email, event_date")
        .eq("id", order_id)
        .maybeSingle();
      const clientEmail = (orderForEmail as any)?.client_email;
      if (clientEmail) {
        const { emailService } = await import("@/services/emailService");
        const evtDate = (orderForEmail as any)?.event_date
          ? new Date((orderForEmail as any).event_date).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "your event";
        const keysList = Object.keys(sanitized);
        const friendlyKeys = keysList.length > 0
          ? keysList.map((k) => k.replace(/_/g, " ")).join(", ")
          : "details";
        const body =
          `Hi ${((orderForEmail as any)?.client_name as string) || "there"},\n\n` +
          `We've received your request to change ${friendlyKeys} on your booking for ${evtDate}. ` +
          `The team will review it and confirm by email shortly.\n\n` +
          `Reference: ${(orderForEmail as any)?.order_number || order_id}\n\n` +
          `If anything else needs adjusting in the meantime, just reply to this email.`;
        await emailService.sendEmail({
          companyId: (order as any).company_id,
          to: clientEmail,
          subject: `Change request received - ${(orderForEmail as any)?.order_number || "your order"}`,
          template: "transactional",
          orderId: order_id,
          variables: {
            clientName: (orderForEmail as any)?.client_name,
            orderNumber: (orderForEmail as any)?.order_number,
          },
          html: `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`,
          text: body,
          _client: ssr,
        } as any);
      }
    } catch (ackErr) {
      console.warn("[amendment-request] client ack email failed:", ackErr);
    }

    return res.status(200).json({ ok: true, request_id: (inserted as any).id });
  } catch (err: any) {
    console.error("[amendment-request] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Could not submit amendment request" });
  }
}

export default withApiLogging(handler);
