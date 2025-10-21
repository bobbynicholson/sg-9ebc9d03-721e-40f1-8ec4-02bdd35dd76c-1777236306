
import { supabase } from "@/integrations/supabase/client";
import type { NextApiRequest, NextApiResponse } from "next";

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
    // This operation requires admin privileges.
    // Ensure you are using the service_role key in a secure environment.
    // The regular client-side Supabase instance won't have permission.
    // For this to work, we'd typically use a separate admin client.
    // Assuming the 'supabase' client here is configured with admin rights on the server-side.
    
    // As we can't use supabase.auth.admin on client-side SDK,
    // and this is a serverless function, we need a way to elevate privileges.
    // A common pattern is to create a service-role client.
    // For now, let's assume an RPC function is the intended way to handle this securely.
    
    const { data: newUser, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          phone,
          company_id,
          role: role,
          active_role: role,
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
    // The `handle_new_user` trigger should have created a basic profile.
    const profileUpdates: any = {
      full_name,
      phone,
      company_id,
      role,
      active_role: role,
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
      // If profile update fails, we should consider deleting the auth user to avoid orphans.
      // For now, we'll just return the error.
      return res.status(500).json({ error: `User created but profile update failed: ${profileError.message}` });
    }

    res.status(201).json({ message: "User created successfully" });
  } catch (error: any) {
    console.error("Error in create-user handler:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
