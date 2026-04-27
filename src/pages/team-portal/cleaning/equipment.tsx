import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { Package } from "lucide-react";

const capabilities = [
  "Scan or check off equipment per function",
  "Log damage with photo and location",
  "Auto-bill client for missing items",
];

export default function CleaningEquipmentPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Equipment Verification - CateringMS"
      icon={Package}
      heading="Equipment Verification"
      subheading="Verify gear returned from a function"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}