import React from "react";
import { Link, StyleSheet, Text, View } from "@react-pdf/renderer";
import { paymentProviderLabel, type PdfPaymentInstructions } from "@/lib/pdfPaymentDetails";
import { canKeepPdfTextTogether } from "./layout";
import { FlowingCard } from "./FlowingCard";
import { EftBankDetails, eftBankText } from "./EftBankDetails";

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: "#e7e5e4", borderRadius: 6, padding: 10, marginTop: 8 },
  heading: { fontSize: 9, letterSpacing: 1.2, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 6 },
  body: { fontSize: 9, color: "#1c1917", lineHeight: 1.4 },
  details: { fontSize: 8, color: "#57534e", lineHeight: 1.4, marginTop: 3 },
  columns: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  column: { flex: 1, minWidth: 0 },
  method: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1c1917", marginBottom: 4 },
  bold: { fontFamily: "Helvetica-Bold", color: "#1c1917" },
});

/** Shared by quote attachments, invoice downloads and their PDF previews.
 * Only headings reserve following space. A section-level minPresenceAhead
 * reserves space AFTER the entire section and can even create an empty page.
 * Bank fields are one flowing text block: ordinary bundles stay together,
 * while exceptionally long beneficiary details can still span pages.
 */
export function PaymentSection({ instructions, primary, beneficiary, quote = false, settled = false }: {
  instructions: PdfPaymentInstructions;
  primary: string;
  beneficiary: string;
  quote?: boolean;
  settled?: boolean;
}) {
  const provider = paymentProviderLabel(instructions.online_provider);
  const eft = instructions.eft;
  const bankLines = eft ? eftBankText(eft) : "";
  const hasBoth = Boolean(provider && eft);
  const measure = hasBoth ? 20 : 40;
  const onlineText = [provider, instructions.reference, instructions.payment_url].filter(Boolean).join("\n");
  const eftText = [eft?.company_name || beneficiary, bankLines, eft?.reference_hint, eft?.instructions].filter(Boolean).join("\n");
  const keepTogether = canKeepPdfTextTogether(onlineText, measure) && canKeepPdfTextTogether(eftText, measure);

  return (
    <FlowingCard style={styles.card} headingStyle={[styles.heading, { color: primary }]} title={quote ? "Payment options" : settled ? "Payment details" : "How to pay"} wrap={!keepTogether}>
      {settled ? <Text style={[styles.details, { marginTop: 0, marginBottom: 6 }]}>Paid in full. Payment details are shown for your records.</Text> : null}
      <View style={hasBoth ? styles.columns : {}}>
      {provider ? (
        <View style={hasBoth ? styles.column : {}}>
          <Text style={styles.method} minPresenceAhead={24}>Online payment</Text>
          <Text style={styles.body}>{settled ? "Online payment with " : quote ? "After accepting this quote, pay securely with " : "Pay securely with "}<Text style={styles.bold}>{provider}</Text>.</Text>
          {instructions.reference ? <Text style={styles.details}><Text style={styles.bold}>Payment reference: {instructions.reference}</Text></Text> : null}
          {instructions.payment_url ? (
            <Text style={styles.details}>
              {quote ? "Review and accept" : "Payment page"}: <Link src={instructions.payment_url}>{instructions.payment_url}</Link>
            </Text>
          ) : null}
        </View>
      ) : null}
      {eft ? (
        <View style={hasBoth ? styles.column : {}}>
          <Text style={styles.method} minPresenceAhead={24}>Bank transfer (EFT)</Text>
          <Text style={[styles.body, styles.bold]} minPresenceAhead={28}>{eft.company_name || beneficiary}</Text>
          <EftBankDetails details={eft} style={styles.details} />
          {eft.reference_hint ? <Text style={styles.details}>{eft.reference_hint}</Text> : null}
          {eft.instructions ? <Text style={styles.details}>{eft.instructions}</Text> : null}
        </View>
      ) : null}
      </View>
    </FlowingCard>
  );
}
