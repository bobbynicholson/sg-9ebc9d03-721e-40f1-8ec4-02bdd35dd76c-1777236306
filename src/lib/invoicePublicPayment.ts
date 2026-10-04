/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPublicPaymentAvailability } from "@/lib/paymentService";

/** Use the public invoice currency precedence for EFT availability checks. */
export async function getInvoicePublicAvailability(supabase: any, invoice: {
  company_id: string;
  order_id?: string | null;
  currency?: string | null;
}): Promise<{ currency: string; availability: Awaited<ReturnType<typeof getPublicPaymentAvailability>> }> {
  let currency = String(invoice.currency || "ZAR").toUpperCase();
  if (invoice.order_id) {
    try {
      const { data } = await supabase
        .from("orders")
        .select("currency")
        .eq("id", invoice.order_id)
        .maybeSingle();
      if (data?.currency) currency = String(data.currency).toUpperCase();
    } catch (error) {
      console.warn("[invoicePublicPayment] order currency lookup failed:", error);
    }
  }
  const availability = await getPublicPaymentAvailability(invoice.company_id, currency);
  return { currency, availability };
}
