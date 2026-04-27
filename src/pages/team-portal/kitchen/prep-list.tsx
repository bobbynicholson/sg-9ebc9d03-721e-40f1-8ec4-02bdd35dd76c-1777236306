import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { ClipboardList } from "lucide-react";

const capabilities = [
  "Auto-generated from confirmed orders",
  "Tickable items, drag to reorder priority",
  "Allergen and dietary flags surfaced",
];

export default function KitchenPrepListPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Daily Prep List - CateringMS"
      icon={ClipboardList}
      heading="Daily Prep List"
      subheading="Today's prep tasks per order"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}