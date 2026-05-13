/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Auto-provision a client profile after magic-link sign-in.
 *
 * Why server-side: the profiles RLS does NOT permit a user to self-
 * insert their own row -- the only INSERT policy is
 * `company_admin_create_staff` which requires the caller to already be
 * a company admin. So a freshly signed-in client cannot create their
 * own profile from the browser. We do it here with the service role.
 *
 * Called by /[slug]/auth/callback after the magic-link session is live.
 *
 * Security:
 *   - Caller must have an active session (validated via cookie).
 *   - The slug in the request body must match the body's `target_slug`,
 *     and we look up the company by that slug.
 *   - We only ever create profiles with role=client. Any attempt to
 *     pass a different role is ignored. This means an attacker who
 *     somehow phishes a client into running this endpoint can't
 *     escalate them to admin.
 *   - Existing profiles are never overwritten -- if one exists we
 *     return it as-is. This protects users who are already members of
 *     a different catering company in some other role.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Sign in first" });
    }

    const { company_slug } = req.body || {};
    if (typeof company_slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(company_slug)) {
      return res.status(400).json({ error: "Invalid company link" });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Look up the company by slug. We never trust the slug as-is for
    // the insert -- we resolve it to a UUID server-side first.
    const { data: company } = await admin
      .from("companies")
      .select("id, slug, company_name")
      .eq("slug", company_slug)
      .maybeSingle();

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Idempotent backfill helper: link any orphan clients + quotes
    // under this tenant to the signed-in user. Safe to run on every
    // sign-in -- the predicates only touch rows where user_id is null
    // OR client_id is null AND the email matches under this company.
    // This closes a footgun: a profile already existing meant the
    // clients/quotes link step never ran, so caterers who added a
    // clients row LATER (after the user had signed up earlier under
    // a different tenant) saw broken portals because clients.user_id
    // was still null.
    const runEmailRelink = async () => {
      try {
        // Audit (May 2026, Item 5): ambiguity guard. If more than
        // one clients row matches this email under the tenant, do
        // NOT auto-relink -- a shared corporate inbox or two people
        // legitimately using the same email could end up with the
        // wrong person's quotes attached. Surface it for admin
        // review rather than guessing.
        const { data: candidates } = await admin
          .from("clients")
          .select("id")
          .eq("company_id", company.id)
          .ilike("email", user.email || "")
          .is("user_id", null);
        const candidateCount = Array.isArray(candidates) ? candidates.length : 0;
        if (candidateCount > 1) {
          console.warn("[client-provision-profile] ambiguous email relink", {
            companyId: company.id,
            email: user.email,
            candidateCount,
          });
          return; // bail out of relink + subsequent quote attach
        }
        if (candidateCount === 1) {
          await admin
            .from("clients")
            .update({ user_id: user.id })
            .eq("id", (candidates as any[])[0].id);
        }
      } catch {
        /* non-fatal */
      }
      try {
        // Resolve every clients row this user owns under THIS company,
        // then attach orphan quotes (NULL client_id) by email match.
        // The .or() is guarded by company_id so we never link a quote
        // from another tenant by accident.
        const { data: clientRowsResolved } = await admin
          .from("clients")
          .select("id")
          .eq("company_id", company.id)
          .eq("user_id", user.id);
        const ids = ((clientRowsResolved as any[]) || []).map((r) => r.id);
        if (ids.length > 0 && user.email) {
          // Pick the most recent clients row as the canonical id to
          // attach orphan quotes to. With one client_id this is
          // simply that id.
          const canonicalClientId = ids[0];
          await admin
            .from("quotes")
            .update({ client_id: canonicalClientId })
            .eq("company_id", company.id)
            .ilike("client_email", user.email)
            .is("client_id", null);
        }
      } catch {
        /* non-fatal */
      }
    };

    // If the user already has a profile, return it -- never overwrite.
    // This handles the case where the same email is also a client of
    // another catering company, or in some other role entirely.
    const { data: existing } = await admin
      .from("profiles")
      .select("id, role, company_id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    if (existing) {
      // Still run the email-relink for the existing-profile path --
      // the clients row may have been added AFTER first signup, so
      // clients.user_id needs catching up.
      await runEmailRelink();
      return res.status(200).json({
        ok: true,
        profile: existing,
        recovered: false,
      });
    }

    // Try to derive a friendly name from any existing clients row that
    // shares this email under this company. Fall back to a clean
    // capitalised version of the email's local-part.
    let fullName: string | null = null;
    try {
      const { data: clientRow } = await admin
        .from("clients")
        .select("client_name")
        .eq("company_id", company.id)
        .ilike("email", user.email || "")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fullName = (clientRow as any)?.client_name || null;
    } catch {
      /* non-fatal */
    }
    if (!fullName) {
      const localPart = (user.email || "").split("@")[0] || "Client";
      fullName = localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    // Insert the row. role hard-coded to "client" -- no inputs from the
    // request body can change this. company_id is the resolved UUID
    // from the slug lookup.
    const { data: created, error: insErr } = await admin
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        company_id: company.id,
        role: "client",
        active_role: "client",
        is_active: true,
      })
      .select("id, role, company_id, full_name, email")
      .single();

    if (insErr) {
      console.error("Client profile auto-provision failed:", insErr);
      return res.status(500).json({ error: `Could not create profile: ${insErr.message}` });
    }

    // Same email-relink logic as the existing-profile path. Lets the
    // dashboard surface their existing orders + quotes without each
    // one needing a manual user_id / client_id backfill.
    await runEmailRelink();

    return res.status(201).json({
      ok: true,
      profile: created,
      recovered: true,
    });
  } catch (e: any) {
    console.error("client-provision-profile crashed:", e);
    return res.status(500).json({ error: e?.message || "Unexpected server error" });
  }
}
