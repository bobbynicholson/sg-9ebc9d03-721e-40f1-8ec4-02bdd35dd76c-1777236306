import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { ClientNav } from "@/components/navigation/ClientNav";
import { DriverNav } from "@/components/navigation/DriverNav";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { CleaningNav } from "@/components/navigation/CleaningNav";

interface DynamicNavProps {
  companySlug?: string;
}

export function DynamicNav({ companySlug }: DynamicNavProps) {
  const { user, userRoles } = useAuth();

  // If no user or no roles, don't show navigation
  if (!user || !userRoles || userRoles.length === 0) {
    return null;
  }

  // Get primary role (first role in the array)
  const primaryRole = userRoles[0];

  // Render navigation based on primary role
  switch (primaryRole) {
    case "admin":
    case "super_admin":
      return <AdminNav />;
    
    case "client":
      return <ClientNav companySlug={companySlug} />;
    
    case "driver":
      return <DriverNav companySlug={companySlug} />;
    
    case "kitchen":
      return <KitchenNav companySlug={companySlug} />;
    
    case "shopping":
      return <ShoppingNav companySlug={companySlug} />;
    
    case "cleaning":
      return <CleaningNav companySlug={companySlug} />;
    
    default:
      // Default to client nav for unknown roles
      return <ClientNav companySlug={companySlug} />;
  }
}