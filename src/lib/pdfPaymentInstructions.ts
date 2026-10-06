import { getPublicPaymentAvailability } from "@/lib/paymentService";
import { isManualEftAvailable } from "@/lib/publicPaymentOptions";
import {
  buildPdfEftPaymentDetails,
  type PdfPaymentInstructions,
} from "@/lib/pdfPaymentDetails";

/**
 * Build the mutually-exclusive payment block shown on a quote/invoice PDF.
 * This deliberately mirrors the public payment pages: a configured online
 * gateway wins; EFT is disclosed only when online checkout is unavailable.
 */
export async function buildPdfPaymentInstructions(input: {
  company: Record<string, unknown> | null | undefined;
  currency?: string | null;
  bankSnapshot?: Record<string, unknown> | null;
  paymentUrl?: string | null;
  reference?: string | null;
  referenceHint?: string | null;
}): Promise<PdfPaymentInstructions | null> {
  const company = input.company || {};
  const companyId = String(company.id || "").trim();
  if (!companyId) return null;

  const availability = await getPublicPaymentAvailability(
    companyId,
    input.currency || "ZAR",
  );

  if (availability.online_available && availability.provider) {
    return {
      online_provider: availability.provider,
      payment_url: input.paymentUrl || null,
      reference: input.reference || null,
      reference_hint: input.referenceHint || null,
      eft: null,
    };
  }

  const eft = buildPdfEftPaymentDetails(company, input.bankSnapshot, {
    reference: input.reference,
    referenceHint: input.referenceHint,
  });
  if (!isManualEftAvailable(availability.online_available, Boolean(eft))) return null;

  return {
    online_provider: null,
    payment_url: null,
    eft,
    reference: input.reference || null,
    reference_hint: input.referenceHint || null,
  };
}
