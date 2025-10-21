import { supabase } from "@/integrations/supabase/client";
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
