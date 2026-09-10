/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sends the access-change notice used when an admin assigns roles to an
 * existing staff account. Existing passwords are never readable, so the
 * user receives a secure Supabase set-password link instead of a password
 * copied into email.
 */
import { emailService } from "@/services/emailService";
import { escapeHtml, humaniseRole } from "@/lib/staffInviteEmail";

export interface StaffAccessChangeEmailArgs {
  admin: any;
  companyId: string;
  baseUrl: string;
  target: { email: string | null; fullName: string | null };
  actor: { email: string | null; fullName: string | null };
  roles: string[];
  primaryRole: string;
}

export interface StaffAccessChangeEmailResult {
  userEmailSent: boolean;
  adminEmailSent: boolean;
}

export async function sendStaffAccessChangeEmails(
  args: StaffAccessChangeEmailArgs,
): Promise<StaffAccessChangeEmailResult> {
  let userEmailSent = false;
  let adminEmailSent = false;

  try {
    const { data: company } = await args.admin
      .from("companies")
      .select("company_name, slug, primary_color")
      .eq("id", args.companyId)
      .maybeSingle();
    const companyName = (company as any)?.company_name || "your team";
    const slug = (company as any)?.slug || "";
    const accent = (company as any)?.primary_color || "#9333ea";
    const loginUrl = slug
      ? `${args.baseUrl}/${slug}/login`
      : `${args.baseUrl}/auth/login`;
    const resetUrl = `${args.baseUrl}/auth/reset-password?invite=1`;
    const roleList = Array.from(new Set(args.roles.map(humaniseRole))).join(", ");
    const primaryLabel = humaniseRole(args.primaryRole);
    const targetName = args.target.fullName || args.target.email || "Staff member";

    let setPasswordLink: string | null = null;
    if (args.target.email) {
      try {
        const { data, error } = await args.admin.auth.admin.generateLink({
          type: "recovery",
          email: args.target.email,
          options: { redirectTo: resetUrl },
        });
        if (!error) setPasswordLink = data?.properties?.action_link || null;
      } catch (error: any) {
        console.warn("[staffAccessChangeEmail] set-password link failed:", error?.message);
      }
    }

    if (args.target.email) {
      const userAction = setPasswordLink
        ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#475569">Your account is active. Use the button below to choose your password, then sign in to your portal.</p>
           <a href="${setPasswordLink}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:${accent};color:#fff;text-decoration:none;font-weight:600">Set your password</a>
           <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#94a3b8">After setting it, sign in at <a href="${loginUrl}" style="color:${accent}">${loginUrl}</a>.</p>`
        : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#475569">Your account is active. Sign in and use “Forgot password?” to choose a password.</p>
           <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:${accent};color:#fff;text-decoration:none;font-weight:600">Go to sign in</a>`;
      const userResult = await emailService.sendEmailDetailed({
        companyId: args.companyId,
        to: args.target.email,
        subject: `Your ${companyName} access was updated`,
        body: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Helvetica,Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f8fafc"><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px">Your access was updated</h1><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569">Hi ${escapeHtml((args.target.fullName || "there").split(/\s+/)[0])}, an administrator updated your access for <strong>${escapeHtml(companyName)}</strong>.</p><p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#475569"><strong>Roles:</strong> ${escapeHtml(roleList)}<br/><strong>Primary role:</strong> ${escapeHtml(primaryLabel)}</p>${userAction}</td></tr><tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#94a3b8">If you did not expect this change, contact your administrator.</td></tr></table></td></tr></table></body></html>`,
        allowPlatformFallback: true,
        bypassQuarantine: true,
        _client: args.admin,
      } as any);
      userEmailSent = !!userResult.success;
    }

    const actorEmail = args.actor.email;
    if (actorEmail && actorEmail.toLowerCase() !== String(args.target.email || "").toLowerCase()) {
      const adminResult = await emailService.sendEmailDetailed({
        companyId: args.companyId,
        to: actorEmail,
        subject: `Staff access updated: ${targetName}`,
        body: `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Helvetica,Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f8fafc"><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px">Staff access updated</h1><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569"><strong>${escapeHtml(targetName)}</strong> now has access to <strong>${escapeHtml(companyName)}</strong>.</p><p style="margin:0;font-size:14px;line-height:1.7;color:#475569"><strong>Roles:</strong> ${escapeHtml(roleList)}<br/><strong>Primary role:</strong> ${escapeHtml(primaryLabel)}<br/><strong>Account:</strong> Active</p></td></tr></table></td></tr></table></body></html>`,
        allowPlatformFallback: true,
        bypassQuarantine: true,
        _client: args.admin,
      } as any);
      adminEmailSent = !!adminResult.success;
    }
  } catch (error: any) {
    // Access changes must remain successful even if a tenant has no email
    // sender configured. The result lets the API/UI report that accurately.
    console.warn("[staffAccessChangeEmail] notification failed:", error?.message);
  }

  return { userEmailSent, adminEmailSent };
}
