/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";
import { emailService } from "@/services/emailService";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// "kitchen_staff" -> "Kitchen staff"
function humaniseRole(role: string): string {
  const spaced = String(role || "").replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "team member";
}

/**
 * Email the newly-created staff member their login link + temporary
 * password.
 *
 * Why: the direct-create path (this endpoint) used to return the temp
 * password ONLY to the admin who created the account, via a one-off
 * prompt - the new staff member received nothing, so the admin had to
 * relay the password by hand (and often didn't). Now the user gets a
 * branded email with their portal URL, their email, the temp password
 * and a "change it on first sign-in" nudge.
 *
 * Sent with the service-role client + bypassQuarantine because this is
 * a system-critical onboarding mail (same treatment as the magic-link
 * sign-in mail). Best-effort: failures are logged but never block user
 * creation - the admin still has the temp password in the API response
 * as the offline fallback when a tenant has no email provider wired up.
 */
async function sendStaffCredentialsEmail(
  admin: any,
  args: {
    email: string;
    fullName: string;
    role: string;
    companyId: string;
    tempPassword: string;
    baseUrl: string;
  },
): Promise<void> {
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

    const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden">
        <tr><td style="padding:28px 28px 8px">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a">You've been added to ${escapeHtml(companyName)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569">
            Hi ${escapeHtml(firstName)}, an account has been created for you on ${escapeHtml(companyName)} as <strong>${escapeHtml(roleLabel)}</strong>. Sign in with the details below.
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
          <p style="margin:0 0 6px;font-size:13px;color:#94a3b8">Or paste this URL in your browser:</p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#475569">${loginUrl}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8">
            For your security, please change this password after your first sign-in.
          </p>
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#94a3b8;line-height:1.5">
          Sent by ${escapeHtml(companyName)} via CateringMS.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await emailService.sendEmail({
      companyId: args.companyId,
      to: args.email,
      subject: `Your ${companyName} staff sign-in details`,
      body: html,
      bypassQuarantine: true,
      _client: admin,
    } as any);
  } catch (e: any) {
    console.warn("[create-user] staff credentials email failed (non-blocking):", e?.message);
  }
}


// Map UserRole enum values to database-accepted role values.
//
// FIX (2026-06-13): the staff roles used to map to short forms
// (kitchen_staff -> "kitchen", etc.). That was correct when
// profiles.role was a free-text column, but the live `user_role` enum
// only has the *_staff forms (kitchen_staff / shopping_staff /
// cleaning_staff) - there is no "kitchen"/"shopping"/"cleaning" member.
// So the upsert here failed with "invalid input value for enum
// user_role: 'kitchen'", the handler rolled back the auth user, and
// kitchen / shopping / cleaning staff could never be created (and thus
// never sign in). Map each role to its canonical enum value instead;
// roles not listed fall through unchanged (driver, waiter, outsource,
// company_admin, region_admin, sales_admin, super_admin all already
// equal their enum value).
function mapRoleToDatabase(role: string): string {
  const roleMap: Record<string, string> = {
    "kitchen_staff": "kitchen_staff",
    "cleaning_staff": "cleaning_staff",
    "shopping_staff": "shopping_staff",
    "super_admin": "super_admin",
    // 'owner' is a valid enum value, but the platform treats company
    // owners as 'admin' for routing + RLS, so keep the existing
    // downgrade rather than introduce a second admin-tier role here.
    "owner": "admin",
    "admin": "admin",
    "driver": "driver",
    "client": "client",
    // Multi-branch roles map straight through to the user_role enum.
    "company_admin": "company_admin",
    "region_admin": "region_admin",
    "sales_admin": "sales_admin",
  };
  return roleMap[role] || role;
}

// Roles that are scoped to one or more branches. region_id +
// regions_covered are only meaningful for these.
const REGION_SCOPED_ROLES = new Set(["region_admin", "kitchen", "kitchen_staff", "driver", "shopping", "shopping_staff", "cleaning", "cleaning_staff"]);

// Roles permitted to create users via this endpoint.
const CALLER_ROLES_ALLOWED = new Set(["super_admin", "company_admin", "admin", "owner"]);

/**
 * Create a new user under the caller's company.
 *
 * Hardening notes:
 *   - Whole handler is wrapped in a single try/catch so any unexpected
 *     throw still returns a JSON error. Without this, a thrown env-var
 *     error or supabase client crash leaks an HTML 500 page that the
 *     browser can't parse, leaving the operator with a useless generic
 *     "please try again" toast.
 *   - Service-role admin.createUser is the only auth path; rollback
 *     with admin.deleteUser if the profile insert fails so retries are
 *     clean.
 *   - Pre-checks for orphaned auth users (created by an older code
 *     path) and self-heals by completing the missing profile in place
 *     instead of asking the operator to use a different email.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssrClient = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssrClient.auth.getUser();
    if (!callerAuth) {
      return res.status(401).json({
        error: "No active session found. Sign in again and retry.",
      });
    }

    const { data: callerProfile, error: callerProfileErr } = await ssrClient
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    if (callerProfileErr || !callerProfile) {
      return res.status(403).json({
        error: "Caller profile not found, contact support if this persists.",
      });
    }

    const callerRole = (callerProfile as any).active_role || (callerProfile as any).role;
    if (!CALLER_ROLES_ALLOWED.has(callerRole)) {
      return res.status(403).json({
        error: `Forbidden: your role '${callerRole}' is not allowed to create users.`,
      });
    }

    const {
      email,
      full_name,
      phone,
      role,
      company_id,
      drive_time_to_kitchen_minutes,
      vehicle_registration,
      region_id,
      regions_covered,
    } = req.body || {};

    // Sanitise scoping inputs. regions_covered must be a uuid array;
    // empty array means "no regions assigned" which is fail-closed for
    // region_admin (they see nothing). Cross-branch roles ignore both.
    const safeRegionsCovered: string[] | null = Array.isArray(regions_covered)
      ? regions_covered.filter((x: any) => typeof x === "string" && x.length === 36)
      : null;
    const safeRegionId: string | null =
      typeof region_id === "string" && region_id.length === 36 ? region_id : null;

    // Report the SPECIFIC missing field(s). The old blanket message
    // ("Missing required fields: email, full_name, role, company_id")
    // confused operators - they'd filled email + name and couldn't see
    // that only company_id (an invisible derived value, usually a
    // logged-out / unlinked session) was actually absent.
    const missing: string[] = [];
    if (!email) missing.push("email");
    if (!full_name) missing.push("full name");
    if (!role) missing.push("role");
    if (!company_id) missing.push("company");
    if (missing.length > 0) {
      const human =
        !company_id && email && full_name && role
          ? "We couldn't tell which company to add this user to. Sign out and back in, then try again - if it keeps happening, your account isn't linked to a company yet."
          : `Please provide: ${missing.join(", ")}.`;
      return res.status(400).json({ error: human, missing });
    }

    // Audit (May 2026, Wave 6): the previous endpoint accepted a
    // password from the caller, and every UI surface passed the
    // literal "BYPASS_2026". Anyone who had ever read the source or
    // the inline UI hint could log in as any newly-created user
    // across every tenant. Now: server generates a per-user random
    // password, returns it once in the response so the admin can
    // share it via their own channel (WhatsApp / in person /
    // password manager), and the password is never stored or logged
    // anywhere except the auth.users row.
    function generatePassword(): string {
      const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // skipped I O
      const lower = "abcdefghijkmnpqrstuvwxyz"; // skipped l o
      const digits = "23456789"; // skipped 0 1
      const punct = "!@#$%&*";
      const all = upper + lower + digits + punct;
      const len = 14;
      const bytes = new Uint8Array(len);
      // crypto is available in node 18+ runtime; use globalThis
      // for both edge + node compatibility.
      (globalThis as any).crypto.getRandomValues(bytes);
      // Guarantee one of each class so the result passes Supabase's
      // default password complexity rule.
      const guaranteed = [
        upper[bytes[0] % upper.length],
        lower[bytes[1] % lower.length],
        digits[bytes[2] % digits.length],
        punct[bytes[3] % punct.length],
      ];
      const rest = Array.from({ length: len - 4 }, (_, i) => all[bytes[4 + i] % all.length]);
      return [...guaranteed, ...rest]
        .sort(() => 0.5 - ((bytes[0] % 100) / 100))
        .join("");
    }
    const password = generatePassword();

    // Origin for the staff member's login link in the onboarding email.
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (req.headers.origin as string) ||
      `https://${req.headers.host || "cateringms.com"}`;

    if (callerRole !== "super_admin") {
      if ((callerProfile as any).company_id !== company_id) {
        return res.status(403).json({ error: "Cannot create users for another company" });
      }
      if (role === "super_admin") {
        return res.status(403).json({ error: "Cannot create super_admin users" });
      }
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch (e: any) {
      console.error("Service role client unavailable:", e);
      return res.status(500).json({
        error: "Server is missing service-role credentials, check SUPABASE_SERVICE_ROLE_KEY in env.",
      });
    }

    const dbRole = mapRoleToDatabase(role);

    // Pre-check: is there already an auth user with this email? If so, give a
    // clear message instead of the noisy rollback path.
    try {
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = existing?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      if (match) {
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id, role")
          .eq("id", match.id)
          .maybeSingle();

        if (!existingProfile) {
          // Orphan from the old endpoint - update password + create profile
          await admin.auth.admin.updateUserById(match.id, {
            password,
            email_confirm: true,
            user_metadata: { full_name, phone, company_id, role: dbRole, active_role: dbRole },
          });
          const profilePayload: any = {
            id: match.id,
            email,
            full_name,
            phone,
            company_id,
            role: dbRole,
            active_role: dbRole,
            is_active: true,
          };
          if (role === "driver") {
            // Only write columns that exist on profiles. vehicle_details
            // does NOT exist; the actual column for the registration plate
            // is vehicle_registration. drive_time_to_kitchen_minutes is on
            // the table.
            if (vehicle_registration != null) profilePayload.vehicle_registration = vehicle_registration;
            if (drive_time_to_kitchen_minutes != null) profilePayload.drive_time_to_kitchen_minutes = drive_time_to_kitchen_minutes;
          }
          // Branch scoping. Only stamp the columns when the role is
          // region-scoped; cross-branch roles (company_admin, sales_admin)
          // get null/empty so RLS treats them as unrestricted.
          if (REGION_SCOPED_ROLES.has(role)) {
            if (safeRegionId) profilePayload.region_id = safeRegionId;
            if (safeRegionsCovered) profilePayload.regions_covered = safeRegionsCovered;
          }
          const { error: insErr } = await admin.from("profiles").insert([profilePayload]);
          if (insErr) {
            console.error("Healing orphan profile failed:", insErr);
            return res.status(500).json({ error: `Could not finish creating user: ${insErr.message}` });
          }
          // Email the (re)issued credentials to the staff member.
          await sendStaffCredentialsEmail(admin, {
            email,
            fullName: full_name,
            role,
            companyId: company_id,
            tempPassword: password,
            baseUrl,
          });
          return res.status(201).json({
            message: "User restored",
            user: { id: match.id, email },
            tempPassword: password,
            recovered: true,
          });
        }

        return res.status(409).json({
          error: `A user with email ${email} already exists. Use the existing record or pick a different email.`,
        });
      }
    } catch (preErr: any) {
      console.warn("Email pre-check failed:", preErr?.message);
    }

    // Create the auth user with the service role.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone,
        company_id,
        role: dbRole,
        active_role: dbRole,
      },
    });

    if (createErr || !created?.user) {
      console.error("admin.createUser failed:", createErr);
      return res.status(500).json({
        error: createErr?.message || "Could not create user",
      });
    }

    const newUserId = created.user.id;

    // Build the profile patch - only columns that exist on the profiles
    // table. vehicle_details was a phantom column; the real one is
    // vehicle_registration.
    const profileUpdates: any = {
      id: newUserId,
      email,
      full_name,
      phone,
      company_id,
      role: dbRole,
      active_role: dbRole,
      is_active: true,
    };
    if (role === "driver") {
      if (vehicle_registration != null) profileUpdates.vehicle_registration = vehicle_registration;
      if (drive_time_to_kitchen_minutes != null) profileUpdates.drive_time_to_kitchen_minutes = drive_time_to_kitchen_minutes;
    }
    if (REGION_SCOPED_ROLES.has(role)) {
      if (safeRegionId) profileUpdates.region_id = safeRegionId;
      if (safeRegionsCovered) profileUpdates.regions_covered = safeRegionsCovered;
    }

    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert(profileUpdates, { onConflict: "id" });

    if (upsertErr) {
      console.error("Profile upsert failed, rolling back auth user:", upsertErr);
      try {
        await admin.auth.admin.deleteUser(newUserId);
      } catch (rollbackErr: any) {
        console.error("Rollback delete failed:", rollbackErr?.message);
      }
      return res.status(500).json({
        error: `Could not save profile: ${upsertErr.message}. Try again.`,
      });
    }

    // Email the staff member their login link + temp password directly
    // so onboarding doesn't depend on the admin manually relaying it.
    await sendStaffCredentialsEmail(admin, {
      email,
      fullName: full_name,
      role,
      companyId: company_id,
      tempPassword: password,
      baseUrl,
    });

    // Also surface the password ONCE in the response so the admin has a
    // fallback when the tenant has no email provider wired up yet. It is
    // never logged or stored anywhere except auth.users (hashed). The UI
    // prompts the admin to share it securely + tells the user to change
    // it on first login.
    return res.status(201).json({
      message: "User created successfully",
      user: { id: newUserId, email },
      tempPassword: password,
    });
  } catch (outer: any) {
    // Unhandled error - without this catch, Next.js returns an HTML 500
    // page and the client can't parse a JSON error.
    console.error("create-user handler crashed:", outer);
    return res.status(500).json({
      error: outer?.message || "Unexpected server error",
    });
  }
}

export default withApiLogging(handler);
