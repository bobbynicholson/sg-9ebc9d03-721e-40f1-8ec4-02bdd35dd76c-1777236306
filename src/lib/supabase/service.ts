/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let cached: any = null;
let validatedOnce = false;

/**
 * Decode a Supabase JWT (without verifying the signature) and return
 * the `role` claim. Returns null if the token doesn't parse or is
 * missing the claim.
 *
 * We can't validate the signature here (no JWT secret server-side
 * by design) but we don't need to - the only thing we care about
 * is whether the env-loaded "service" key has a service_role claim
 * vs an anon claim. Tampering would be self-inflicted.
 */
function decodeRoleClaim(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    // The middle segment is base64url-encoded JSON. Buffer handles it
    // in node; this file only runs server-side.
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf8"),
    );
    return payload && typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Service-role Supabase client for server-side use only.
 *
 * Used by the public embed endpoints because the only auth gate on those
 * routes is the per-tenant `companies.embed_token` UUID - there is no
 * authenticated user, so no RLS context. Never expose this client or its
 * key to the browser.
 *
 * Wave 70.46 - now validates the loaded key is actually a service_role
 * JWT on first instantiation. Previous behaviour: if the operator had
 * accidentally pasted an anon key into SUPABASE_SERVICE_ROLE_KEY (or
 * one of the fallback names), the client would build silently and every
 * RLS-gated query would return empty because anon doesn't have
 * BYPASSRLS and the service client has no auth.uid(). That symptom is
 * indistinguishable from "row doesn't exist" - which is exactly the
 * bug that landed force-close in 404 hell on confirmed orders. Now we
 * throw loud + early so the misconfiguration is visible in server
 * logs the moment any service-role code path runs.
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
      "Service-role Supabase credentials missing, set SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  // Wave 70.46 - role-claim sanity check. We don't want to crash
  // production on a parse glitch (some self-hosted Supabase setups
  // mint non-JWT service tokens), so a missing claim is a WARN-only.
  // An explicit anon claim, however, is fatal: that exact mistake
  // silently returns empty results for every RLS-gated SELECT and
  // wastes hours debugging "but the row IS there".
  if (!validatedOnce) {
    const claim = decodeRoleClaim(serviceKey);
    if (claim === "anon") {
      throw new Error(
        "[service.ts] SUPABASE_SERVICE_ROLE_KEY (or its fallback env var) " +
          "appears to be an ANON key (role claim = 'anon'). Service-role " +
          "client cannot bypass RLS with an anon key - every query will " +
          "return empty silently. Replace with the project's service_role " +
          "JWT from Supabase dashboard -> Settings -> API.",
      );
    }
    if (claim && claim !== "service_role") {
      // Other roles (authenticated, postgres, etc.) shouldn't be in a
      // service-key slot. Warn loudly but don't crash - some bespoke
      // setups use custom roles.
      console.warn(
        `[service.ts] WARNING: loaded service key has role='${claim}' (expected 'service_role'). RLS bypass may not work as intended.`,
      );
    }
    if (!claim) {
      console.warn(
        "[service.ts] WARNING: could not decode role claim from service key. Continuing - this is fine for non-JWT tokens but worth a glance.",
      );
    }
    validatedOnce = true;
  }

  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
