import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { FileText } from "lucide-react";

const capabilities = [
  "Upload supplier invoices for matching",
  "Auto-link invoice to PO and inventory",
  "Push to Xero / QuickBooks once configured",
];

export default function ShoppingInvoicesPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Purchase Invoices - CateringMS"
      icon={FileText}
      heading="Purchase Invoices"
      subheading="Bills from suppliers"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}