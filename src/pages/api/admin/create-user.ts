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
 * Why this used to break:
 *   - Old version called the public anon `supabase.auth.signUp`, which sends
 *     a confirmation email and cannot be rolled back. If the follow-up
 *     profiles update failed, the auth user was orphaned and any retry hit
 *     "user already exists" with no way to recover from the UI.
 *
 * What changed:
 *   - Uses the service-role client (`auth.admin.createUser`) so the user is
 *     created in one shot with the password set and email confirmed.
 *   - If anything afterwards fails we delete the auth user so a retry
 *     succeeds clean.
 *   - We also pre-check for an existing auth user with the same email and
 *     return a clean message rather than the confusing rollback surface.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ssrClient = createPagesServerClient({ req, res });
  const {
    data: { user: callerAuth },
  } = await ssrClient.auth.getUser();
  if (!callerAuth) return res.status(401).json({ error: "Authentication required" });

  const { data: callerProfile, error: callerProfileErr } = await ssrClient
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", callerAuth.id)
    .single();
  if (callerProfileErr || !callerProfile) {
    return res.status(403).json({ error: "Caller profile not found" });
  }

  const callerRole = (callerProfile as any).active_role || (callerProfile as any).role;
  if (!CALLER_ROLES_ALLOWED.has(callerRole)) {
    return res.status(403).json({ error: "Forbidden: insufficient role" });
  }

  const {
    email,
    password,
    full_name,
    phone,
    role,
    company_id,
    vehicle_details,
    drive_time_to_kitchen_minutes,
  } = req.body || {};

  if (!email || !password || !full_name || !role || !company_id) {
    return res.status(400).json({ error: "Missing required fields" });
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
    return res.status(500).json({ error: "Server is missing service-role credentials" });
  }

  const dbRole = mapRoleToDatabase(role);

  // Pre-check: is there already an auth user with this email? If so, give a
  // clear message instead of the noisy rollback path. listUsers is paged --
  // we just hit page 1; for the typical tenant size that's enough, and we
  // also catch the case below by inspecting createUser's error.
  try {
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = existing?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      // Look for an existing profile -- if there's no profile this is the
      // exact orphaned-auth-user case the old endpoint left behind. Heal it
      // in place rather than asking the operator to use a different email.
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
          profilePayload.vehicle_details = vehicle_details ?? null;
          profilePayload.drive_time_to_kitchen_minutes = drive_time_to_kitchen_minutes ?? null;
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
    // Pre-check failure shouldn't block creation -- log and continue
    console.warn("Email pre-check failed:", preErr?.message);
  }

  // Create the auth user with the service role. email_confirm: true skips
  // the confirmation email since an admin is creating the account.
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

  // Fill in / overwrite the profile row. The handle_new_user trigger may
  // have inserted a stub already.
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
    profileUpdates.vehicle_details = vehicle_details ?? null;
    profileUpdates.drive_time_to_kitchen_minutes = drive_time_to_kitchen_minutes ?? null;
  }

  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(profileUpdates, { onConflict: "id" });

  if (upsertErr) {
    console.error("Profile upsert failed, rolling back auth user:", upsertErr);
    // Rollback so the operator can retry without "user already exists"
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
}
