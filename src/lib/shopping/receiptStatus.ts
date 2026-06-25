/* eslint-disable @typescript-eslint/no-explicit-any */

const NO_RECEIPT_PREFIX = "No receipt reason:";

export function appendNoReceiptReason(notes: string | null | undefined, reason: string): string {
  const cleanReason = reason.trim();
  const cleanNotes = (notes || "").trim();
  if (!cleanReason) return cleanNotes;
  const line = `${NO_RECEIPT_PREFIX} ${cleanReason}`;
  if (!cleanNotes) return line;
  if (cleanNotes.includes(line)) return cleanNotes;
  return `${cleanNotes}\n${line}`;
}

function isMissingNoReceiptColumn(error: any): boolean {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /no_receipt_reason/i.test(message)
  );
}

export async function updateShoppingListWithReceiptStatus(
  sb: any,
  listId: string,
  patch: Record<string, unknown>,
  opts?: { existingNotes?: string | null; noReceiptReason?: string | null },
): Promise<{ error: any | null; usedNotesFallback: boolean }> {
  const { error } = await sb
    .from("shopping_lists")
    .update(patch)
    .eq("id", listId);

  if (!error) return { error: null, usedNotesFallback: false };
  if (!("no_receipt_reason" in patch) || !isMissingNoReceiptColumn(error)) {
    return { error, usedNotesFallback: false };
  }

  const fallbackPatch = { ...patch };
  delete fallbackPatch.no_receipt_reason;
  const reason = (opts?.noReceiptReason || "").trim();
  if (reason) {
    fallbackPatch.notes = appendNoReceiptReason(opts?.existingNotes, reason);
  }

  const retry = await sb
    .from("shopping_lists")
    .update(fallbackPatch)
    .eq("id", listId);

  return { error: retry.error || null, usedNotesFallback: true };
}
