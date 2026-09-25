import { emailService } from "@/services/emailService";

export async function notifyPaymentAttemptFailed(input: {
  admin: any;
  attempt: any;
  reason: string;
  mode?: "failed" | "webhook_missing";
}): Promise<void> {
  const { admin, attempt, reason, mode = "failed" } = input;
  try {
    const [{ data: company }, { data: client }] = await Promise.all([
      admin.from("companies").select("company_name, owner_id, email").eq("id", attempt.company_id).maybeSingle(),
      attempt.client_id
        ? admin.from("clients").select("email, client_name").eq("id", attempt.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const companyName = company?.company_name || "Your caterer";
    const clientEmail = client?.email || null;
    const clientName = client?.client_name || "there";
    let ownerEmail = company?.email || null;
    if (!ownerEmail && company?.owner_id) {
      const { data: owner } = await admin.from("profiles").select("email").eq("id", company.owner_id).maybeSingle();
      ownerEmail = owner?.email || null;
    }
    const delayed = mode === "webhook_missing";
    const subject = delayed
      ? `Payment confirmation delayed - ${companyName}`
      : `Payment could not be confirmed - ${companyName}`;
    const body = delayed
      ? `The payment provider reports a payment of ${attempt.currency || "ZAR"} ${Number(attempt.amount || 0).toFixed(2)} as paid, but its confirmation webhook has not reached CateringMS yet. Do not ask the client to pay again. Reason: ${reason}.`
      : `A payment attempt of ${attempt.currency || "ZAR"} ${Number(attempt.amount || 0).toFixed(2)} could not be confirmed. Reason: ${reason}. Please try again or contact ${companyName}.`;
    const recipients = [clientEmail, ownerEmail].filter(Boolean) as string[];
    await Promise.all(recipients.map((to) => emailService.sendEmail({
      companyId: attempt.company_id,
      to,
      subject,
      body,
      template: "payment_failed",
      variables: {
        tenant_name: companyName,
        company_name: companyName,
        client_name: clientName,
        amount: Number(attempt.amount || 0).toFixed(2),
        reason,
      },
      orderId: attempt.order_id || undefined,
      bypassQuarantine: true,
      skipUnsubscribeFooter: true,
      _client: admin,
    } as any)));
    await admin.from("notifications").insert({
      company_id: attempt.company_id,
      user_id: company?.owner_id || null,
      recipient_id: company?.owner_id || null,
      notification_type: "payment_failed",
      title: delayed ? "Payment confirmation delayed" : "Payment could not be confirmed",
      message: `${companyName}: a ${attempt.provider} payment attempt needs attention. ${reason}`,
      priority: "high",
      link: attempt.invoice_id ? `/admin/invoices?id=${attempt.invoice_id}` : "/admin/payments",
    });
  } catch (error) {
    console.warn("[notifyPaymentAttemptFailed] notification failed:", error);
  }
}
