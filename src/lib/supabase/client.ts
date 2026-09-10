import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/integrations/supabase/types";

// Placeholder values used at build / prerender time only when env vars
// aren't available. @supabase/ssr's createBrowserClient throws on empty
// strings, which kills `next build` page-data collection on Vercel
// when the build cache is cold and env vars don't get piped through.
// At runtime in the browser, NEXT_PUBLIC_* env vars ARE present
// (they're inlined at build time into the client bundle), so this
// placeholder is only ever observed during build / prerender.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "placeholder";

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn(
      "Missing Supabase environment variables; using placeholder client. " +
      "All Supabase calls will fail. This is expected during prerender; " +
      "if you see it at runtime, check NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY."
    );
  }

  return createBrowserClient<Database>(
    supabaseUrl || PLACEHOLDER_URL,
    supabaseKey || PLACEHOLDER_KEY
  );
};