/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";


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

    // Surface the password ONCE in the response so the admin can
    // hand it to the new staff member via their own secure channel
    // (WhatsApp, password manager). It is never logged or stored
    // anywhere except auth.users (hashed). The UI must prompt the
    // new staff member to change it on first login.
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
