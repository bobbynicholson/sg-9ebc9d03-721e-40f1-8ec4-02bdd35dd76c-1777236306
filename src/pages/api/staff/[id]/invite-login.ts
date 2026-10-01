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
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { randomUUID } from "crypto";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendStaffInviteEmail } from "@/lib/staffInviteEmail";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

// Write the CANONICAL user_role enum value to profiles.role. The enum
// only has the *_staff forms - mapping to "kitchen"/"cleaning"/"shopping"
// (as this did) threw `invalid input value for enum user_role: "kitchen"`
// and every kitchen/cleaning/shopping portal invite 500'd. Same fix
// already applied in create-user.ts.
const ROLE_MAP: Record<string, string> = {
  kitchen_manager: "kitchen_staff",
  kitchen_staff: "kitchen_staff",
  cleaning_manager: "cleaning_staff",
  cleaning_staff: "cleaning_staff",
  shopping_staff: "shopping_staff",
  driver: "driver",
  admin: "admin",
  owner: "admin",
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user: callerAuth } } = await ssr.auth.getUser();
    if (!callerAuth) return res.status(401).json({ error: "Not signed in" });

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, full_name")
      .eq("id", callerAuth.id)
      .maybeSingle();
    const callerRole = ((callerProfile as any)?.active_role || (callerProfile as any)?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(callerRole)) {
      return res.status(403).json({ error: "Only owners / admins can invite staff to the portal" });
    }
    const callerCompanyId = (callerProfile as any)?.company_id as string | null;
    if (!callerCompanyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const staffId = String(req.query.id || "");
    if (!staffId) return res.status(400).json({ error: "Missing staff id" });

    const { role: requestedRole } = (req.body || {}) as { role?: string };
    const roleInput = (requestedRole || "kitchen_staff").toLowerCase();
    const dbRole = ROLE_MAP[roleInput];
    if (!dbRole) return res.status(400).json({ error: "Invalid portal role" });

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
      .select("id, company_id, full_name, email, phone, linked_profile_id, departments, role_title, region_id")
      .eq("id", staffId)
      .maybeSingle();
    if (staffErr || !staff) return res.status(404).json({ error: "Staff member not found" });
    if (staff.company_id !== callerCompanyId && callerRole !== "super_admin") {
      return res.status(403).json({ error: "Cross-tenant invite blocked" });
    }
    if (!staff.email) {
      return res.status(400).json({ error: "Staff member has no email on record. Add one first." });
    }
    const email = String(staff.email).trim().toLowerCase();
    let authUserId: string | null = staff.linked_profile_id || null;
    // Page through auth users so retries can recover partially-created accounts.
    if (!authUserId) {
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return res.status(500).json({ error: "Could not check existing portal accounts. Try again." });
        const users = data?.users || [];
        const match = users.find((u: any) => u.email?.toLowerCase() === email);
        if (match) { authUserId = match.id; break; }
        if (users.length < 1000) break;
      }
    }
    let existingProfile: any = null;
    if (authUserId) {
      const { data, error } = await admin.from("profiles")
        .select("id, company_id, role, active_role").eq("id", authUserId).maybeSingle();
      if (error) return res.status(500).json({ error: "Could not check existing profile" });
      existingProfile = data;
      if (data?.company_id && data.company_id !== staff.company_id) {
        return res.status(409).json({ error: "This email already belongs to another company. Use a different email." });
      }
      const { data: authData, error: authError } = await admin.auth.admin.getUserById(authUserId);
      if (authError || !authData?.user || authData.user.email?.toLowerCase() !== email) {
        return res.status(409).json({ error: "The linked login has a different email. Manage its email in Users before resending." });
      }
    }
    // Use the current portal's origin for both custom and shared portal hosts.
    const origin = String(req.headers.origin || `https://${req.headers.host}`).replace(/\/$/, "");
    const finalRedirect = `${origin}/auth/reset-password?invite=1`;

    // Generate the activation link without sending Supabase's default
    // template - we send our own branded React-Email instead.
    let acceptInviteUrl: string | null = null;
    if (!authUserId) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: finalRedirect,
          data: {
            full_name: staff.full_name,
            company_id: staff.company_id,
            role: dbRole,
            active_role: roleInput,
            phone: staff.phone || null,
            invited_from: "staff_admin",
            staff_member_id: staff.id,
          },
        },
      });
      if (linkErr || !linkData?.user || !linkData?.properties?.action_link) {
        console.error("generateLink invite failed:", linkErr);
        return res.status(500).json({ error: dbErrorMessage(linkErr) || "Could not create invite link" });
      }
      authUserId = linkData.user.id;
      acceptInviteUrl = linkData.properties.action_link;
    } else {
      // Existing auth user - generate a recovery link they can use to set
      // up their portal access without going through invite-acceptance.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: finalRedirect },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        console.error("generateLink recovery failed:", linkErr);
        return res.status(500).json({ error: dbErrorMessage(linkErr) || "Could not create login link" });
      }
      acceptInviteUrl = linkData.properties.action_link;
    }

    // Upsert a profile row so the auth user has a tenant + role on file
    // the moment they accept the invite.
    const { error: profileErr } = existingProfile?.company_id ? { error: null } : await admin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          email,
          full_name: staff.full_name,
          phone: staff.phone || null,
          company_id: staff.company_id,
          role: dbRole,
          active_role: roleInput,
          is_active: true,
          region_id: staff.region_id || null,
        },
        { onConflict: "id" },
      );
    if (profileErr) {
      console.error("Profile upsert failed:", profileErr);
      return res.status(500).json({ error: dbErrorMessage(profileErr) });
    }

    // Stamp linked_profile_id so the staff member is now bound to the
    // auth user.
    const { error: linkErr } = await admin
      .from("kitchen_staff_members")
      .update({ linked_profile_id: authUserId, updated_at: new Date().toISOString() })
      .eq("id", staffId);
    if (linkErr) {
      console.error("Linking staff to profile failed:", linkErr);
      return res.status(500).json({ error: dbErrorMessage(linkErr) });
    }

    // Record the invitation before sending so a failed delivery remains visible
    // and can be retried from either Staff or Users & Roles.
    const { data: pending, error: pendingErr } = await admin.from("staff_invitations")
      .select("id").eq("company_id", staff.company_id).eq("user_id", authUserId)
      .eq("status", "pending").limit(1).maybeSingle();
    if (pendingErr) return res.status(500).json({ error: "Login created, but invitation tracking failed. Retry the invite." });
    const invitation = {
      company_id: staff.company_id, user_id: authUserId, email,
      full_name: staff.full_name, role: existingProfile?.active_role || roleInput,
      invited_by: callerAuth.id, status: "pending",
      invitation_token: randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const { error: invitationErr } = pending
      ? await admin.from("staff_invitations").update(invitation).eq("id", pending.id)
      : await admin.from("staff_invitations").insert(invitation);
    if (invitationErr) return res.status(500).json({ error: dbErrorMessage(invitationErr) });

    if (!existingProfile?.company_id) {
      const department = roleInput.startsWith("kitchen") ? "kitchen"
        : roleInput.startsWith("cleaning") ? "cleaning"
        : roleInput === "shopping_staff" ? "buyer" : dbRole;
      const { error: deptErr } = await admin.from("user_departments").insert({
        user_id: authUserId, department, is_primary: true, assigned_by: callerAuth.id,
      });
      if (deptErr) console.warn("Could not seed staff department:", deptErr);
      if (roleInput.endsWith("_manager")) {
        const { error: managerErr } = await admin.from("user_departments").insert({
          user_id: authUserId, department: roleInput, is_primary: false, assigned_by: callerAuth.id,
        });
        if (managerErr) console.warn("Could not seed manager access:", managerErr);
      }
    }

    const result = await sendStaffInviteEmail(admin, {
      email, fullName: staff.full_name || "", role: existingProfile?.active_role || roleInput,
      companyId: staff.company_id, baseUrl: origin, acceptInviteUrl: acceptInviteUrl as string,
    });
    if (!result.emailed) {
      return res.status(502).json({
        ok: false, profile_id: authUserId, email_sent: false, errorCode: result.errorCode,
        error: "Portal login created and listed in Users, but the invite email could not be sent. Check Email settings and resend the invite.",
      });
    }
    return res.status(200).json({
      ok: true, profile_id: authUserId, email_sent: true,
      message: `Invite sent to ${email}`,
    });
  } catch (e: any) {
    console.error("invite-login crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Invite failed" });
  }
}

export default withApiLogging(handler);
