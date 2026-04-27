import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { Bell } from "lucide-react";

const capabilities = [
  "Real-time order coming-in alerts",
  "Prep delay warnings sent to your phone",
  "Kitchen-only Slack-style chat for the team",
];

export default function KitchenNotificationsPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Kitchen Notifications - CateringMS"
      icon={Bell}
      heading="Kitchen Notifications"
      subheading="Dispatch alerts and prep updates"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}