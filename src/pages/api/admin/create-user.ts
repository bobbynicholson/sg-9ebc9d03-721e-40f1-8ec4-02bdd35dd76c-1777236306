/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPagesServerClient } from "@/lib/supabase/server";
import { effectiveProfileRole, canAssignTenantPrivileges } from "@/lib/roleDerivation";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";
import { sendStaffInviteEmail } from "@/lib/staffInviteEmail";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


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
    "kitchen_manager": "kitchen_staff",
    "kitchen_staff": "kitchen_staff",
    "cleaning_manager": "cleaning_staff",
    "cleaning_staff": "cleaning_staff",
    "shopping_staff": "shopping_staff",
    "super_admin": "super_admin",
    // 'owner' is a valid enum value, but the platform treats company
    // owners as 'admin' for routing + RLS, so keep the existing
    // downgrade rather than introduce a second admin-tier role here.
    "owner": "admin",
    "admin": "admin",
    "driver": "driver",
    "waiter": "driver",
    "client": "client",
    // The live profiles.role check is narrower than active_role. Store
    // admin as the base role and route through active_role below.
    "company_admin": "company_admin",
    "region_admin": "admin",
    "sales_admin": "admin",
  };
  return roleMap[role] || role;
}

// Roles that are scoped to one or more branches. region_id +
// regions_covered are only meaningful for these.
const REGION_SCOPED_ROLES = new Set(["region_admin", "kitchen", "kitchen_manager", "kitchen_staff", "driver", "waiter", "shopping", "shopping_staff", "cleaning", "cleaning_manager", "cleaning_staff"]);

// Map a profiles.role (enum, *_staff form) to the user_departments
// .department value. NOTE the inversion vs profiles.role: the
// user_departments.department column is TEXT with a CHECK constraint that
// only permits the SHORT forms ('admin','kitchen','driver','cleaning',
// 'buyer','client'). Writing 'cleaning_staff' there violates the check.
// create-user previously seeded NO department row at all, so every user
// it created showed "No departments assigned" on /admin/users (the old
// invite flow seeded this via assignDepartments; create-user never did).
const ROLE_TO_DEPARTMENT: Record<string, string> = {
  kitchen_manager: "kitchen",
  kitchen_staff: "kitchen",
  cleaning_manager: "cleaning",
  cleaning_staff: "cleaning",
  shopping_staff: "buyer",
  driver: "driver",
  waiter: "waiter",
  client: "client",
  admin: "admin",
  company_admin: "admin",
  owner: "admin",
  region_admin: "admin",
  sales_admin: "admin",
  super_admin: "admin",
};

// Seed the user's primary department so it shows on the Users page
// immediately. Runs with the service-role client, so it bypasses the
// user_departments RLS (which only admits admin/owner/super_admin
// active_role) and the CHECK constraint is satisfied by the short form.
// Non-fatal: a missing department row must not fail user creation.
async function seedPrimaryDepartment(admin: any, userId: string, dbRole: string, assignedBy: string) {
  const department = ROLE_TO_DEPARTMENT[dbRole];
  if (!department) return;
  try {
    await admin.from("user_departments").delete().eq("user_id", userId);
    await admin.from("user_departments").insert({
      user_id: userId,
      department,
      is_primary: true,
      assigned_by: assignedBy,
    });
    if (dbRole === "kitchen_manager" || dbRole === "cleaning_manager") {
      await admin.from("user_departments").insert({
        user_id: userId, department: dbRole, is_primary: false, assigned_by: assignedBy,
      });
    }
  } catch (e: any) {
    console.warn("[create-user] seeding user_departments failed (non-fatal):", e?.message);
  }
}

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
      .select("role, active_role, company_id, is_active, deleted_at")
      .eq("id", callerAuth.id)
      .single();
    if (callerProfileErr || !callerProfile || callerProfile.is_active === false || callerProfile.deleted_at) {
      return res.status(403).json({
        error: "Caller profile not found, contact support if this persists.",
      });
    }

    const callerRole = effectiveProfileRole(callerProfile);
    if (!CALLER_ROLES_ALLOWED.has(callerRole)) {
      return res.status(403).json({
        error: `Forbidden: your role '${callerRole}' is not allowed to create users.`,
      });
    }

    const {
      email: rawEmail,
      full_name,
      phone,
      role,
      company_id,
      drive_time_to_kitchen_minutes,
      vehicle_registration,
      region_id,
      regions_covered,
    } = req.body || {};
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;

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
    // initial password, keeps it server-side, and sends a one-time
    // set-password link. The password is never returned to the browser
    // or logged.
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
      (req.headers.origin as string) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${req.headers.host || "cateringms.com"}`;

    if (callerRole !== "super_admin") {
      if (!canAssignTenantPrivileges(callerProfile.role, [role])) {
        return res.status(403).json({ error: "This account cannot grant owner or administrator access" });
      }
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
    const activeRole = role;
    let reusedInactiveEmail = false;
    let releasedInactiveAuthId: string | null = null;
    const restoreInactiveAuthEmail = async () => {
      if (!releasedInactiveAuthId) return;
      try {
        const { error: restoreError } = await admin.auth.admin.updateUserById(releasedInactiveAuthId, {
          email,
          email_confirm: true,
        });
        if (restoreError) {
          console.warn("Could not restore the inactive account email:", restoreError.message);
          return;
        }
        releasedInactiveAuthId = null;
      } catch (restoreError: any) {
        console.warn("Could not restore the inactive account email:", restoreError?.message);
      }
    };

    // Pre-check every Auth page before creating. Active accounts keep their
    // email; an inactive account in this company can release its Auth email
    // while its profile and work history stay archived under the old id.
    try {
      let match: any = null;
      let page = 1;
      const perPage = 1000;
      while (!match) {
        const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
        if (listError) throw listError;
        const pageUsers = existing?.users || [];
        match = pageUsers.find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) || null;
        if (match || pageUsers.length < perPage) break;
        page += 1;
      }

      if (match) {
        const { data: existingProfile, error: profileLookupError } = await admin
          .from("profiles")
          .select("id, role, company_id, is_active, deleted_at")
          .eq("id", match.id)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;

        if (!existingProfile) {
          // Orphan from the old endpoint - update password + create profile
          await admin.auth.admin.updateUserById(match.id, {
            password,
            email_confirm: true,
            user_metadata: { full_name, phone, company_id, role: dbRole, active_role: activeRole },
          });
          const profilePayload: any = {
            id: match.id,
            email,
            full_name,
            phone,
            company_id,
            role: dbRole,
            active_role: activeRole,
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
            return res.status(500).json({ error: `Could not finish creating user: ${dbErrorMessage(insErr)}` });
          }
          // Seed the primary department so it shows on the Users page.
          await seedPrimaryDepartment(admin, match.id, activeRole, callerAuth.id);
          // Email the staff member their invite / set-password link.
          const healInvite = await sendStaffInviteEmail(admin, {
            userId: match.id, invitedBy: callerAuth.id,
            email,
            fullName: full_name,
            role,
            companyId: company_id,
            baseUrl,
          });
          return res.status(201).json({
            message: "User restored",
            user: { id: match.id, email },
            recovered: true,
            emailDelivered: healInvite.emailed,
            emailErrorCode: healInvite.errorCode,
            loginUrl: healInvite.loginUrl,
          });
        }

        const inactive = existingProfile.is_active === false || Boolean(existingProfile.deleted_at);
        if (!inactive) {
          return res.status(409).json({
            error: `An active account already uses ${email}. Use that account or enter a different email.`,
          });
        }

        if (existingProfile.company_id !== company_id) {
          return res.status(409).json({
            error: "This email belongs to an inactive account in another company. Ask a platform administrator to review it.",
          });
        }

        // Supabase Auth requires email to be globally unique. Move only the
        // inactive Auth identity to a non-deliverable reserved address; keep
        // profiles.email untouched so the archived record and its history
        // remain identifiable. The new user gets a fresh Auth/profile id.
        const reservedEmail = `inactive-${match.id}@accounts.invalid`;
        const { error: releaseError } = await admin.auth.admin.updateUserById(match.id, {
          email: reservedEmail,
          email_confirm: true,
        });
        if (releaseError) {
          console.error("Could not release email from inactive account:", releaseError);
          return res.status(409).json({
            error: "This email belongs to an inactive account, but its sign-in record could not be released. Please try again or contact a platform administrator.",
          });
        }
        releasedInactiveAuthId = match.id;
        reusedInactiveEmail = true;
      }
    } catch (preErr: any) {
      console.warn("Email pre-check failed:", preErr?.message);
      return res.status(500).json({
        error: "We couldn't check whether this email belongs to an active or inactive account. Please try again.",
      });
    }

    // Create the auth user with the service role.
    let created: any;
    let createErr: any;
    try {
      const createResult = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          phone,
          company_id,
          role: dbRole,
          active_role: activeRole,
        },
      });
      created = createResult.data;
      createErr = createResult.error;
    } catch (createThrow) {
      await restoreInactiveAuthEmail();
      throw createThrow;
    }

    if (createErr || !created?.user) {
      console.error("admin.createUser failed:", createErr);
      const createMessage = dbErrorMessage(createErr) || "Could not create user";
      if (/already registered|already exists|duplicate key|unique constraint/i.test(createMessage)) {
        return res.status(409).json({
          error: `An account with ${email} is still registered. Refresh the user list and check its status before trying again.`,
        });
      }
      await restoreInactiveAuthEmail();
      return res.status(500).json({
        error: createMessage,
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
      active_role: activeRole,
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
      await restoreInactiveAuthEmail();
      return res.status(500).json({
        error: `Could not save profile: ${dbErrorMessage(upsertErr)}. Try again.`,
      });
    }

    // Seed the primary department so the Users page shows it right away.
    await seedPrimaryDepartment(admin, newUserId, activeRole, callerAuth.id);

    // Email the staff member their invite / set-password link so
    // onboarding doesn't depend on the admin manually relaying anything.
    const inviteResult = await sendStaffInviteEmail(admin, {
      userId: newUserId, invitedBy: callerAuth.id,
      email,
      fullName: full_name,
      role,
      companyId: company_id,
      baseUrl,
    });

    // Return invite delivery status only. The server-only initial password
    // is never exposed to the browser; failed invites can be resent later.
    return res.status(201).json({
      message: "User created successfully",
      user: { id: newUserId, email },
      reusedInactiveEmail,
      emailDelivered: inviteResult.emailed,
      emailErrorCode: inviteResult.errorCode,
      loginUrl: inviteResult.loginUrl,
    });
  } catch (outer: any) {
    // Unhandled error - without this catch, Next.js returns an HTML 500
    // page and the client can't parse a JSON error.
    console.error("create-user handler crashed:", outer);
    return res.status(500).json({
      error: dbErrorMessage(outer) || "Unexpected server error",
    });
  }
}

export default withApiLogging(handler);
