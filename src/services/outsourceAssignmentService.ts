/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * outsourceAssignmentService - Wave 67 Phase D.
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
  accept_token_expires_at: string | null;
  requested_by: string | null;
  manually_marked_accepted: boolean;
  manually_marked_by: string | null;
  notes: string | null;
  // Wave 67.5 - multi-provider routing. Siblings in the same
  // routing_group_id are alternates for the same fulfilment slot;
  // accepting one auto-cancels the rest via DB trigger.
  routing_group_id: string | null;
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
  completed: { label: "Done", cls: "bg-brand-primary/10 text-brand-primary border-brand-primary/20" },
  cancelled: { label: "Cancelled", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

const SAFE_ASSIGNMENT_FIELDS = `
  id, company_id, order_id, provider_id, order_item_id, menu_item_id,
  service_description, required_on_site_at, scope_notes, status,
  requested_at, responded_at, decline_reason, en_route_at, on_site_at,
  completed_at, cancelled_at, quoted_cost, cost_currency, rate_type,
  actual_cost, invoice_received, invoice_paid, invoice_received_at,
  invoice_paid_at, accept_token_expires_at, requested_by,
  manually_marked_accepted, manually_marked_by, notes, routing_group_id,
  created_at, updated_at, deleted_at
`;

async function postAdminAction(assignmentId: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`/api/admin/outsource-assignments/${encodeURIComponent(assignmentId)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status})`);
  return result;
}

export const outsourceAssignmentService = {
  /** Pull every assignment for an order, joined with provider for
   *  the order modal panel render. */
  async listForOrder(orderId: string): Promise<OutsourceAssignmentWithProvider[]> {
    const { data, error } = await (supabase as any)
      .from("outsource_assignments")
      .select(`
        ${SAFE_ASSIGNMENT_FIELDS},
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
    const response = await fetch("/api/admin/outsource-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: args.orderId,
        providerId: args.providerId,
        orderItemId: args.orderItemId ?? null,
        menuItemId: args.menuItemId ?? null,
        serviceDescription: args.serviceDescription,
        requiredOnSiteAt: args.requiredOnSiteAt ?? null,
        scopeNotes: args.scopeNotes ?? null,
        quotedCost: args.quotedCost,
        costCurrency: args.costCurrency ?? "ZAR",
        rateType: args.rateType ?? "per_event",
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[outsourceAssignmentService.create] failed:", result?.error || response.status);
      return null;
    }
    return result.assignment as OutsourceAssignment;
  },

  /** Admin manual flip to accepted. Used for "called Sarah, she said
   *  yes" workflows - saves the magic-link round-trip when the
   *  operator already has verbal confirmation. */
  async markAcceptedManual(assignmentId: string, performedByUserId: string): Promise<void> {
    void performedByUserId;
    await postAdminAction(assignmentId, { action: "mark_accepted" });
  },

  /** Admin manual flip to cancelled (typically when reassigning). */
  async cancelAssignment(assignmentId: string, reason?: string): Promise<void> {
    await postAdminAction(assignmentId, { action: "cancel", reason });
  },

  /** Admin updates the quoted cost (post-negotiation, scope change). */
  async updateCost(assignmentId: string, quotedCost: number): Promise<void> {
    await postAdminAction(assignmentId, { action: "update_cost", quotedCost });
  },

  /** Admin advances the operational status (en_route / on_site /
   *  completed) when status updates come in via phone rather than
   *  via the magic-link page. */
  async setStatus(assignmentId: string, status: OutsourceAssignmentStatus): Promise<void> {
    await postAdminAction(assignmentId, { action: "set_status", status });
  },

  /** Build the full accept-link URL the operator drops into the
   *  request email/WhatsApp. Caller must pass the origin (window
   *  location) because the service is shared client + server. */
  buildAcceptLink(origin: string, token: string): string {
    const base = origin.replace(/\/$/, "");
    return `${base}/p/accept/${token}`;
  },
};
