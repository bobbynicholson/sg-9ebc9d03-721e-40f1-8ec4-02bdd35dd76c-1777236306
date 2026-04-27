import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { ClipboardCheck } from "lucide-react";

const capabilities = [
  "Tickable task list scoped to today",
  "Per-equipment cleaning instructions",
  "Photo proof on completion",
];

export default function CleaningTasksPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Cleaning Tasks - CateringMS"
      icon={ClipboardCheck}
      heading="Cleaning Tasks"
      subheading="Today's task list"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}