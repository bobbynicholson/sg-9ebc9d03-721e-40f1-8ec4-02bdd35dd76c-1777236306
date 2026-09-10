/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Idempotency lookup for incoming payment-gateway webhooks.
 *
 * The gateway's transaction id arrives in the webhook POST body, i.e.
 * it is externally supplied. The previous implementation interpolated
 * it straight into a PostgREST `.or()` filter string:
 *
 *     .or(`gateway_transaction_id.eq.${txId},transaction_id.eq.${txId}`)
 *
 * PostgREST parses commas, parentheses and dots inside that string as
 * filter syntax, so a crafted id could alter the predicate (filter
 * injection). `.eq()` instead sends the value as a properly-encoded
 * query parameter, so the id is always treated as an opaque literal.
 *
 * We check both columns because recordPayment writes
 * `gateway_transaction_id` while older rows mirror the value into the
 * legacy `transaction_id` column.
 *
 * Returns `error: true` when the lookup itself failed so each caller
 * can apply its own fail-open / fail-closed policy.
 */
export async function paymentExistsByGatewayId(
  sb: any,
  txId: string | undefined | null,
): Promise<{ exists: boolean; error: boolean }> {
  if (!txId) return { exists: false, error: false };
  for (const col of ["gateway_transaction_id", "transaction_id"]) {
    const { data, error } = await sb
      .from("payments")
      .select("id")
      .eq(col, txId)
      .limit(1);
    if (error) return { exists: false, error: true };
    if (Array.isArray(data) && data.length > 0) return { exists: true, error: false };
  }
  return { exists: false, error: false };
}
