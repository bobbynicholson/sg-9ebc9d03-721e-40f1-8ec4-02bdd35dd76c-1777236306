import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { BookOpen } from "lucide-react";

const capabilities = [
  "Master recipe list with ingredients",
  "Per-portion costing pulled from inventory",
  "Photo + plating notes per dish",
];

export default function KitchenMenuItemsPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Menu Items - CateringMS"
      icon={BookOpen}
      heading="Menu Items"
      subheading="Recipes the kitchen owns"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}