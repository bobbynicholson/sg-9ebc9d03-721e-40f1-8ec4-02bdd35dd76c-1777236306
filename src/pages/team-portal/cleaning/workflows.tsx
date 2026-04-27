import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { Sparkles } from "lucide-react";

const capabilities = [
  "Step-by-step SOP per equipment type",
  "Versioned with approver sign-off",
  "Embed photo / video walk-throughs",
];

export default function CleaningWorkflowsPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Cleaning Workflows - CateringMS"
      icon={Sparkles}
      heading="Cleaning Workflows"
      subheading="Standard procedures (SOPs)"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}