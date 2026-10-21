import React from "react";
import { Text, type TextProps } from "@react-pdf/renderer";
import type { PdfEftPaymentDetails } from "@/lib/pdfPaymentDetails";

type Field = { label: string; value?: string | null; emphasis?: boolean };
const rows = (eft: PdfEftPaymentDetails): Field[][] => [
  [{ label: "Bank", value: eft.bank_name }, { label: "Branch code", value: eft.branch_code, emphasis: true }],
  [{ label: "Account holder", value: eft.account_holder }],
  [{ label: "Account number", value: eft.account_number, emphasis: true }, { label: "Account type", value: eft.account_type }],
  [{ label: "EFT reference", value: eft.reference, emphasis: true }],
].map((row) => row.filter((field) => Boolean(field.value))).filter((row) => row.length > 0);

export const eftBankText = (eft: PdfEftPaymentDetails) => rows(eft)
  .map((row) => row.map((field) => `${field.label}: ${field.value}`).join(" | ")).join("\n");

/** Shared bank labels and emphasis across quotes, invoices and receipts. */
export function EftBankDetails({ details, style }: { details: PdfEftPaymentDetails; style: TextProps["style"] }) {
  return (
    <Text style={style} orphans={4} widows={4}>
      {rows(details).map((row, rowIndex) => (
        <React.Fragment key={rowIndex}>
          {rowIndex > 0 ? "\n" : ""}
          {row.map((field, fieldIndex) => (
            <React.Fragment key={field.label}>
              {fieldIndex > 0 ? " | " : ""}
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{field.label}: </Text>
              <Text style={field.emphasis ? { fontFamily: "Helvetica-Bold", color: "#1c1917" } : {}}>{field.value}</Text>
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </Text>
  );
}
