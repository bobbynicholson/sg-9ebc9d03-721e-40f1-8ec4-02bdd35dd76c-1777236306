import { AdminNav } from "@/components/admin/AdminNav";
import { ClientNav } from "@/components/navigation/ClientNav";
import { DriverNav } from "@/components/navigation/DriverNav";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { CleaningNav } from "@/components/navigation/CleaningNav";

export function DynamicNav({ userRole }: { userRole: string }) {
  const navComponents = {
    admin: AdminNav,
    client: ClientNav,
    driver: DriverNav,
    kitchen: KitchenNav,
    shopping: ShoppingNav,
    cleaning: CleaningNav,
    staff: ClientNav, // Using ClientNav as fallback for general staff
  };

  const NavComponent = navComponents[userRole as keyof typeof navComponents] || null;

  if (!NavComponent) return null;

  return <NavComponent />;
}