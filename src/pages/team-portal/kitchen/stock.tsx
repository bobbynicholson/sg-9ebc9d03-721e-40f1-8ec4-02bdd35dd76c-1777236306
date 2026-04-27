import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { Package } from "lucide-react";

const capabilities = [
  "Live read of inventory_items in the kitchen",
  "Flag items below par for shopping team",
  'Quick "used X kg" deduction button',
];

export default function KitchenStockPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Kitchen Stock - CateringMS"
      icon={Package}
      heading="Kitchen Stock"
      subheading="What you have on hand right now"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}