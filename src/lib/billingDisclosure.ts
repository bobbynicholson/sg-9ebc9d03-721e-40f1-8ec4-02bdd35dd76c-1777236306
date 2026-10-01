/** Provider-confirmed billing details appended even to custom mail templates. */
export function billingDisclosure(data: Record<string, any>): string {
  if (data.billingMode !== "recurring") return "";
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const cycle = data.billingCycle === "Yearly" ? "year" : "month";
  return `<hr><h3>Automatic subscription billing</h3>
    <p>Company: ${escape(data.company_name)}<br>Plan: ${escape(data.planName)}</p>
    <p>${data.paidAmount ? `Charged for this payment: <strong>${escape(data.paidAmount)}</strong>.` : ""}
    ${data.isTrial ? "Your trial is still active. No subscription payment was deducted today." : ""}</p>
    <p>This is a recurring subscription. PayFast will automatically charge <strong>${escape(data.recurringAmount)} every ${cycle}</strong> until you cancel.
    Next scheduled charge: <strong>${escape(data.nextBillingDate)}</strong>.</p>
    <p><a href="${escape(data.subscriptionUrl)}">Manage or cancel your subscription</a>. Future charges stop when cancellation is confirmed.
    Your card details are held by PayFast; CateringMS stores your billing reference, not your card number or CVV.</p>`;
}
