import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { Users } from "lucide-react";

const capabilities = [
  "Who is in the kitchen and on what station",
  "Clock-in / clock-out per shift",
  "Hand-off notes between shifts",
];

export default function KitchenDutyRosterPage() {
  return (
    <PortalPagePlaceholder
      Nav={KitchenNav}
      title="Kitchen Duty Roster - CateringMS"
      icon={Users}
      heading="Kitchen Duty Roster"
      subheading="Who is on duty today"
      accent="from-orange-500 to-red-500"
      capabilities={capabilities}
    />
  );
}