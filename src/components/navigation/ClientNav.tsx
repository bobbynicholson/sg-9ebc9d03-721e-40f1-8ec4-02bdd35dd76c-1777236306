import {
  Bell,
  FileText,
  LayoutDashboard,
  MapPin,
  Receipt,
  ScrollText,
  ShoppingCart,
  User,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "@/components/navigation/PortalSidebar";
import { BRAND_ACCENT, BRAND_PORTAL_PALETTE } from "@/lib/branding/portalPalette";
import { useAuth } from "@/contexts/AuthContext";
import { buildCompanyTermsPath } from "@/lib/companyLegal";
import { useResolvedTenantSlug } from "@/lib/tenantUrl";

export function ClientNav() {
  // POPIA/CPA: the client portal must always link the caterer's public
  // T&Cs. /terms is a GLOBAL_PREFIXES route so withSlug leaves it alone;
  // the company id keeps the link working when no slug resolves.
  const slug = useResolvedTenantSlug();
  const { company } = useAuth();
  const termsIdentifier = slug || company?.id || "";

  const config: PortalSidebarConfig = {
    role: "client",
    title: "Client Portal",
    mobileSubtitle: "Quotes, bookings, invoices",
    brandIcon: User,
    ...BRAND_PORTAL_PALETTE,
    // Client-facing pages must feel like the catering company's portal,
    // not CateringMS. Use the same brand-painted rail as tenant admin.
    appearance: "brand",
    searchHint: "Search bookings, invoices...",
    dashboardHref: "/client-portal/dashboard",
    mobileQuickActions: [
      { href: "/client-portal/my-orders", label: "Bookings", sub: "Active + history", icon: ShoppingCart, accent: BRAND_ACCENT },
      { href: "/client-portal/tracking", label: "Tracking", sub: "Driver ETA", icon: MapPin, accent: BRAND_ACCENT },
      { href: "/client-portal/billing", label: "Billing", sub: "Pay + invoices", icon: Receipt, accent: BRAND_ACCENT },
    ],
    sections: [
      {
        id: "dashboard",
        title: "Home",
        defaultOpen: true,
        items: [
          { title: "Dashboard", href: "/client-portal/dashboard", icon: LayoutDashboard, description: "Your overview" },
        ],
      },
      {
        id: "bookings",
        title: "Bookings",
        defaultOpen: true,
        items: [
          { title: "Quotes", href: "/client-portal/quotes", icon: FileText, description: "Approve or request edits" },
          { title: "Bookings", href: "/client-portal/my-orders", icon: ShoppingCart, description: "Upcoming and past events" },
          { title: "Live tracking", href: "/client-portal/tracking", icon: MapPin, description: "Delivery ETA and status" },
          { title: "Billing", href: "/client-portal/billing", icon: Receipt, description: "Invoices and payments" },
        ],
      },
      {
        id: "account",
        title: "",
        defaultOpen: true,
        footerTreatment: true,
        items: [
          { title: "Notifications", href: "/client-portal/notifications", icon: Bell },
          { title: "Profile", href: "/client-portal/profile", icon: User },
          ...(termsIdentifier
            ? [{
                title: "Terms & Conditions",
                href: buildCompanyTermsPath(termsIdentifier),
                icon: ScrollText,
                description: "The caterer's terms",
              }]
            : []),
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}
