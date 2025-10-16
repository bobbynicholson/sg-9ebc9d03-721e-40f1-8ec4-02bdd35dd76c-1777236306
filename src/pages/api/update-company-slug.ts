
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, companySlug } = req.body;

    if (!userId || !companySlug) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Update the profile with the company slug
    const { data, error } = await supabase
      .from("profiles")
      .update({ company_slug: companySlug })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating company slug:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return res.status(500).json({ error: error.message });
  }
}
