/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/client-tokens/amend-order
 *
 * Wave 20 audit: the magic-link /c/order/[id] page had no Amend
 * button - only the auth-gated client portal exposed amendment
 * requests. A client landing via the email link couldn't bump guest
 * count or tweak the menu without signing in or phoning.
 *
 * Mirrors /api/orders/amendment-request (auth-required) but uses the
 * per-order client_access_token cookie as the auth surface. Same
 * insert + notify + acknowledgement-email shape so the operator sees
 * the request the same way no matter which path the client used.
 *
 * Body:
 *   {
 *     order_id: string,
 *     proposed_changes: {
 *       guest_count?: number,
 *       menu_items?: Array<...>,
 *       equipment_items?: Array<...>,
 *       special_instructions?: string,
 *       delivery_time?: string,
 *       venue_address?: string
 *     },
 *     client_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import crypto from "node:crypto";

const ALLOWED_FIELDS = new Set([
  "guest_count",
  "menu_items",
  "equipment_items",
  "special_instructions",
  "delivery_time",
  "venue_address",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const order_id = String(body.order_id || "").trim();
    const proposed_changes = body.proposed_changes || {};
    const client_notes = body.client_notes ? String(body.client_notes).slice(0, 2000) : null;

    if (!order_id || !/^[0-9a-f-]{36}$/i.test(order_id)) {
      return res.status(400).json({ error: "valid order_id required" });
    }
    if (typeof proposed_changes !== "object" || Array.isArray(proposed_changes)) {
      return res.status(400).json({ error: "proposed_changes must be an object" });
    }

    // Strip anything the client isn't allowed to amend, AND validate
    // each value's shape + range. Without this a malicious / sloppy
    // client could submit guest_count: 999999, special_instructions:
    // a 50KB string, or a menu_items array with thousands of bogus
    // entries - all of which would land on the order row + propagate
    // through the kitchen prep + invoice cascade. Wave 22.
    const sanitized: Record<string, any> = {};
    const validationErrors: string[] = [];
    for (const [k, v] of Object.entries(proposed_changes)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      if (k === "guest_count") {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0 || n > 5000 || !Number.isInteger(n)) {
          validationErrors.push("guest_count must be a whole number between 1 and 5000");
          continue;
        }
        sanitized[k] = n;
      } else if (k === "special_instructions" || k === "venue_address" || k === "delivery_time") {
        if (typeof v !== "string") {
          validationErrors.push(`${k} must be a string`);
          continue;
        }
        // Cap each free-text field at 2KB so a runaway client can't
        // bloat the request row.
        sanitized[k] = v.slice(0, 2000);
      } else if (k === "menu_items" || k === "equipment_items") {
        if (!Array.isArray(v)) {
          validationErrors.push(`${k} must be an array`);
          continue;
        }
        if (v.length > 100) {
          validationErrors.push(`${k} can have at most 100 entries`);
          continue;
        }
        sanitized[k] = v;
      } else {
        sanitized[k] = v;
      }
    }
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors.join("; "),
      });
    }
    const notesProvided = !!client_notes && client_notes.trim().length > 0;
    if (Object.keys(sanitized).length === 0 && !notesProvided) {
      return res.status(400).json({
        error: "Add at least one field change or include a note for the team",
      });
    }

    // Token-bearer auth.
    const cookieName = `cms_client_token_${order_id}`;
    const tokenHash = (
      req.cookies?.[cookieName] ||
      req.cookies?.cms_client_account_token ||
      ""
    ).trim();
    if (!tokenHash) {
      return res.status(401).json({ error: "Open the order link from your email first" });
    }

    const sb = getServiceSupabase();

    // Wave 24: rate-limit per (IP, order_id). Mirrors cancel-order's
    // gate. Stops a stolen-cookie spam scenario from bloating
    // order_amendment_requests + the operator notification queue. 5
    // requests/min/(IP, order) is plenty for legitimate "tweak guest
    // count" use.
    const ipForRl =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      "unknown";
    const rlKey = crypto
      .createHash("sha256")
      .update(`amend-order:${ipForRl}:${order_id}`)
      .digest("hex");
    try {
      const rl = await consumeApiKeyRateLimitDb(sb, rlKey, { maxPerMinute: 5 });
      if (!rl.allowed) {
        return res.status(429).json({ error: "Too many requests, please wait a moment" });
      }
    } catch {
      // Limiter init failure shouldn't block legitimate traffic.
    }
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      null;
    const ua = (req.headers["user-agent"] as string) || null;

    const { data: viewData, error: viewErr } = await (sb as any).rpc("client_view_order", {
      p_token_hash: tokenHash,
      p_order_id: order_id,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (viewErr) {
      console.error("[amend-order:token] view RPC failed:", viewErr);
      return res.status(500).json({ error: "Lookup failed" });
    }
    const view: any = viewData;
    if (!view?.ok) {
      return res.status(401).json({ error: view?.code || "invalid_token" });
    }
    const order: any = view.order;
    if (order.status === "cancelled") {
      return res.status(409).json({ error: "Order is cancelled. Please contact us about a new booking." });
    }
    if (order.status === "completed" || order.status === "delivered") {
      return res.status(409).json({ error: `Cannot amend a ${order.status} order. Please contact us directly.` });
    }

    // Amendment cutoff window check. The auth-gated handler bypasses
    // this for admins; magic-link clients are always gated.
    const { data: amendable } = await (sb as any).rpc("is_order_amendable", {
      p_order_id: order_id,
    });
    if (amendable !== true) {
      return res.status(409).json({
        error: "This order is past the amendment cutoff. Please contact us directly.",
      });
    }

    const { data: inserted, error: insertErr } = await sb
      .from("order_amendment_requests")
      .insert({
        order_id,
        company_id: order.company_id,
        // Token-bearer flow has no auth user; leave NULL.
        requested_by_user_id: null,
        proposed_changes: sanitized,
        client_notes,
        status: "pending",
      } as any)
      .select("id")
      .single();
    if (insertErr) {
      console.error("[amend-order:token] insert failed:", insertErr);
      return res.status(500).json({ error: insertErr.message });
    }

    // Operator notification fan-out.
    try {
      const { notificationService } = await import("@/services/notificationService");
      const { UserRole } = await import("@/types/app");
      const keysList = Object.keys(sanitized);
      const keysLabel = keysList.length > 0
        ? keysList.map((k) => k.replace(/_/g, " ")).join(", ")
        : "details";
      const notesSnippet = client_notes
        ? ` "${client_notes.trim().slice(0, 120)}${client_notes.trim().length > 120 ? "..." : ""}"`
        : "";
      await (notificationService as any).broadcastNotification({
        companyId: order.company_id,
        type: "amendment_requested",
        title: "Amendment requested (magic link)",
        message: `${order.client_name || "A client"} wants to change ${keysLabel} on order ${order.order_number}.${notesSnippet} Review and approve.`,
        priority: "high",
        link: `/admin/orders?orderId=${order_id}&amendment=${(inserted as any).id}`,
        relatedEntityType: "order",
        relatedEntityId: order_id,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as any,
        ],
      }, sb);
    } catch (e) {
      console.warn("[amend-order:token] notify failed:", e);
    }

    // Acknowledgement email to the client.
    try {
      if (order.client_email) {
        const { emailService } = await import("@/services/emailService");
        const evtDate = order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", {
              day: "numeric", month: "short", year: "numeric",
            })
          : "TBD";
        const subject = `Change request received - ${order.order_number}`;
        const body =
          `Hi ${(order.client_name || "there").split(" ")[0]},\n\n` +
          `We've received your change request for order ${order.order_number} (${evtDate}). The team will review and confirm shortly.\n\n` +
          (notesProvided ? `Your note: "${client_notes}"\n\n` : "") +
          `Reply to this email if anything else needs to change.\n\n` +
          `Thanks.`;
        await (emailService as any).sendEmail({
          companyId: order.company_id,
          to: order.client_email,
          subject,
          body,
          bypassQuarantine: true,
          _client: sb,
        });
      }
    } catch (e) {
      console.warn("[amend-order:token] ack email failed:", e);
    }

    // Wave 23.5: cross-cutting audit_logs row.
    void (async () => {
      try {
        await (sb as any).from("audit_logs").insert({
          company_id: order.company_id,
          user_id: null,
          action: "amendment_requested_magic",
          entity_type: "order",
          entity_id: order_id,
          details: {
            request_id: (inserted as any).id,
            order_number: order.order_number,
            client_email: order.client_email,
            applied_keys: Object.keys(sanitized),
            has_notes: notesProvided,
          },
        });
      } catch (auditErr) {
        console.warn("[amend-order:token] audit_logs insert failed:", auditErr);
      }
    })();

    return res.status(201).json({
      ok: true,
      request_id: (inserted as any).id,
    });
  } catch (e: any) {
    console.error("[amend-order:token] crashed:", e);
    return res.status(500).json({ error: e?.message || "Amendment request failed" });
  }
}
