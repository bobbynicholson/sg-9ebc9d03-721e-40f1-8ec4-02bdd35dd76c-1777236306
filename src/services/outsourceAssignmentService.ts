/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * outsourceAssignmentService -- Wave 67 Phase D.
 *
 * Per-order assignment of an outsource provider. Sister service to
 * dispatchService (which handles driver assignment) but for the
 * external-service flow: on-site chef, florist, photographer, etc.
 *
 * Status lifecycle (mirrors driver_assignments shape):
 *   requested -> accepted | declined -> en_route -> on_site
 *             -> completed | cancelled
 *
 * Accept-link tokens: providers don't need a CateringMS account.
 * They get an email or WhatsApp message with a magic-link URL.
 * Tap accept/decline -> the public token-bearer endpoints flip the
 * status. Same magic-link pattern as the client-token / preview-as-
 * client surfaces.
 */
import { supabase } from "@/integrations/supabase/client";

export type OutsourceAssignmentStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "en_route"
  | "on_site"
  | "completed"
  | "cancelled";

export interface OutsourceAssignment {
  id: string;
  company_id: string;
  order_id: string;
  provider_id: string;
  order_item_id: string | null;
  menu_item_id: string | null;
  service_description: string;
  required_on_site_at: string | null;
  scope_notes: string | null;
  status: OutsourceAssignmentStatus;
  requested_at: string;
  responded_at: string | null;
  decline_reason: string | null;
  en_route_at: string | null;
  on_site_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  quoted_cost: number;
  cost_currency: string;
  rate_type: string;
  actual_cost: number | null;
  invoice_received: boolean;
  invoice_paid: boolean;
  invoice_received_at: string | null;
  invoice_paid_at: string | null;
  accept_token: string | null;
  accept_token_expires_at: string | null;
  requested_by: string | null;
  manually_marked_accepted: boolean;
  manually_marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OutsourceAssignmentWithProvider extends OutsourceAssignment {
  provider: {
    id: string;
    provider_name: string;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    preferred_contact_channel: string;
    default_rate_type: string;
  } | null;
}

/** Status display tones for the order modal panel + the magic-link
 *  acceptance page. Single source of truth for colour mapping. */
export const STATUS_TONE: Record<OutsourceAssignmentStatus, { label: string; cls: string }> = {
  requested: { label: "Awaiting response", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  accepted: { label: "Confirmed", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  declined: { label: "Declined", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  en_route: { label: "On the way", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  on_site: { label: "On site", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  completed: { label: "Done", cls: "bg-green-50 text-green-800 border-green-200" },
  cancelled: { label: "Cancelled", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

/** Crypto-safe token for the magic-link accept page. 32 bytes ->
 *  base64url ~43 chars. Long enough to be unguessable, short enough
 *  to fit cleanly in a WhatsApp message. */
function generateToken(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const outsourceAssignmentService = {
  /** Pull every assignment for an order, joined with provider for
   *  the order modal panel render. */
  async listForOrder(orderId: string): Promise<OutsourceAssignmentWithProvider[]> {
    const { data, error } = await (supabase as any)
      .from("outsource_assignments")
      .select(`
        *,
        provider:provider_id (
          id, provider_name, contact_person, email, phone,
          whatsapp_number, preferred_contact_channel, default_rate_type
        )
      `)
      .eq("order_id", orderId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[outsourceAssignmentService.listForOrder] failed:", error);
      return [];
    }
    return (data || []) as OutsourceAssignmentWithProvider[];
  },

  /** Create a brand-new assignment for an order. Mints a magic-link
   *  accept token; expiry = event_date + 1 day (or now + 90 days
   *  fallback when event_date is unset). */
  async create(args: {
    companyId: string;
    orderId: string;
    providerId: string;
    serviceDescription: string;
    quotedCost: number;
    rateType?: string;
    costCurrency?: string;
    requiredOnSiteAt?: string | null;
    scopeNotes?: string | null;
    menuItemId?: string | null;
    orderItemId?: string | null;
    requestedBy?: string | null;
    expiresAt?: string | null;
  }): Promise<OutsourceAssignment | null> {
    const token = generateToken();
    // Default token expiry: 90 days from now. The order cancellation
    // cascade will also flip the assignment to cancelled, but the
    // token-bearer endpoint double-checks expiry as belt-and-braces.
    const fallbackExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await (supabase as any)
      .from("outsource_assignments")
      .insert({
        company_id: args.companyId,
        order_id: args.orderId,
        provider_id: args.providerId,
        order_item_id: args.orderItemId ?? null,
        menu_item_id: args.menuItemId ?? null,
        service_description: args.serviceDescription,
        required_on_site_at: args.requiredOnSiteAt ?? null,
        scope_notes: args.scopeNotes ?? null,
        quoted_cost: args.quotedCost,
        cost_currency: args.costCurrency ?? "ZAR",
        rate_type: args.rateType ?? "per_event",
        accept_token: token,
        accept_token_expires_at: args.expiresAt ?? fallbackExpiry,
        requested_by: args.requestedBy ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error("[outsourceAssignmentService.create] failed:", error);
      return null;
    }
    return data as OutsourceAssignment;
  },

  /** Admin manual flip to accepted. Used for "called Sarah, she said
   *  yes" workflows -- saves the magic-link round-trip when the
   *  operator already has verbal confirmation. */
  async markAcceptedManual(assignmentId: string, performedByUserId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("outsource_assignments")
      .update({
        status: "accepted",
        responded_at: nowIso,
        manually_marked_accepted: true,
        manually_marked_by: performedByUserId,
      })
      .eq("id", assignmentId);
    if (error) throw error;
  },

  /** Admin manual flip to cancelled (typically when reassigning). */
  async cancelAssignment(assignmentId: string, reason?: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("outsource_assignments")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        decline_reason: reason ?? null,
      })
      .eq("id", assignmentId);
    if (error) throw error;
  },

  /** Admin updates the quoted cost (post-negotiation, scope change). */
  async updateCost(assignmentId: string, quotedCost: number): Promise<void> {
    const { error } = await (supabase as any)
      .from("outsource_assignments")
      .update({ quoted_cost: quotedCost })
      .eq("id", assignmentId);
    if (error) throw error;
  },

  /** Admin advances the operational status (en_route / on_site /
   *  completed) when status updates come in via phone rather than
   *  via the magic-link page. */
  async setStatus(assignmentId: string, status: OutsourceAssignmentStatus): Promise<void> {
    const nowIso = new Date().toISOString();
    const patch: any = { status };
    if (status === "en_route") patch.en_route_at = nowIso;
    if (status === "on_site") patch.on_site_at = nowIso;
    if (status === "completed") patch.completed_at = nowIso;
    const { error } = await (supabase as any)
      .from("outsource_assignments")
      .update(patch)
      .eq("id", assignmentId);
    if (error) throw error;
  },

  /** Build the full accept-link URL the operator drops into the
   *  request email/WhatsApp. Caller must pass the origin (window
   *  location) because the service is shared client + server. */
  buildAcceptLink(origin: string, token: string): string {
    const base = origin.replace(/\/$/, "");
    return `${base}/p/accept/${token}`;
  },
};
