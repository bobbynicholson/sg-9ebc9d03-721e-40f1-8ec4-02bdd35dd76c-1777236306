import { AdminNav } from "@/components/admin/AdminNav";
import { ClientNav } from "@/components/navigation/ClientNav";
import { DriverNav } from "@/components/navigation/DriverNav";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { CleaningNav } from "@/components/navigation/CleaningNav";

export function DynamicNav({ userRole }: { userRole: string }) {
  // Map all role types to their appropriate navigation components
  const navComponents: Record<string, typeof AdminNav | null> = {
    super_admin: AdminNav,
    company_admin: AdminNav,
    admin: AdminNav,
    owner: AdminNav,
    client: ClientNav,
    driver: DriverNav,
    kitchen_staff: KitchenNav,
    shopping_staff: ShoppingNav,
    cleaning_staff: CleaningNav,
  };

  const NavComponent = navComponents[userRole] || null;

  if (!NavComponent) {
    console.warn(`[DynamicNav] No navigation component found for role: ${userRole}`);
    return null;
  }

  return <NavComponent />;
}