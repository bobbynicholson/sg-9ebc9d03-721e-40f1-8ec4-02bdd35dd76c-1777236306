import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { Calendar } from "lucide-react";

const capabilities = [
  "Day-by-day cook schedule for the week",
  "Recipe scaling per guest count",
  "Equipment booking lane (oven / cold-room)",
];

export default function KitchenProductionPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Production Schedule - CateringMS"
      icon={Calendar}
      heading="Production Schedule"
      subheading="Multi-day kitchen plan"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}