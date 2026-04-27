import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Users } from "lucide-react";

const capabilities = [
  "Contacts, lead time, payment terms",
  "Per-item supplier preference",
  "Performance scorecard (on-time, accuracy)",
];

export default function ShoppingSuppliersPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Suppliers - CateringMS"
      icon={Users}
      heading="Suppliers"
      subheading="Your supplier database"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}