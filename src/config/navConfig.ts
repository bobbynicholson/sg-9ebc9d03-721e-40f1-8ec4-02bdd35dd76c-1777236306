/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Single source of truth for every role's sidebar menu.
 *
 * Why this lives here, not in each Nav file:
 *   - We had 8 hand-rolled Nav components with the menu hard-coded inside
 *     ~250 lines of mobile/desktop/collapse logic. Adding a page meant
 *     editing JSX deep in a tree. Now: add one line here.
 *   - Tone palette (active gradient, hover bg, header gradient) lives next
 *     to the menu so the whole portal experience for one role moves as
 *     one unit. Bobby owns the brand by role; this is the file he'd open.
 *   - Categories are friendlier than the old domain-driven groupings.
 *     "Today" became "Dashboard" by request; "Money" became "Financial".
 *
 * Hard rules baked in:
 *   - Daily-use sections default open, quarterly-use default closed.
 *   - The runtime auto-expands whichever section contains the active
 *     route, so the user can always see where they are even if they
 *     manually closed the section earlier.
 *   - Section ids are stable strings -- never rename once shipped or
 *     localStorage state for collapse won't migrate.
 */
import {
  LayoutDashboard,
  Calendar,
  Bell,
  UserPlus,
  FileSpreadsheet,
  User,
  Users,
  Search,
  ClipboardList,
  MapPin,
  Route,
  Package,
  BookOpen,
  ShoppingCart,
  Truck,
  ChefHat,
  DollarSign,
  Clock,
  FileText,
  CreditCard,
  Mail,
  Code2,
  MessageSquare,
  Settings,
  Building2,
  Palette,
  Plug,
  Zap,
  Crown,
  BarChart3,
  Tag,
  ArrowLeftRight,
  Globe,
  Newspaper,
  Landmark,
  ListChecks,
  Navigation,
  Home,
  Utensils,
  Warehouse,
  TrendingUp,
  ClipboardCheck,
  Sparkles,
  AlertCircle,
  Wrench,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

export interface NavItemConfig {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** One-line subtitle shown under the label when the sidebar is expanded */
  description?: string;
  /** Roles that can see this item -- defaults to all roles in the parent
   *  RoleNav. Used for inline gating like 'super_admin only' inside a
   *  shared section (e.g. Platform Admin items inside the Admin sidebar). */
  rolesAllowed?: string[];
}

export interface NavSectionConfig {
  /** Stable id used as the localStorage key suffix. Never change once
   *  shipped -- changing breaks every existing user's collapse state. */
  id: string;
  label: string;
  items: NavItemConfig[];
  /** Initial open state when the user has no stored preference. */
  defaultOpen?: boolean;
}

export interface RoleTone {
  /** Gradient applied to the active item background and header logo */
  active: string;
  /** Hover background for inactive items (light theme) */
  hover: string;
  /** Hover text colour for inactive items (light theme) */
  hoverText: string;
  /** Mobile drawer header gradient -- usually same as active */
  header: string;
  /** Subtitle colour on the mobile header */
  headerSub: string;
  /** Friendly portal label, e.g. "Driver Portal" */
  portalLabel: string;
  /** Subtitle under the portal label */
  portalSubLabel: string;
  /** Icon shown in the portal logo tile */
  portalIcon: React.ComponentType<{ className?: string }>;
  /** Root path for the portal home (used by the logo link) */
  homeHref: string;
  /** localStorage key prefix used for both section collapse and sidebar
   *  collapse state. Stable string -- never rename. */
  storagePrefix: string;
}

export interface RoleNav {
  tone: RoleTone;
  sections: NavSectionConfig[];
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Standard "Account" tail every role gets at the bottom of their nav. */
const ACCOUNT_SECTION: NavSectionConfig = {
  id: "account",
  label: "Account",
  defaultOpen: false,
  items: [
    {
      label: "My Profile",
      href: "/account/settings",
      icon: User,
      description: "Update profile and preferences",
    },
  ],
};

// ── Per-role configs ───────────────────────────────────────────────────

/**
 * Admin / Owner / Company Admin -- the catering business owner running
 * day-to-day operations. Brand-overridable colours: the runtime swaps the
 * default purple/pink gradient for company.primary_color +
 * company.secondary_color when those are set.
 */
export const ADMIN_NAV: RoleNav = {
  tone: {
    active: "from-purple-500 to-pink-500",
    hover: "hover:bg-purple-50",
    hoverText: "hover:text-purple-700",
    header: "from-purple-500 to-pink-500",
    headerSub: "text-purple-100",
    portalLabel: "Admin Portal",
    portalSubLabel: "CateringMS",
    portalIcon: Building2,
    homeHref: "/admin/dashboard",
    storagePrefix: "admin",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Analytics Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, description: "Today at a glance" },
        { label: "Calendar", href: "/admin/calendar", icon: Calendar, description: "Upcoming events" },
        { label: "Notifications", href: "/admin/notifications", icon: Bell, description: "Alerts and reminders" },
      ],
    },
    {
      id: "sales",
      label: "Sales",
      defaultOpen: true,
      items: [
        { label: "Leads", href: "/admin/leads", icon: UserPlus, description: "Enquiries waiting on a quote" },
        { label: "Quotes", href: "/admin/quotes", icon: FileSpreadsheet, description: "Drafts and sent quotes" },
        { label: "Clients", href: "/admin/clients", icon: User, description: "Your client database" },
        { label: "Client Search", href: "/admin/client-search", icon: Search, description: "Find any client fast" },
      ],
    },
    {
      id: "operations",
      label: "Operations",
      defaultOpen: true,
      items: [
        { label: "Orders", href: "/admin/orders", icon: ClipboardList, description: "Confirmed bookings" },
        { label: "Dispatch Queue", href: "/admin/order-assignments", icon: ClipboardList, description: "Assign drivers and crew" },
        { label: "Live Tracking", href: "/admin/tracking", icon: MapPin, description: "Vehicles in motion" },
        { label: "Plan Routes", href: "/admin/route-planning", icon: Route, description: "Optimise the day" },
        { label: "Equipment Shortages", href: "/admin/equipment-shortages", icon: Package, description: "What's running tight" },
        { label: "Regions", href: "/admin/regions", icon: MapPin, description: "Service zones" },
      ],
    },
    {
      id: "kitchen-stock",
      label: "Kitchen & Stock",
      defaultOpen: false,
      items: [
        { label: "Menu", href: "/admin/menu", icon: BookOpen, description: "Dishes you sell + recipes" },
        { label: "Inventory", href: "/admin/inventory", icon: Package, description: "Stock levels" },
        { label: "Shopping Dashboard", href: "/admin/shopping", icon: ShoppingCart, description: "Procurement view" },
      ],
    },
    {
      id: "team",
      label: "Team",
      defaultOpen: false,
      items: [
        { label: "All Users", href: "/admin/users", icon: Users, description: "Everyone with access" },
        { label: "Drivers", href: "/admin/driver-management", icon: Truck, description: "Driver accounts" },
        { label: "Kitchen Staff", href: "/admin/kitchen-staff", icon: ChefHat, description: "Kitchen accounts" },
        { label: "Vehicles", href: "/admin/vehicles", icon: Truck, description: "Fleet" },
        { label: "Wages", href: "/admin/wages", icon: DollarSign, description: "Payroll dashboard" },
        { label: "Staff Hours", href: "/admin/staff-hours", icon: Clock, description: "Hours worked" },
      ],
    },
    {
      id: "financial",
      label: "Financial",
      defaultOpen: false,
      items: [
        { label: "Invoices", href: "/admin/invoices", icon: FileText, description: "Send and track invoices" },
        { label: "Subscription", href: "/admin/subscription", icon: CreditCard, description: "Your CateringMS plan" },
      ],
    },
    {
      id: "marketing-comms",
      label: "Marketing & Comms",
      defaultOpen: false,
      items: [
        { label: "Lead Capture Forms", href: "/admin/integrations/embed", icon: Code2, description: "Embed forms on your site" },
        { label: "Email Templates", href: "/admin/email-templates", icon: Mail, description: "Template library" },
        { label: "After-Sales Emails", href: "/admin/after-sales-emails", icon: MessageSquare, description: "Post-event flows" },
        { label: "Email Automation", href: "/admin/email-automation-dashboard", icon: Mail, description: "Drip campaigns" },
        { label: "Notification Settings", href: "/admin/notification-settings", icon: Bell, description: "What pings you" },
        { label: "Zapier & Webhooks", href: "/admin/integrations", icon: Zap, description: "Connect external tools" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      defaultOpen: false,
      items: [
        { label: "Company Profile", href: "/admin/company-profile", icon: Building2, description: "Name, logo, contact" },
        { label: "Branding", href: "/admin/white-label", icon: Palette, description: "White-label colours" },
        { label: "Email Settings", href: "/admin/email-settings", icon: Mail, description: "SMTP and senders" },
        { label: "Automation Settings", href: "/admin/email-automation-settings", icon: Settings, description: "Drip rules" },
        { label: "Integrations", href: "/admin/integrations", icon: Plug, description: "Connected apps" },
        { label: "System Settings", href: "/admin/settings", icon: Settings, description: "Everything else" },
      ],
    },
    {
      id: "platform-admin",
      label: "Platform Admin",
      defaultOpen: false,
      items: [
        // Inline gating -- only super_admin sees these even though the
        // section is rendered inside the standard admin nav.
        { label: "Platform Dashboard", href: "/admin/platform/dashboard", icon: LayoutDashboard, rolesAllowed: ["super_admin"] },
        { label: "Companies", href: "/admin/platform/company-database", icon: Building2, rolesAllowed: ["super_admin"] },
        { label: "All Users", href: "/admin/platform/user-management", icon: Users, rolesAllowed: ["super_admin"] },
        { label: "Subscriptions", href: "/admin/platform/subscription-management", icon: CreditCard, rolesAllowed: ["super_admin"] },
        { label: "Trials", href: "/admin/platform/trial-management", icon: Clock, rolesAllowed: ["super_admin"] },
        { label: "Pricing", href: "/admin/platform/pricing-management", icon: DollarSign, rolesAllowed: ["super_admin"] },
        { label: "Currency Monitor", href: "/admin/platform/currency-monitoring", icon: TrendingUp, rolesAllowed: ["super_admin"] },
        { label: "CMS Pages", href: "/admin/platform/cms-pages", icon: Globe, rolesAllowed: ["super_admin"] },
        { label: "CMS Blog", href: "/admin/platform/cms-blog", icon: FileText, rolesAllowed: ["super_admin"] },
        { label: "Running Todo", href: "/admin/platform/running-todo", icon: ListChecks, rolesAllowed: ["super_admin"] },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

/**
 * Super Admin platform view -- the CateringMS-side operator running the
 * SaaS itself. Lives at /admin/platform/* with its own amber/orange tone.
 */
export const PLATFORM_NAV: RoleNav = {
  tone: {
    active: "from-amber-500 to-orange-500",
    hover: "hover:bg-amber-50",
    hoverText: "hover:text-amber-700",
    header: "from-amber-500 to-orange-500",
    headerSub: "text-amber-100",
    portalLabel: "Platform Admin",
    portalSubLabel: "CateringMS HQ",
    portalIcon: Crown,
    homeHref: "/admin/platform/dashboard",
    storagePrefix: "platform",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Platform Dashboard", href: "/admin/platform/dashboard", icon: LayoutDashboard, description: "MRR, signups, churn" },
      ],
    },
    {
      id: "tenants",
      label: "Tenants",
      defaultOpen: true,
      items: [
        { label: "Companies", href: "/admin/platform/company-database", icon: Building2, description: "Every catering business" },
        { label: "Users", href: "/admin/platform/user-management", icon: Users, description: "All accounts" },
        { label: "Subscriptions", href: "/admin/platform/subscription-management", icon: CreditCard, description: "Active plans" },
        { label: "Trials", href: "/admin/platform/trial-management", icon: Calendar, description: "Trial extensions" },
      ],
    },
    {
      id: "financial",
      label: "Financial",
      defaultOpen: false,
      items: [
        { label: "Financial Dashboard", href: "/admin/financial-dashboard", icon: BarChart3, description: "Revenue and ARR" },
        { label: "Pricing", href: "/admin/platform/pricing-management", icon: Tag, description: "Plans and tiers" },
        { label: "Currency Monitor", href: "/admin/platform/currency-monitoring", icon: ArrowLeftRight, description: "Live FX" },
        { label: "Payment Gateways", href: "/admin/payment-gateways", icon: Landmark, description: "Stripe, PayFast config" },
      ],
    },
    {
      id: "marketing",
      label: "Marketing",
      defaultOpen: false,
      items: [
        { label: "CMS Pages", href: "/admin/platform/cms-pages", icon: Globe, description: "Landing pages" },
        { label: "Blog", href: "/admin/platform/cms-blog", icon: Newspaper, description: "Articles" },
      ],
    },
    {
      id: "engineering",
      label: "Engineering",
      defaultOpen: false,
      items: [
        { label: "Running Todo", href: "/admin/platform/running-todo", icon: ListChecks, description: "Sprint backlog" },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

/** Driver -- mobile-first delivery view */
export const DRIVER_NAV: RoleNav = {
  tone: {
    active: "from-blue-500 to-indigo-500",
    hover: "hover:bg-blue-50",
    hoverText: "hover:text-blue-700",
    header: "from-blue-500 to-indigo-500",
    headerSub: "text-blue-100",
    portalLabel: "Driver Portal",
    portalSubLabel: "Manage deliveries",
    portalIcon: Truck,
    homeHref: "/team-portal/driver/dashboard",
    storagePrefix: "driver",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Overview", href: "/team-portal/driver/dashboard", icon: Home, description: "Today's summary" },
        { label: "Today's Routes", href: "/team-portal/driver/routes", icon: Navigation, description: "What you're driving" },
        { label: "Notifications", href: "/team-portal/driver/notifications", icon: Bell, description: "Alerts" },
      ],
    },
    {
      id: "work",
      label: "Work",
      defaultOpen: true,
      items: [
        { label: "All Deliveries", href: "/team-portal/driver/deliveries", icon: Truck, description: "Delivery history" },
        { label: "Live Tracking", href: "/team-portal/driver/tracking", icon: MapPin, description: "Update status" },
        { label: "Schedule", href: "/team-portal/driver/schedule", icon: Calendar, description: "Work schedule" },
      ],
    },
    {
      id: "financial",
      label: "Financial",
      defaultOpen: false,
      items: [
        { label: "My Earnings", href: "/team-portal/driver/earnings", icon: DollarSign, description: "Hours and pay" },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

/** Kitchen staff -- prep and production focus */
export const KITCHEN_NAV: RoleNav = {
  tone: {
    active: "from-orange-500 to-red-500",
    hover: "hover:bg-orange-50",
    hoverText: "hover:text-orange-700",
    header: "from-orange-500 to-red-500",
    headerSub: "text-orange-100",
    portalLabel: "Kitchen Portal",
    portalSubLabel: "Prep and production",
    portalIcon: ChefHat,
    homeHref: "/team-portal/kitchen/dashboard",
    storagePrefix: "kitchen",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Overview", href: "/team-portal/kitchen/dashboard", icon: LayoutDashboard, description: "Today's production" },
        { label: "Prep List", href: "/team-portal/kitchen/prep-list", icon: ClipboardList, description: "Daily prep tasks" },
        { label: "Notifications", href: "/team-portal/kitchen/notifications", icon: Bell, description: "Kitchen alerts" },
      ],
    },
    {
      id: "production",
      label: "Production",
      defaultOpen: true,
      items: [
        { label: "Production Schedule", href: "/team-portal/kitchen/production", icon: Calendar, description: "Upcoming orders" },
        { label: "Duty Roster", href: "/team-portal/kitchen/duty", icon: Clock, description: "Who's on shift" },
      ],
    },
    {
      id: "menu-stock",
      label: "Menu & Stock",
      defaultOpen: false,
      items: [
        { label: "Menu Items", href: "/team-portal/kitchen/menu", icon: Utensils, description: "Dishes and recipes" },
        { label: "Kitchen Stock", href: "/team-portal/kitchen/stock", icon: Package, description: "What's on hand" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      defaultOpen: false,
      items: [
        { label: "Kitchen Settings", href: "/team-portal/kitchen/settings", icon: Settings, description: "Configure kitchen" },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

/** Shopping / procurement staff */
export const SHOPPING_NAV: RoleNav = {
  tone: {
    active: "from-green-500 to-emerald-500",
    hover: "hover:bg-green-50",
    hoverText: "hover:text-green-700",
    header: "from-green-500 to-emerald-500",
    headerSub: "text-green-100",
    portalLabel: "Shopping Portal",
    portalSubLabel: "Procurement and inventory",
    portalIcon: ShoppingCart,
    homeHref: "/team-portal/shopping/dashboard",
    storagePrefix: "shopping",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Overview", href: "/team-portal/shopping/dashboard", icon: LayoutDashboard, description: "Inventory at a glance" },
        { label: "Stock Alerts", href: "/team-portal/shopping/alerts", icon: TrendingUp, description: "Low and critical stock" },
        { label: "Notifications", href: "/team-portal/shopping/notifications", icon: Bell, description: "Stock alerts" },
      ],
    },
    {
      id: "demand",
      label: "Demand",
      defaultOpen: true,
      items: [
        { label: "Kitchen Demand", href: "/team-portal/shopping/kitchen-demand", icon: ChefHat, description: "What kitchen needs" },
        { label: "Purchase Orders", href: "/team-portal/shopping/orders", icon: ShoppingCart, description: "Create and track POs" },
      ],
    },
    {
      id: "inventory",
      label: "Inventory",
      defaultOpen: false,
      items: [
        { label: "Current Stock", href: "/team-portal/shopping/inventory", icon: Warehouse, description: "View levels" },
        { label: "Suppliers", href: "/team-portal/shopping/suppliers", icon: Users, description: "Supplier database" },
        { label: "Invoices", href: "/team-portal/shopping/invoices", icon: FileText, description: "Purchase invoices" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      defaultOpen: false,
      items: [
        { label: "Shopping Settings", href: "/team-portal/shopping/settings", icon: Settings, description: "Configure" },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

/** Cleaning crew */
export const CLEANING_NAV: RoleNav = {
  tone: {
    active: "from-cyan-500 to-blue-500",
    hover: "hover:bg-cyan-50",
    hoverText: "hover:text-cyan-700",
    header: "from-cyan-500 to-blue-500",
    headerSub: "text-cyan-100",
    portalLabel: "Cleaning Portal",
    portalSubLabel: "Tasks and equipment",
    portalIcon: Sparkles,
    homeHref: "/team-portal/cleaning/dashboard",
    storagePrefix: "cleaning",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Overview", href: "/team-portal/cleaning/dashboard", icon: LayoutDashboard, description: "Today's tasks" },
        { label: "Cleaning Tasks", href: "/team-portal/cleaning/tasks", icon: ClipboardCheck, description: "Task list" },
        { label: "Notifications", href: "/team-portal/cleaning/notifications", icon: Bell, description: "Cleaning alerts" },
      ],
    },
    {
      id: "schedules",
      label: "Schedules & Workflows",
      defaultOpen: true,
      items: [
        { label: "Schedules", href: "/team-portal/cleaning/schedules", icon: Calendar, description: "When to clean what" },
        { label: "Workflows", href: "/team-portal/cleaning/workflows", icon: Sparkles, description: "Standard procedures" },
      ],
    },
    {
      id: "equipment",
      label: "Equipment",
      defaultOpen: false,
      items: [
        { label: "Equipment Verification", href: "/team-portal/cleaning/equipment", icon: Package, description: "Verify on return" },
        { label: "Damage Reports", href: "/team-portal/cleaning/damage", icon: AlertCircle, description: "Report damage" },
        { label: "Supplies", href: "/team-portal/cleaning/supplies", icon: Wrench, description: "Cleaning supplies" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      defaultOpen: false,
      items: [
        { label: "Cleaning Settings", href: "/team-portal/cleaning/settings", icon: Settings, description: "Configure" },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

/** Client / end customer */
export const CLIENT_NAV: RoleNav = {
  tone: {
    active: "from-green-600 to-emerald-600",
    hover: "hover:bg-green-50",
    hoverText: "hover:text-green-700",
    header: "from-green-600 to-emerald-600",
    headerSub: "text-green-100",
    portalLabel: "Client Portal",
    portalSubLabel: "Your events and orders",
    portalIcon: User,
    homeHref: "/client-portal/dashboard",
    storagePrefix: "client",
  },
  sections: [
    {
      id: "dashboard",
      label: "Dashboard",
      defaultOpen: true,
      items: [
        { label: "Overview", href: "/client-portal/dashboard", icon: LayoutDashboard, description: "Your account" },
        { label: "My Orders", href: "/client-portal/my-orders", icon: ClipboardList, description: "Past and upcoming" },
      ],
    },
    {
      id: "tracking",
      label: "Tracking",
      defaultOpen: true,
      items: [
        { label: "Live Tracking", href: "/client-portal/tracking", icon: MapPin, description: "Where's your order" },
      ],
    },
    {
      id: "financial",
      label: "Financial",
      defaultOpen: false,
      items: [
        { label: "Billing", href: "/client-portal/billing", icon: CreditCard, description: "Invoices and payments" },
      ],
    },
    ACCOUNT_SECTION,
  ],
};

// ── Role -> config mapping ─────────────────────────────────────────────

/**
 * Pick the right nav config for a given role.
 *
 * Note on platform vs admin: the same user (super_admin) sees ADMIN_NAV
 * by default but the Platform Admin section inside it gates to super_admin
 * via rolesAllowed. PLATFORM_NAV is a separate, dedicated surface used
 * only when explicitly mounted (e.g. the /admin/platform shell). For now
 * the runtime returns ADMIN_NAV for super_admin too -- pages under
 * /admin/platform/* can opt in to PLATFORM_NAV by passing role="platform"
 * to DashboardShell.
 */
export function getNavForRole(role: string): RoleNav {
  switch (role) {
    case "platform":
      return PLATFORM_NAV;
    case "super_admin":
    case "company_admin":
    case "admin":
    case "owner":
      return ADMIN_NAV;
    case "driver":
      return DRIVER_NAV;
    case "kitchen_staff":
    case "kitchen":
      return KITCHEN_NAV;
    case "shopping_staff":
    case "shopping":
      return SHOPPING_NAV;
    case "cleaning_staff":
    case "cleaning":
      return CLEANING_NAV;
    case "client":
      return CLIENT_NAV;
    default:
      return ADMIN_NAV;
  }
}

/**
 * Filter a section's items by the caller's role.
 *
 * Used to hide Platform Admin items from non-super_admins inside the
 * shared admin nav.
 */
export function visibleItems(section: NavSectionConfig, role: string): NavItemConfig[] {
  return section.items.filter((item) => !item.rolesAllowed || item.rolesAllowed.includes(role));
}

/**
 * Hide a whole section if every item is gated away from this role.
 * Returns the sections the caller should render.
 */
export function visibleSections(nav: RoleNav, role: string): NavSectionConfig[] {
  return nav.sections.filter((s) => visibleItems(s, role).length > 0);
}
