/**
 * ShoppingNav -- Wave 70.10
 *
 * Restructured into the kitchen-style 3-section + footer pattern.
 * Shopping was the worst-laid-out of the portals -- "Orders" had
 * one item, "Settings" had one item, and Stock Alerts + Kitchen
 * Demand sat under "Dashboard" with no obvious grouping.
 *
 *   LIVE NOW    -- Today, Stock Alerts, Kitchen Demand
 *   PROCUREMENT -- Purchase Orders, Current Stock, Suppliers,
 *                  Invoices, Receipt scanner
 *   Footer      -- Notifications, Settings
 */
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
      id: "live-now",
      title: "Live now",
      defaultOpen: true,
      items: [
        { title: "Today",          href: "/team-portal/shopping/dashboard",      icon: LayoutDashboard, description: "Inventory overview" },
        { title: "Stock Alerts",   href: "/team-portal/shopping/alerts",         icon: TrendingUp,      description: "Shortfalls vs orders" },
        { title: "Kitchen Demand", href: "/team-portal/shopping/kitchen-demand", icon: ChefHat,         description: "What the kitchen needs" },
      ],
    },
    {
      id: "procurement",
      title: "Procurement",
      defaultOpen: false,
      items: [
        { title: "Purchase Orders", href: "/team-portal/shopping/orders",    icon: ShoppingCart, description: "Create and track POs" },
        { title: "Current Stock",   href: "/team-portal/shopping/inventory", icon: Warehouse,    description: "Inventory levels" },
        { title: "Suppliers",       href: "/team-portal/shopping/suppliers", icon: Users,        description: "Contacts + prices" },
        { title: "Invoices",        href: "/team-portal/shopping/invoices",  icon: FileText,     description: "Purchase invoices" },
        { title: "Receipt scanner", href: "/team-portal/shopping/receipts",  icon: Camera,       description: "Photograph supplier slips" },
      ],
    },
    {
      id: "footer",
      title: "",
      defaultOpen: true,
      footerTreatment: true,
      items: [
        { title: "Notifications", href: "/team-portal/shopping/notifications", icon: Bell },
        { title: "Settings",      href: "/team-portal/shopping/settings",      icon: Settings },
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
