/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/staff/[id]/invite-login
 *
 * Invite an existing kitchen_staff_members row to the portal: creates
 * an auth user, sends them a magic-link / set-password email,
 * provisions a profiles row in their company with the chosen role,
 * and stamps staff.linked_profile_id so future actions on that staff
 * member resolve to one identity.
 *
 * Use case: most kitchen + cleaning staff don't need a portal login;
 * the manager clocks them in/out via the tile-board. But a sous chef
 * who runs prep schedules, or a head cleaner who reports issues,
 * eventually needs to log in. This endpoint lets the owner upgrade
 * any staff member to a portal user without leaving /admin/staff.
 *
 * Tenant-scoped via session. Caller must be admin/owner/super_admin.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as React from "react";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendBrandedEmail } from "@/server/emails/sendBrandedEmail";
import StaffInviteEmail, { type InvitedRole } from "@/emails/StaffInviteEmail";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

const ROLE_MAP: Record<string, string> = {
  kitchen_staff: "kitchen",
  cleaning_staff: "cleaning",
  shopping_staff: "shopping",
  driver: "driver",
  admin: "admin",
  owner: "admin",
};

const BRANDED_ROLE_MAP: Record<string, InvitedRole> = {
  kitchen: "kitchen",
  cleaning: "cleaning",
  shopping: "shopping",
  driver: "driver",
  admin: "admin",
  company_admin: "company_admin",
  owner: "company_admin",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user: callerAuth } } = await ssr.auth.getUser();
    if (!callerAuth) return res.status(401).json({ error: "Not signed in" });

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, full_name")
      .eq("id", callerAuth.id)
      .single();
    const callerRole = ((callerProfile as any)?.active_role || (callerProfile as any)?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(callerRole)) {
      return res.status(403).json({ error: "Only owners / admins can invite staff to the portal" });
    }
    const callerCompanyId = (callerProfile as any)?.company_id as string | null;
    if (!callerCompanyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const staffId = String(req.query.id || "");
    if (!staffId) return res.status(400).json({ error: "Missing staff id" });

    const { role: requestedRole, redirectTo } = (req.body || {}) as { role?: string; redirectTo?: string };
    const roleInput = (requestedRole || "kitchen_staff").toLowerCase();
    const dbRole = ROLE_MAP[roleInput] || roleInput;

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch (e: any) {
      console.error("Service role unavailable:", e);
      return res.status(500).json({ error: "Server is missing service-role credentials." });
    }

    // Tenant check + grab staff details to seed the profile.
    const { data: staff, error: staffErr } = await admin
      .from("kitchen_staff_members")
      .select("id, company_id, full_name, email, phone, linked_profile_id, departments, role_title")
      .eq("id", staffId)
      .maybeSingle();
    if (staffErr || !staff) return res.status(404).json({ error: "Staff member not found" });
    if (staff.company_id !== callerCompanyId && callerRole !== "super_admin") {
      return res.status(403).json({ error: "Cross-tenant invite blocked" });
    }
    if (!staff.email) {
      return res.status(400).json({ error: "Staff member has no email on record. Add one first." });
    }
    if (staff.linked_profile_id) {
      return res.status(409).json({ error: "Staff member already has a portal login linked." });
    }

    // Look for an existing auth user with this email (e.g. a returning
    // staff member who was invited before).
    let authUserId: string | null = null;
    try {
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = existing?.users?.find((u: any) => u.email?.toLowerCase() === String(staff.email).toLowerCase());
      if (match) authUserId = match.id;
    } catch (lookupErr: any) {
      console.warn("Auth user lookup failed:", lookupErr?.message);
    }

    // Resolve the tenant brand once -- used for the invite email styling.
    const { data: company } = await admin
      .from("companies")
      .select("company_name, primary_color, logo_url, slug")
      .eq("id", staff.company_id)
      .maybeSingle();
    const brand = {
      name: company?.company_name || "Your team",
      primaryColor: company?.primary_color || undefined,
      logoUrl: company?.logo_url || undefined,
    };

    // Pick the invite acceptance redirect destination. If the caller
    // didn't pass one, send them to the tenant's auth callback so they
    // land back inside the company portal after setting a password.
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const finalRedirect =
      redirectTo ||
      (company?.slug ? `${origin}/${company.slug}/auth/callback` : `${origin}/auth/callback`);

    // Generate the activation link without sending Supabase's default
    // template -- we send our own branded React-Email instead.
    let acceptInviteUrl: string | null = null;
    if (!authUserId) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: staff.email,
        options: {
          redirectTo: finalRedirect,
          data: {
            full_name: staff.full_name,
            company_id: staff.company_id,
            role: dbRole,
            active_role: dbRole,
            phone: staff.phone || null,
            invited_from: "staff_admin",
            staff_member_id: staff.id,
          },
        },
      });
      if (linkErr || !linkData?.user || !linkData?.properties?.action_link) {
        console.error("generateLink invite failed:", linkErr);
        return res.status(500).json({ error: linkErr?.message || "Could not create invite link" });
      }
      authUserId = linkData.user.id;
      acceptInviteUrl = linkData.properties.action_link;
    } else {
      // Existing auth user -- generate a magic-link they can use to set
      // up their portal access without going through invite-acceptance.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: staff.email,
        options: { redirectTo: finalRedirect },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        console.error("generateLink magiclink failed:", linkErr);
        return res.status(500).json({ error: linkErr?.message || "Could not create login link" });
      }
      acceptInviteUrl = linkData.properties.action_link;
    }

    // Upsert a profile row so the auth user has a tenant + role on file
    // the moment they accept the invite.
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          email: staff.email,
          full_name: staff.full_name,
          phone: staff.phone || null,
          company_id: staff.company_id,
          role: dbRole,
          active_role: dbRole,
          is_active: true,
        },
        { onConflict: "id" },
      );
    if (profileErr) {
      console.error("Profile upsert failed:", profileErr);
      return res.status(500).json({ error: profileErr.message });
    }

    // Stamp linked_profile_id so the staff member is now bound to the
    // auth user.
    const { error: linkErr } = await admin
      .from("kitchen_staff_members")
      .update({ linked_profile_id: authUserId, updated_at: new Date().toISOString() })
      .eq("id", staffId);
    if (linkErr) {
      console.error("Linking staff to profile failed:", linkErr);
      return res.status(500).json({ error: linkErr.message });
    }

    // Send the branded invite email. Don't fail the whole request if
    // the send fails -- the auth user + profile are already provisioned,
    // and the admin can resend from the staff list.
    const recipientFirstName = (staff.full_name || "").split(" ")[0] || staff.full_name || "there";
    const inviterName =
      ((callerProfile as any)?.full_name as string | undefined) || undefined;
    const brandedRole = BRANDED_ROLE_MAP[dbRole] || "kitchen";
    let emailOk = true;
    let emailProvider: string | undefined;
    try {
      const result = await sendBrandedEmail({
        component: React.createElement(StaffInviteEmail, {
          recipientFirstName,
          inviterName,
          acceptInviteUrl: acceptInviteUrl as string,
          role: brandedRole,
          brand,
        }),
        to: staff.email,
        subject: `${brand.name} invited you to the ${brandedRole} portal`,
        companyId: staff.company_id,
        templateType: `staff_invite_${brandedRole}`,
        recipientName: staff.full_name || undefined,
      });
      emailOk = result.ok;
      emailProvider = result.provider;
    } catch (sendErr) {
      console.error("Branded invite email failed:", sendErr);
      emailOk = false;
    }

    return res.status(200).json({
      ok: true,
      profile_id: authUserId,
      email_sent: emailOk,
      email_provider: emailProvider,
      message: emailOk
        ? `Invite sent to ${staff.email}`
        : `Login provisioned but the invite email didn't go through. Try resending.`,
    });
  } catch (e: any) {
    console.error("invite-login crashed:", e);
    return res.status(500).json({ error: e?.message || "Invite failed" });
  }
}
