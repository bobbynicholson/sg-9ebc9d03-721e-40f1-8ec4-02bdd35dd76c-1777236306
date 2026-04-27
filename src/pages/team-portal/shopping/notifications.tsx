import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Bell } from "lucide-react";

const capabilities = [
  "Low-stock pings the moment items dip below par",
  "Supplier delivery confirmations",
  "Price-change alerts from your supplier feeds",
];

export default function ShoppingNotificationsPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Shopping Notifications - CateringMS"
      icon={Bell}
      heading="Shopping Notifications"
      subheading="Procurement alerts"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}