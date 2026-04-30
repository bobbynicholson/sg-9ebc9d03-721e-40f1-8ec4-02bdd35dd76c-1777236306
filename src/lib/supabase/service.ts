/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let cached: any = null;

/**
 * Service-role Supabase client for server-side use only.
 *
 * Used by the public embed endpoints because the only auth gate on those
 * routes is the per-tenant `companies.embed_token` UUID -- there is no
 * authenticated user, so no RLS context. Never expose this client or its
 * key to the browser.
 */
export function getServiceSupabase() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Service-role Supabase credentials missing, set SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
