/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared builder for the staff onboarding / invitation email.
 *
 * Used by both /api/admin/create-user (first invite) and
 * /api/admin/resend-invite (re-send for a pending user). Keeps the
 * branded HTML + the "mint a set-password link" logic in one place so
 * the two endpoints can't drift.
 *
 * Flow: mint a Supabase recovery (set-password) action link and send
 * "You've been invited to {company} - set your password". The invitee
 * clicks, lands on /auth/reset-password (which seeds the session from
 * the link), sets their OWN password, and is taken into their portal -
 * no password travels by email.
 *
 * Fallbacks (so onboarding still completes if the link can't be minted):
 *   - tempPassword provided -> email the temp password + login URL.
 *   - neither -> email "use Forgot password at {loginUrl}".
 */
import { emailService } from "@/services/emailService";

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// "kitchen_staff" -> "Kitchen staff"
export function humaniseRole(role: string): string {
  const spaced = String(role || "").replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "team member";
}

export interface StaffInviteArgs {
  email: string;
  fullName: string;
  role: string;
  companyId: string;
  baseUrl: string;
  /** Optional - only used as a fallback when the set-password link can't be minted. */
  tempPassword?: string;
}

export interface StaffInviteResult {
  /** True only when the email provider actually accepted the send. */
  emailed: boolean;
  /** emailService error_code when emailed=false (e.g. "no_provider"). */
  errorCode?: string;
  /** Which variant was sent / attempted. */
  via: "invite_link" | "temp_password" | "fallback";
  /** Staff login URL, for the caller to surface when email failed. */
  loginUrl: string;
}

/**
 * Build + send the invite email. Never throws. Returns a structured
 * result so the caller can tell the admin whether the invite actually
 * went out, and fall back to showing the credentials when it didn't
 * (e.g. the tenant has no email provider configured yet).
 */
export async function sendStaffInviteEmail(
  admin: any,
  args: StaffInviteArgs,
): Promise<StaffInviteResult> {
  try {
    const { data: company } = await admin
      .from("companies")
      .select("company_name, slug, primary_color")
      .eq("id", args.companyId)
      .maybeSingle();
    const companyName = (company as any)?.company_name || "your team";
    const slug = (company as any)?.slug || "";
    const accent = (company as any)?.primary_color || "#9333ea";
    const loginUrl = slug ? `${args.baseUrl}/${slug}/login` : `${args.baseUrl}/auth/login`;
    const firstName = (args.fullName || "there").trim().split(/\s+/)[0] || "there";
    const roleLabel = humaniseRole(args.role);

    // Try to mint a set-password (recovery) link so the invitee picks
    // their own password instead of receiving a temp one by email.
    let inviteLink: string | null = null;
    try {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: args.email,
        options: { redirectTo: `${args.baseUrl}/auth/reset-password?invite=1` },
      });
      if (!linkErr) inviteLink = linkData?.properties?.action_link || null;
      else console.warn("[staffInviteEmail] generateLink failed:", linkErr.message);
    } catch (linkEx: any) {
      console.warn("[staffInviteEmail] generateLink threw:", linkEx?.message);
    }

    const header = `<tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a">You've been invited to ${escapeHtml(companyName)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569">
            Hi ${escapeHtml(firstName)}, you've been added to ${escapeHtml(companyName)} as <strong>${escapeHtml(roleLabel)}</strong>.`;

    const footer = `        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#94a3b8;line-height:1.5">
          Sent by ${escapeHtml(companyName)} via CateringMS. If you weren't expecting this, you can ignore this email.
        </td></tr>`;

    let inner: string;
    let subject: string;
    let via: StaffInviteResult["via"] = "fallback";
    if (inviteLink) {
      via = "invite_link";
      subject = `You've been invited to ${companyName}`;
      inner = `${header} Set your password to activate your account and sign in.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td align="center" style="border-radius:10px;background:${accent}">
            <a href="${inviteLink}" style="display:inline-block;padding:14px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none">Set your password</a>
          </td></tr></table>
          <p style="margin:0 0 6px;font-size:13px;color:#94a3b8">Or paste this URL in your browser:</p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#475569">${inviteLink}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8">
            Once your password is set, sign in any time at <a href="${loginUrl}" style="color:${accent}">${loginUrl}</a>.
          </p>`;
    } else if (args.tempPassword) {
      via = "temp_password";
      subject = `Your ${companyName} staff sign-in details`;
      inner = `${header} Sign in with the details below, then change your password.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
            <tr><td style="padding:16px 18px;font-size:14px;color:#0f172a;line-height:1.9">
              <div><span style="color:#64748b">Email:</span> <strong>${escapeHtml(args.email)}</strong></div>
              <div><span style="color:#64748b">Temporary password:</span> <strong style="font-family:Menlo,Consolas,monospace">${escapeHtml(args.tempPassword)}</strong></div>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" style="border-radius:10px;background:${accent}">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none">Sign in to your portal</a>
          </td></tr></table>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8">
            For your security, please change this password after your first sign-in.
          </p>`;
    } else {
      subject = `You've been invited to ${companyName}`;
      inner = `${header} To activate your account, go to the sign-in page and choose "Forgot password" to set your password.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td align="center" style="border-radius:10px;background:${accent}">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none">Go to sign-in</a>
          </td></tr></table>`;
    }

    const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden">
        ${inner}
${footer}
      </table>
    </td></tr>
  </table>
</body></html>`;

    const detailed = await emailService.sendEmailDetailed({
      companyId: args.companyId,
      to: args.email,
      subject,
      body: html,
      bypassQuarantine: true,
      // Brand-new companies have no email sender yet; let the invite go
      // out via the platform shared sender so the first staff member can
      // still be onboarded.
      allowPlatformFallback: true,
      _client: admin,
    } as any);
    return {
      emailed: !!detailed.success,
      errorCode: detailed.success ? undefined : ((detailed as any).error_code || "unknown"),
      via,
      loginUrl,
    };
  } catch (e: any) {
    console.warn("[staffInviteEmail] send failed (non-blocking):", e?.message);
    return { emailed: false, errorCode: "unknown", via: "fallback", loginUrl: `${args.baseUrl}/auth/login` };
  }
}
