import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { ShoppingCart } from "lucide-react";

const capabilities = [
  "Create PO from a low-stock list",
  "Track delivery ETA per supplier",
  "Auto-receive into inventory on arrival",
];

export default function ShoppingPOPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Purchase Orders - CateringMS"
      icon={ShoppingCart}
      heading="Purchase Orders"
      subheading="Track POs to suppliers"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}