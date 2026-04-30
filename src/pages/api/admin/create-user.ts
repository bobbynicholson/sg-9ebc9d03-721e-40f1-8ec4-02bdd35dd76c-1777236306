/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { NextApiRequest, NextApiResponse } from "next";

// Map UserRole enum values to database-accepted role values
function mapRoleToDatabase(role: string): string {
  const roleMap: Record<string, string> = {
    "kitchen_staff": "kitchen",
    "cleaning_staff": "cleaning",
    "shopping_staff": "shopping",
    "super_admin": "super_admin",
    "owner": "admin",
    "admin": "admin",
    "driver": "driver",
    "client": "client",
  };
  return roleMap[role] || role;
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
export default async function handler(
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
      password,
      full_name,
      phone,
      role,
      company_id,
      drive_time_to_kitchen_minutes,
      vehicle_registration,
    } = req.body || {};

    if (!email || !password || !full_name || !role || !company_id) {
      return res.status(400).json({
        error: "Missing required fields: email, password, full_name, role, company_id",
      });
    }

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
          // Orphan from the old endpoint -- update password + create profile
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
          const { error: insErr } = await admin.from("profiles").insert([profilePayload]);
          if (insErr) {
            console.error("Healing orphan profile failed:", insErr);
            return res.status(500).json({ error: `Could not finish creating user: ${insErr.message}` });
          }
          return res.status(201).json({
            message: "User restored",
            user: { id: match.id, email },
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

    // Build the profile patch -- only columns that exist on the profiles
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

    return res.status(201).json({
      message: "User created successfully",
      user: { id: newUserId, email },
    });
  } catch (outer: any) {
    // Unhandled error -- without this catch, Next.js returns an HTML 500
    // page and the client can't parse a JSON error.
    console.error("create-user handler crashed:", outer);
    return res.status(500).json({
      error: outer?.message || "Unexpected server error",
    });
  }
}
