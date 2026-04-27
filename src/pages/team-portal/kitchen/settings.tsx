import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { Settings } from "lucide-react";

const capabilities = [
  "Set default lead times for each course",
  "Choose plating templates",
  "Toggle dietary alert thresholds",
];

export default function KitchenSettingsPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Kitchen Settings - CateringMS"
      icon={Settings}
      heading="Kitchen Settings"
      subheading="Configure your kitchen workflow"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}