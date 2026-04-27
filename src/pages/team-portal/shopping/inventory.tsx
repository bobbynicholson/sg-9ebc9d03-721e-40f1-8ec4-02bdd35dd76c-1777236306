import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Warehouse } from "lucide-react";

const capabilities = [
  "Tabular view of every inventory_items row",
  "Filter by category and below-par flag",
  "Click-to-edit current_stock with audit trail",
];

export default function ShoppingInventoryPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Current Stock - CateringMS"
      icon={Warehouse}
      heading="Current Stock"
      subheading="Live inventory levels"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}