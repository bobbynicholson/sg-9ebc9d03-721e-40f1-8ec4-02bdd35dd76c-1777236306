import { assessEftProofFields, type EftProofFields } from "@/lib/eftProofVision";

const clearProof: EftProofFields = {
  document_type: "bank_transfer_confirmation",
  transfer_status: "successful",
  amount: 500,
  currency: "ZAR",
  reference: "Payment INV-001 completed",
  transaction_date: "2026-10-04",
  recipient: "Caterer",
  warnings: [],
  confidence: 0.96,
};

test("vision assessment marks matching transfer details as consistent, not verified", () => {
  const result = assessEftProofFields(clearProof, { invoiceNumber: "INV-001", amount: 500, currency: "ZAR", recipient: "Caterer" }, "test-model");
  expect(result.status).toBe("consistent");
  expect(result.extracted).toEqual(clearProof);
  expect(result.status).not.toBe("verified");
});

test("vision assessment flags failed transfers and mismatched amount, currency, reference or recipient", () => {
  const result = assessEftProofFields({ ...clearProof, transfer_status: "pending", amount: 50, currency: "USD", reference: "INV-OTHER", recipient: "Other Company" },
    { invoiceNumber: "INV-001", amount: 500, currency: "ZAR", recipient: "Caterer" }, "test-model");
  expect(result.status).toBe("needs_review");
  expect(result.reasons).toEqual(expect.arrayContaining([
    "The transfer is not clearly marked as successful.",
    "The amount shown does not match the amount on the claim.",
    "The transfer currency does not match the invoice currency.",
    "The invoice reference could not be matched.",
    "The recipient shown does not match the company's EFT account name.",
  ]));
});
