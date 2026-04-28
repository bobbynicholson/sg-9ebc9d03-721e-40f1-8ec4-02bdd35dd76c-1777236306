import { supabase } from "@/integrations/supabase/client";
import { createPagesServerClient } from "@/lib/supabase/server";
import type { NextApiRequest, NextApiResponse } from "next";

// Map UserRole enum values to database-accepted role values
function mapRoleToDatabase(role: string): string {
  const roleMap: Record<string, string> = {
    "kitchen_staff": "kitchen",
    "cleaning_staff": "cleaning",
    "shopping_staff": "shopping",
    "super_admin": "super_admin",
    "owner": "admin", // Map owner to admin for database
    "admin": "admin",
    "driver": "driver",
    "client": "client",
  };

  return roleMap[role] || role;
}

// Roles permitted to create users via this endpoint. Anyone outside this set
// is rejected before we touch supabase.auth.signUp.
const CALLER_ROLES_ALLOWED = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // SECURITY: require an authenticated caller and check their role + company.
  // Previously this route was wide open -- anyone could create users with any
  // role (including super_admin) tied to any company_id.
  const ssrClient = createPagesServerClient({ req, res });
  const {
    data: { user: callerAuth },
  } = await ssrClient.auth.getUser();

  if (!callerAuth) {
    return res.status(401).json({ error: "Authentication required" });
  }

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
  } = req.body;

  if (!email || !password || !full_name || !role || !company_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Non-super-admins can only create users inside their own company, and may
  // never mint another super_admin.
  if (callerRole !== "super_admin") {
    if ((callerProfile as any).company_id !== company_id) {
      return res.status(403).json({ error: "Cannot create users for another company" });
    }
    if (role === "super_admin") {
      return res.status(403).json({ error: "Cannot create super_admin users" });
    }
  }

  try {
    // Map the role to database-accepted value BEFORE creating the user
    const dbRole = mapRoleToDatabase(role);
    
    const { data: newUser, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          phone,
          company_id,
          role: dbRole,  // Use mapped role here instead of raw role
          active_role: dbRole,  // Use mapped role here too
        },
      },
    });

    if (signUpError) {
      console.error("Error creating auth user:", signUpError);
      return res.status(500).json({ error: signUpError.message });
    }

    if (!newUser.user) {
      return res.status(500).json({ error: "User was not created." });
    }

    // Now update the profile with any extra details.
    // The `handle_new_user` trigger should have created a basic profile with the correct role.
    const profileUpdates: any = {
      full_name,
      phone,
      company_id,
      role: dbRole,
      active_role: dbRole,
    };

    if (role === "driver") {
      profileUpdates.vehicle_details = vehicle_details;
      profileUpdates.drive_time_to_kitchen_minutes = drive_time_to_kitchen_minutes;
    }
    
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", newUser.user.id);

    if (profileError) {
      console.error("Error updating user profile:", profileError);
      return res.status(500).json({ error: `User created but profile update failed: ${profileError.message}` });
    }

    res.status(201).json({ message: "User created successfully", user: newUser.user });
  } catch (error: any) {
    console.error("Error in create-user handler:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
