/**
 * resolveClientUserId
 *
 * Auth uid resolution: clients.user_id first, profile email fallback,
 * null if neither exists; caller skips the notification on null.
 *
 * orders.client_id is a FK to clients.id, NOT auth.users.id, so any
 * notification push that uses order.client_id as the recipient_id
 * silently inserts a row that no auth user can read. This helper
 * resolves the matching auth.users.id by:
 *   1. Reading clients.user_id for the explicit link.
 *   2. Falling back to a profiles.email match (case-insensitive) for
 *      portal-token clients that have not been linked yet.
 *   3. Returning null if neither path yields an auth uid - the caller
 *      MUST skip the notification (do not insert a dropped row).
 *
 * Accepts either an SSR Supabase client (createPagesServerClient) or
 * the global anon `supabase` client. The shape used here is the small
 * subset of the supabase-js query builder that both expose, so the
 * function signature stays the same in either context.
 */
export async function resolveClientUserId(
  ssr: any,
  orderClientId: string | null,
): Promise<string | null> {
  if (!orderClientId) return null;
  const { data: clientRow, error: clientRowErr } = await ssr
    .from("clients")
    .select("user_id, email")
    .eq("id", orderClientId)
    .maybeSingle();
  if (clientRowErr) console.error("[resolveClientUserId] clients lookup failed:", clientRowErr);
  if (clientRow?.user_id) return clientRow.user_id as string;
  if (clientRow && !clientRow.user_id) {
    const email = (clientRow.email || "").toLowerCase().trim();
    if (email) {
      const { data: profileMatch, error: profileMatchErr } = await ssr
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (profileMatchErr) console.error("[resolveClientUserId] profiles fallback lookup failed:", profileMatchErr);
      if ((profileMatch as any)?.id) return (profileMatch as any).id;
    }
  }
  // RLS fallback: a null clientRow means the caller (e.g. a kitchen/admin
  // STAFF session flipping order status from the browser) is not allowed
  // to SELECT the clients table, so the direct read above returned
  // nothing even though the row exists. Without this, every client-facing
  // notification on a staff-triggered status change is silently dropped.
  // resolve_client_user_id is a SECURITY DEFINER function that returns
  // ONLY the auth uid (no PII) and only to a caller entitled to it
  // (same-company staff, the client themselves, or the service role).
  // See migration 20260705200000_resolve_client_user_id_fn.sql.
  try {
    const { data: rpcId, error: rpcErr } = await ssr.rpc("resolve_client_user_id", {
      p_client_id: orderClientId,
    });
    if (rpcErr) {
      console.error("[resolveClientUserId] rpc fallback failed:", rpcErr);
      return null;
    }
    return (rpcId as string) || null;
  } catch (e) {
    console.error("[resolveClientUserId] rpc fallback threw:", e);
    return null;
  }
}
