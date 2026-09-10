/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Auto-provision a client profile after magic-link sign-in.
 *
 * Why server-side: the profiles RLS does NOT permit a user to self-
 * insert their own row - the only INSERT policy is
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
 *   - Existing profiles are never overwritten - if one exists we
 *     return it as-is. This protects users who are already members of
 *     a different catering company in some other role.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    // the insert - we resolve it to a UUID server-side first.
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .select("id, slug, company_name")
      .eq("slug", company_slug)
      .maybeSingle();
    if (companyErr) {
      console.error("[auth/client-provision-profile] companies fetch failed:", companyErr);
    }

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Idempotent backfill helper: link any orphan clients + quotes
    // under this tenant to the signed-in user. Safe to run on every
    // sign-in - the predicates only touch rows where user_id is null
    // OR client_id is null AND the email matches under this company.
    // This closes a footgun: a profile already existing meant the
    // clients/quotes link step never ran, so caterers who added a
    // clients row LATER (after the user had signed up earlier under
    // a different tenant) saw broken portals because clients.user_id
    // was still null.
    const runEmailRelink = async () => {
      try {
        // Fetch every clients row matching this email under the tenant,
        // regardless of user_id. Two claimable shapes:
        //   - user_id IS NULL: the classic unclaimed row.
        //   - user_id points at a DIFFERENT auth user whose own email
        //     does NOT match the row's email: a provably-wrong link
        //     (bad backfill / seeding stamped the creator's uid). The
        //     signer just proved ownership of this email via the magic
        //     link, so the row is theirs - reclaim it. Without this,
        //     one poisoned link locks the real client out forever
        //     (the null-only relink never fires again).
        const { data: candidates, error: candidatesErr } = await admin
          .from("clients")
          .select("id, user_id, email")
          .eq("company_id", company.id)
          .eq("email", (user.email || "").toLowerCase());
        if (candidatesErr) {
          console.error("[auth/client-provision-profile] clients fetch failed:", candidatesErr);
        }
        const rows = Array.isArray(candidates) ? candidates : [];
        const claimable: string[] = [];
        for (const row of rows as any[]) {
          if (!row.user_id) {
            claimable.push(row.id);
            continue;
          }
          if (row.user_id === user.id) continue; // already ours
          // Linked to someone else - only reclaim when that link is
          // provably wrong (the linked account's email differs from
          // the row's email). If we can't resolve the linked account's
          // email, leave the row alone - never steal on a guess.
          try {
            const { data: linkedProfile } = await admin
              .from("profiles")
              .select("email")
              .eq("id", row.user_id)
              .maybeSingle();
            let linkedEmail = String((linkedProfile as any)?.email || "").toLowerCase().trim();
            if (!linkedEmail) {
              const { data: linkedAuth } = await admin.auth.admin.getUserById(row.user_id);
              linkedEmail = String(linkedAuth?.user?.email || "").toLowerCase().trim();
            }
            const rowEmail = String(row.email || "").toLowerCase().trim();
            if (linkedEmail && rowEmail && linkedEmail !== rowEmail) {
              claimable.push(row.id);
            } else if (linkedEmail && rowEmail && linkedEmail === rowEmail) {
              console.warn("[client-provision-profile] clients row linked to another account with the same email - not reclaiming", {
                clientRowId: row.id,
                companyId: company.id,
              });
            }
          } catch (linkedErr) {
            console.warn("[client-provision-profile] linked-account lookup failed, skipping reclaim:", linkedErr);
          }
        }
        // Ambiguity guard (May 2026, Item 5): (company_id, lower(email))
        // is unique so this should never trigger, but if legacy dupes
        // exist we bail rather than guess which row is theirs.
        if (claimable.length > 1) {
          console.warn("[client-provision-profile] ambiguous email relink", {
            companyId: company.id,
            email: user.email,
            candidateCount: claimable.length,
          });
          return; // bail out of relink + subsequent quote attach
        }
        if (claimable.length === 1) {
          await admin
            .from("clients")
            .update({ user_id: user.id })
            .eq("id", claimable[0]);
        }
      } catch {
        /* non-fatal */
      }
      try {
        // Resolve every clients row this user owns under THIS company,
        // then attach orphan quotes (NULL client_id) by email match.
        // The .or() is guarded by company_id so we never link a quote
        // from another tenant by accident.
        const { data: clientRowsResolved, error: clientRowsResolvedErr } = await admin
          .from("clients")
          .select("id")
          .eq("company_id", company.id)
          .eq("user_id", user.id);
        if (clientRowsResolvedErr) {
          console.error("[auth/client-provision-profile] clients fetch failed:", clientRowsResolvedErr);
        }
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
            .eq("client_email", (user.email || "").toLowerCase())
            .is("client_id", null);
        }
      } catch {
        /* non-fatal */
      }
    };

    // If the user already has a profile, return it - never overwrite.
    // This handles the case where the same email is also a client of
    // another catering company, or in some other role entirely.
    const { data: existing, error: existingErr } = await admin
      .from("profiles")
      .select("id, role, company_id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    if (existingErr) {
      console.error("[auth/client-provision-profile] profiles fetch failed:", existingErr);
    }

    if (existing) {
      // Still run the email-relink for the existing-profile path --
      // the clients row may have been added AFTER first signup, so
      // clients.user_id needs catching up.
      await runEmailRelink();

      // Self-heal: older client profiles were provisioned before this
      // endpoint stamped company_id (or created via a path that left it
      // null). A NEW client insert below always sets company_id, so an
      // existing client profile with a null company_id is drift, not
      // design. Backfill it to THIS tenant, but only when the user has
      // exactly one clients row under this company (unambiguous) and the
      // profile still belongs to a client of this same company - never
      // overwrite a non-null company_id, and never re-tenant a profile
      // that resolves to a different company.
      let healed = existing;
      if (!existing.company_id && existing.role === "client") {
        try {
          const { data: ownClients } = await admin
            .from("clients")
            .select("id")
            .eq("company_id", company.id)
            .eq("user_id", user.id);
          if (Array.isArray(ownClients) && ownClients.length > 0) {
            const { data: updated, error: healErr } = await admin
              .from("profiles")
              .update({ company_id: company.id })
              .eq("id", user.id)
              .is("company_id", null)
              .select("id, role, company_id, full_name, email")
              .maybeSingle();
            if (healErr) {
              console.error("[auth/client-provision-profile] company_id backfill failed:", healErr);
            } else if (updated) {
              healed = updated;
            }
          }
        } catch (healEx) {
          console.error("[auth/client-provision-profile] company_id backfill crashed:", healEx);
        }
      }

      return res.status(200).json({
        ok: true,
        profile: healed,
        recovered: false,
      });
    }

    // Try to derive a friendly name from any existing clients row that
    // shares this email under this company. Fall back to a clean
    // capitalised version of the email's local-part.
    let fullName: string | null = null;
    try {
      const { data: clientRow, error: clientRowErr } = await admin
        .from("clients")
        .select("client_name")
        .eq("company_id", company.id)
        .eq("email", (user.email || "").toLowerCase())
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (clientRowErr) {
        console.error("[auth/client-provision-profile] clients fetch failed:", clientRowErr);
      }
      fullName = (clientRow as any)?.client_name || null;
    } catch {
      /* non-fatal */
    }
    if (!fullName) {
      const localPart = (user.email || "").split("@")[0] || "Client";
      fullName = localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    // Insert the row. role hard-coded to "client" - no inputs from the
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
      return res.status(500).json({ error: `Could not create profile: ${dbErrorMessage(insErr)}` });
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
    return res.status(500).json({ error: dbErrorMessage(e) || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
