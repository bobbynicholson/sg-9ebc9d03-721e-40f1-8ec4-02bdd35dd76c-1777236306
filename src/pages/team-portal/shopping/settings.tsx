import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Settings } from "lucide-react";

const capabilities = [
  "Default reorder thresholds per category",
  "Approval workflow for large POs",
  "Toggle FX-aware costing for imported items",
];

export default function ShoppingSettingsPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Shopping Settings - CateringMS"
      icon={Settings}
      heading="Shopping Settings"
      subheading="Configure procurement"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}