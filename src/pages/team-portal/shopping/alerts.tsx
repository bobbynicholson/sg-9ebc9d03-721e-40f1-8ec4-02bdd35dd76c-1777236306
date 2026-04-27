import { PortalPagePlaceholder } from "@/components/portal/PortalPagePlaceholder";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { TrendingUp } from "lucide-react";

const capabilities = [
  "Auto-flag when current_stock <= minimum_stock",
  "Predicted run-out date based on usage",
  "One-click create PO for everything below par",
];

export default function ShoppingAlertsPage() {
  return (
    <PortalPagePlaceholder
      Nav={ShoppingNav}
      title="Stock Alerts - CateringMS"
      icon={TrendingUp}
      heading="Stock Alerts"
      subheading="Items running low or out"
      accent="from-green-500 to-emerald-500"
      capabilities={capabilities}
    />
  );
}