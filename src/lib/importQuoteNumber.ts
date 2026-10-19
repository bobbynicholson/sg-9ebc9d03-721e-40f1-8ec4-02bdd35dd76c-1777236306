/**
 * Quote number for an imported quote row (/api/imports/[id]/commit).
 *
 *   - number in the file -> kept exactly as written
 *   - blank, real import -> the company's next quote number from
 *                           consume_next_document_number, the same
 *                           numbering a quote made in the app gets
 *   - blank, test run    -> null: a test run must not use up numbers
 *                           for quotes it never saves
 *
 * Throws when a number is needed and can't be allocated, so the row is
 * marked as an error and retried on the next run.
 */
export async function resolveImportQuoteNumber(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> },
  companyId: string,
  fromFile: unknown,
  dryRun: boolean,
): Promise<{ quoteNumber: string | null; allocated: boolean }> {
  const given = String(fromFile ?? "").trim();
  if (given) return { quoteNumber: given, allocated: false };
  if (dryRun) return { quoteNumber: null, allocated: false };
  const { data, error } = await supabase.rpc("consume_next_document_number", {
    p_company_id: companyId,
    p_document_type: "quote",
  });
  if (error || !data) {
    throw new Error(`Could not give this quote a number (${error?.message || "no number returned"}). Run the import again to retry this row.`);
  }
  return { quoteNumber: String(data), allocated: true };
}
