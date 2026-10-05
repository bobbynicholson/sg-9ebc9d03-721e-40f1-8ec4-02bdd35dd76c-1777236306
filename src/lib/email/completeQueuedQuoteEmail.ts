/** A successful direct send also satisfies the legacy quote-trigger outbox. */
export async function completeQueuedQuoteEmail(
  client: any,
  companyId: string,
  quoteId: string,
  recipient: string,
  sentAt: string,
): Promise<void> {
  const { error } = await client.from("outgoing_email_queue")
    .update({ status: "sent", sent_at: sentAt, error_message: null })
    .eq("company_id", companyId)
    .eq("trigger_event", "quote.sent")
    .eq("trigger_ref_id", quoteId)
    .eq("to_email", recipient)
    .eq("status", "queued");
  if (error) throw new Error(`Quote email was sent, but its queued duplicate could not be completed: ${error.message}`);
}
