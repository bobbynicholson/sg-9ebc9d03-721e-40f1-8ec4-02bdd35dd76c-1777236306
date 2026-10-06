import {
  buildPdfEftPaymentDetails,
  isEftPaymentMethod,
  paymentProviderLabel,
} from "@/lib/pdfPaymentDetails";

describe("PDF payment details", () => {
  it("uses one complete current EFT bundle and includes the company beneficiary", () => {
    expect(buildPdfEftPaymentDetails({
      company_name: "Harbour Catering",
      legal_name: "Harbour Catering (Pty) Ltd",
      bank_name: "Current Bank",
      bank_account_holder: "Harbour Catering (Pty) Ltd",
      bank_account_number: "1234567890",
      bank_branch_code: "250655",
      bank_account_type: "Business Cheque",
      eft_instructions: "Use the invoice number as the reference.",
    }, {
      bankName: "Old Bank",
      accountNumber: "0000000000",
    }, {
      reference: "INV-42",
    })).toEqual({
      company_name: "Harbour Catering (Pty) Ltd",
      bank_name: "Current Bank",
      account_holder: "Harbour Catering (Pty) Ltd",
      account_number: "1234567890",
      branch_code: "250655",
      account_type: "Business Cheque",
      instructions: "Use the invoice number as the reference.",
      reference: "INV-42",
      reference_hint: null,
    });
  });

  it("never falls back to an old snapshot after a partial bank-detail edit", () => {
    expect(buildPdfEftPaymentDetails({
      company_name: "Harbour Catering",
      bank_name: "New Bank",
      bank_account_number: "",
    }, {
      bankName: "Old Bank",
      accountNumber: "0000000000",
    })).toBeNull();
  });

  it("labels supported payment providers and EFT methods clearly", () => {
    expect(paymentProviderLabel("payfast")).toBe("PayFast");
    expect(paymentProviderLabel("stripe")).toBe("Stripe");
    expect(isEftPaymentMethod("eft")).toBe(true);
    expect(isEftPaymentMethod("bank_transfer")).toBe(true);
    expect(isEftPaymentMethod("stripe")).toBe(false);
  });
});
