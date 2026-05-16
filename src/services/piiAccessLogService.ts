/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * piiAccessLogService -- Wave 67.6 POPIA scaffolding.
 *
 * South Africa's Protection of Personal Information Act (POPIA, in
 * force July 2021) requires data processors to maintain a record of
 * WHO accessed WHAT personal information, WHEN, and WHY -- with the
 * ability to produce that record on subject access request (SAR).
 *
 * The audit_logs table already captures every operator MUTATION
 * (mark-paid, send-email, cancel-order, etc). What's missing is a
 * record of read-only access to sensitive data: opening a client
 * record, viewing a phone/email in the contact strip, exporting a
 * data subject's history. This service is the standardised entry
 * point for that.
 *
 * Usage: call logPiiAccess(...) from any surface that surfaces
 * sensitive PII to an operator. The call is fire-and-forget; a log
 * failure must NEVER block the user-facing read.
 *
 * Categories follow POPIA's "special personal information" buckets
 * loosely:
 *   contact_details -- phone, email, address (most common)
 *   financial       -- payment ledger, bank details, invoice history
 *   identifying     -- ID/passport/tax number
 *   health          -- dietary, allergens (POPIA Section 26)
 *   biometric       -- POD photos, signatures
 *
 * Future enhancements: rate-limit duplicate logs (don't write 50
 * rows when an operator hovers over the same email 50 times),
 * subject-access-request export to CSV, retention policy enforcement
 * (POPIA's 12-month minimum retention).
 */
import { supabase as defaultClient } from "@/integrations/supabase/client";

export type PiiCategory =
  | "contact_details"
  | "financial"
  | "identifying"
  | "health"
  | "biometric"
  | "other";

export interface LogPiiAccessArgs {
  /** The PII subject (client / driver / supplier / provider). */
  entityType: "client" | "driver" | "supplier" | "outsource_provider" | "lead" | "order" | "invoice" | "payment";
  entityId: string;
  /** What category of PII was accessed. */
  category: PiiCategory;
  /** Free text -- what specifically the operator saw. E.g.
   *  "viewed phone + email + billing address in client edit dialog".
   *  Keep under 200 chars. */
  fields: string;
  /** Why the operator looked. POPIA doesn't require a reason on every
   *  read but tenants pursuing audit-grade compliance want it for the
   *  SAR audit trail. Optional. */
  reason?: string;
  /** Company scope. When omitted, the call reads it from the active
   *  profile (browser-side only). Server-side callers must pass it. */
  companyId?: string;
  /** Operator who triggered the read. When omitted on the browser,
   *  the active auth user fills it. Server-side callers must pass it. */
  userId?: string;
  /** Override the default supabase client. Server-side callers pass
   *  the service-role client; browser callers can leave it. */
  client?: any;
}

/**
 * Fire-and-forget. Never throws. Never blocks the caller.
 */
export async function logPiiAccess(args: LogPiiAccessArgs): Promise<void> {
  try {
    const client = args.client || defaultClient;

    let companyId = args.companyId ?? null;
    let userId = args.userId ?? null;

    // Browser-side: resolve from the active session if missing.
    if ((!companyId || !userId) && typeof window !== "undefined") {
      try {
        const { data: { user } } = await (defaultClient as any).auth.getUser();
        if (user) {
          userId = userId || user.id;
          if (!companyId) {
            const { data: profile } = await (defaultClient as any)
              .from("profiles")
              .select("company_id")
              .eq("id", user.id)
              .maybeSingle();
            companyId = (profile as any)?.company_id || null;
          }
        }
      } catch {
        // ignore -- access still gets logged with null fields, which
        // is better than silently dropping.
      }
    }

    if (!companyId) return; // can't scope -- skip silently.

    await client.from("audit_logs").insert({
      company_id: companyId,
      user_id: userId,
      action: "pii_access_view",
      entity_type: args.entityType,
      entity_id: args.entityId,
      details: {
        category: args.category,
        fields: args.fields.slice(0, 200),
        reason: args.reason ? args.reason.slice(0, 200) : null,
      },
    });
  } catch (err) {
    // Defensive: never let a logging failure crash the UI.
    console.warn("[piiAccessLogService] log failed (non-blocking):", err);
  }
}
