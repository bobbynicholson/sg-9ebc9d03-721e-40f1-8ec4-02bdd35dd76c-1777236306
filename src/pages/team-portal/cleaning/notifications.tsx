import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { Bell } from "lucide-react";

const capabilities = [
  "Equipment-overdue alerts",
  "Damage report acknowledgements",
  "Daily start-of-shift checklist push",
];

export default function CleaningNotificationsPage() {
  return (
    <PortalPagePlaceholder
      Nav={CleaningNav}
      title="Cleaning Notifications - CateringMS"
      icon={Bell}
      heading="Cleaning Notifications"
      subheading="Tasks and damage alerts"
      accent="from-cyan-500 to-blue-500"
      capabilities={capabilities}
    />
  );
}