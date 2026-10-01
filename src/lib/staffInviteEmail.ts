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
 * Link generation or delivery failure is reported to the admin for resend.
 * Only emails containing an activation link can be reported as delivered.
 */
import { randomUUID } from "crypto";
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
  /** Legacy caller compatibility. Temporary passwords are never emailed. */
  tempPassword?: string;
  /** Already minted by the staff provisioning endpoint. */
  acceptInviteUrl?: string;
  userId?: string;
  invitedBy?: string;
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

    if (args.userId && args.invitedBy) {
      const { data: pending, error: lookupError } = await admin.from("staff_invitations")
        .select("id").eq("company_id", args.companyId).eq("user_id", args.userId)
        .eq("status", "pending").limit(1).maybeSingle();
      if (lookupError) return { emailed: false, errorCode: "invitation_tracking_failed", via: "fallback", loginUrl };
      const invitation = {
        company_id: args.companyId, user_id: args.userId, email: args.email,
        full_name: args.fullName, role: args.role, invited_by: args.invitedBy,
        status: "pending", invitation_token: randomUUID(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const { error: trackingError } = pending
        ? await admin.from("staff_invitations").update(invitation).eq("id", pending.id)
        : await admin.from("staff_invitations").insert(invitation);
      if (trackingError) return { emailed: false, errorCode: "invitation_tracking_failed", via: "fallback", loginUrl };
    }

    // Try to mint a set-password (recovery) link so the invitee picks
    // their own password instead of receiving a temp one by email.
    let inviteLink: string | null = args.acceptInviteUrl || null;
    if (!inviteLink) try {
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

    if (!inviteLink) {
      return { emailed: false, errorCode: "link_generation_failed", via: "fallback", loginUrl };
    }

    const header = `<tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a">You've been invited to ${escapeHtml(companyName)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569">
            Hi ${escapeHtml(firstName)}, you've been added to ${escapeHtml(companyName)} as <strong>${escapeHtml(roleLabel)}</strong>.`;

    const footer = `        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#94a3b8;line-height:1.5">
          Sent by ${escapeHtml(companyName)} via CateringMS. If you weren't expecting this, you can ignore this email.
        </td></tr>`;

    const subject = `You've been invited to ${companyName}`;
    const inner = `${header} Set your password to activate your account and sign in.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td align="left" style="border-radius:10px;background:${accent}">
            <a href="${inviteLink}" style="display:inline-block;padding:14px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none">Set your password</a>
          </td></tr></table>
          <p style="margin:0 0 6px;font-size:13px;color:#94a3b8">Or paste this URL in your browser:</p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#475569">${inviteLink}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8">
            Once your password is set, sign in any time at <a href="${loginUrl}" style="color:${accent}">${loginUrl}</a>.
          </p>`;

    const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="left">
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
      via: "invite_link",
      loginUrl,
    };
  } catch (e: any) {
    console.warn("[staffInviteEmail] send failed (non-blocking):", e?.message);
    return { emailed: false, errorCode: "unknown", via: "fallback", loginUrl: `${args.baseUrl}/auth/login` };
  }
}
