import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { AlertCircle } from "lucide-react";

const capabilities = [
  "Damage register with photo evidence",
  "Replacement cost estimate per item",
  "Trends by event type and venue",
];

export default function CleaningDamagePage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Damage Reports - CateringMS"
      icon={AlertCircle}
      heading="Damage Reports"
      subheading="Track damaged or lost equipment"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}