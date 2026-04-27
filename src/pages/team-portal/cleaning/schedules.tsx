import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { Calendar } from "lucide-react";

const capabilities = [
  "Daily / weekly / monthly cleaning rotations",
  "Auto-assigned to whoever is rostered",
  "Skipped-task review workflow",
];

export default function CleaningSchedulesPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Cleaning Schedules - CateringMS"
      icon={Calendar}
      heading="Cleaning Schedules"
      subheading="Recurring cleaning calendar"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}