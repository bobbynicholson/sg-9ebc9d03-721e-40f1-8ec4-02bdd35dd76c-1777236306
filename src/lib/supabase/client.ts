import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/integrations/supabase/types";

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables");
  }

  return createBrowserClient<Database>(
    supabaseUrl || "",
    supabaseKey || ""
  );
};