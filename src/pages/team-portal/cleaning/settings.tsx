import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { Settings } from "lucide-react";

const capabilities = [
  "Default cleaning standards per equipment",
  "Damage-cost rate card",
  "Toggle photo-required vs optional",
];

export default function CleaningSettingsPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Cleaning Settings - CateringMS"
      icon={Settings}
      heading="Cleaning Settings"
      subheading="Configure cleaning workflow"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}