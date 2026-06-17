/**
 * POST /api/emails/non-login-welcome
 *
 * Send the "you're on the books, here's how it works" branded email to
 * a staff member who's been added without a portal login. This is the
 * other half of P3 comms: the audit gap was that staff who never get
 * a portal invite also get nothing, which leaves them confused about
 * how their hours / pay / shifts are now tracked.
 *
 * Tenant-scoped: caller must be admin/owner/super_admin of the
 * staff member's company. We pull brand from companies + staff role
 * from kitchen_staff_members.departments.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import * as React from "react";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendBrandedEmail } from "@/server/emails/sendBrandedEmail";
import NonLoginStaffWelcomeEmail, {
  type NonLoginRole,
} from "@/emails/NonLoginStaffWelcomeEmail";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

const VALID_ROLES: NonLoginRole[] = ["kitchen", "cleaning", "driver", "shopping", "service", "office"];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user: caller },
    } = await ssr.auth.getUser();
    if (!caller) return res.status(401).json({ error: "Not signed in" });

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id, full_name")
      .eq("id", caller.id)
      .maybeSingle();
    const callerRole = ((callerProfile as never)?.["active_role"] ||
      (callerProfile as never)?.["role"] ||
      "") as string;
    if (!ALLOWED_CALLER_ROLES.has(callerRole)) {
      return res.status(403).json({ error: "Only admins / owners can send this email" });
    }
    const callerCompanyId = (callerProfile as never)?.["company_id"] as string | null;
    if (!callerCompanyId) return res.status(403).json({ error: "Caller has no company" });

    const { staffId } = (req.body || {}) as { staffId?: string };
    if (!staffId) return res.status(400).json({ error: "Missing staffId" });

    const admin = getServiceSupabase();

    const { data: staff } = await admin
      .from("kitchen_staff_members")
      .select("id, company_id, full_name, email, departments, role_title")
      .eq("id", staffId)
      .maybeSingle();
    if (!staff) return res.status(404).json({ error: "Staff member not found" });
    if (staff.company_id !== callerCompanyId && callerRole !== "super_admin") {
      return res.status(403).json({ error: "Cross-tenant blocked" });
    }
    if (!staff.email) {
      return res.status(400).json({ error: "Staff has no email on file" });
    }

    const { data: company } = await admin
      .from("companies")
      .select("company_name, primary_color, logo_url")
      .eq("id", staff.company_id)
      .maybeSingle();
    const brand = {
      name: company?.company_name || "Your team",
      primaryColor: company?.primary_color || undefined,
      logoUrl: company?.logo_url || undefined,
    };

    // Pick a primary role for the email - first item in departments[]
    // that we have copy for, else default to kitchen.
    const depts: string[] = (staff.departments as string[]) || [];
    const role: NonLoginRole =
      (VALID_ROLES.find((r) => depts.includes(r)) as NonLoginRole) || "kitchen";

    const firstName = (staff.full_name || "").split(" ")[0] || staff.full_name || "there";
    const adderName =
      ((callerProfile as never)?.["full_name"] as string | undefined) || undefined;

    const result = await sendBrandedEmail({
      component: React.createElement(NonLoginStaffWelcomeEmail, {
        recipientFirstName: firstName,
        role,
        brand,
        adderName,
      }),
      to: staff.email,
      subject: `You're on the books at ${brand.name}`,
      companyId: staff.company_id,
      templateType: `staff_welcome_no_login_${role}`,
      recipientName: staff.full_name || undefined,
    });

    return res.status(result.ok ? 200 : 502).json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? dbErrorMessage(e) : "Send failed";
    console.error("non-login-welcome failed:", e);
    return res.status(500).json({ error: msg });
  }
}

export default withApiLogging(handler);
