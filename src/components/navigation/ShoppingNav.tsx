import {
  LayoutDashboard,
  ShoppingCart,
  Bell,
  TrendingUp,
  ChefHat,
  Warehouse,
  Users,
  FileText,
  Camera,
  Settings,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";

const config: PortalSidebarConfig = {
  role: "shopping",
  title: "Shopping Portal",
  mobileSubtitle: "Manage inventory",
  brandIcon: ShoppingCart,
  accentGradient: "from-green-500 to-emerald-500",
  accentGradientDark: "from-green-600 to-emerald-600",
  hoverClasses: "hover:bg-emerald-50 hover:text-emerald-700",
  activeHoverClasses: "hover:from-green-600 hover:to-emerald-600",
  mobileSubtitleClasses: "text-green-100",
  searchAccent: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700",
  searchHint: "Search inventory, suppliers...",
  dashboardHref: "/team-portal/shopping/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/shopping/alerts",    label: "Stock alerts", sub: "Shortfalls vs orders", icon: TrendingUp,   accent: "from-red-500 to-orange-500" },
    { href: "/team-portal/shopping/orders",    label: "Open POs",     sub: "Track deliveries",     icon: ShoppingCart, accent: "from-blue-500 to-indigo-500" },
    { href: "/team-portal/shopping/suppliers", label: "Suppliers",    sub: "Contacts + prices",    icon: Users,        accent: "from-purple-500 to-pink-500" },
  ],
  sections: [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        { title: "Overview",       href: "/team-portal/shopping/dashboard",      icon: LayoutDashboard, description: "Inventory overview" },
        { title: "Notifications",  href: "/team-portal/shopping/notifications",  icon: Bell,            description: "Stock alerts" },
        { title: "Stock Alerts",   href: "/team-portal/shopping/alerts",         icon: TrendingUp,      description: "Low stock items" },
        { title: "Kitchen Demand", href: "/team-portal/shopping/kitchen-demand", icon: ChefHat,         description: "What the kitchen needs from upcoming orders" },
      ],
    },
    {
      id: "orders",
      title: "Orders",
      defaultOpen: true,
      items: [
        { title: "Purchase Orders", href: "/team-portal/shopping/orders", icon: ShoppingCart, description: "Create and track POs" },
      ],
    },
    {
      id: "inventory",
      title: "Inventory & Suppliers",
      defaultOpen: false,
      items: [
        { title: "Current Stock",    href: "/team-portal/shopping/inventory", icon: Warehouse, description: "View inventory levels" },
        { title: "Suppliers",        href: "/team-portal/shopping/suppliers", icon: Users,     description: "Supplier database" },
        { title: "Invoices",         href: "/team-portal/shopping/invoices",  icon: FileText,  description: "Purchase invoices" },
        { title: "Receipt scanner",  href: "/team-portal/shopping/receipts",  icon: Camera,    description: "Photograph supplier slips, AI pulls line items" },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      defaultOpen: false,
      items: [
        { title: "Shopping Settings", href: "/team-portal/shopping/settings", icon: Settings, description: "Configure settings" },
      ],
    },
  ],
};

interface ShoppingNavProps {
  className?: string;
  companySlug?: string;
}

export function ShoppingNav(_: ShoppingNavProps = {}) {
  return <PortalSidebar config={config} />;
}
