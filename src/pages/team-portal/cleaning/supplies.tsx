import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { Wrench } from "lucide-react";

const capabilities = [
  "Stock view of cleaning consumables",
  "Low-stock alerts feed the shopping team",
  "Per-shift usage tracking",
];

export default function CleaningSuppliesPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Cleaning Supplies - CateringMS"
      icon={Wrench}
      heading="Cleaning Supplies"
      subheading="Detergents, cloths, gloves"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}