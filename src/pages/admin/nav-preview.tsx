/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/nav-preview
 *
 * Side-by-side mockup of the current AdminNav vs. the proposed
 * restructure. Static -- the items are anchor tags styled to look like
 * the real nav, but clicking them navigates as if from anywhere else.
 * Lets the operator eyeball the new IA before any code goes live in
 * AdminNav.tsx itself.
 *
 * No production behaviour depends on this page; safe to delete once
 * the restructure ships.
 */
import Head from "next/head";
import {
  LayoutDashboard, Users, Mail, MapPin, ClipboardList, CreditCard,
  FileText, Package, Building2, DollarSign, Search, Clock, TrendingUp,
  Bell, MessageSquare, Truck, Calendar, ShoppingCart, UserPlus,
  FileSpreadsheet, Plug, Route, ShoppingBag, Zap, BarChart3,
  Target, ChefHat, Wand2, Palette, Code2, Sparkles, Receipt, Wallet,
  Briefcase, BookOpen, Layers, Globe as Globe2,
  Settings as SettingsIcon,
} from "lucide-react";
import { CollapsibleNavSection } from "@/components/navigation/CollapsibleNavSection";
import { NoIndexMeta } from "@/components/NoIndexMeta";

interface PreviewItem {
  title: string;
  href?: string;          // optional -- some items below are vapourware
  icon: React.ComponentType<{ className?: string }>;
  isNew?: boolean;        // shows a small "NEW" pill
  movedFrom?: string;     // shows "moved from X" caption
}
interface PreviewSection {
  id: string;
  title: string;
  defaultOpen: boolean;
  isNewSection?: boolean;
  items: PreviewItem[];
}

// ── Proposed structure (v2 -- after Bobby's 9 decisions) ────────────
// Decisions applied:
//   1. Refunds stays UNGATED -- kept in Core, not Financial.
//   2. Drop Branding's duplicate Integrations link; keep Comms copy.
//   3. Fold After-Sales templates + Automation into a single Lifecycle
//      Emails sub-page.
//   4. Kill the "Planning Admin" section. Distribute its items:
//      Client Search -> Core, Job Progress -> Operations, HR Solutions
//      -> Team Management.
//   5. Rename "Departments" -> "Teams" (matches the existing role
//      naming + Team Management heading).
//   6. Suppliers moves to Stock (operator tool, not finance ledger).
//   7. Equipment becomes ONE hub page with internal tabs (Catalog /
//      Availability / Shortages / Hire-in). Single nav entry under
//      Stock. Offering shrinks to Menu + Offering Hub.
//   8. Stock + Wages defaultOpen: true (daily-use sections).
//   9. Teams Hub renders all 4 team rows always (no auto-hide).
// Plus peer-review fix: Job Progress + HR Solutions are EXISTING
// pages -- mark MOVED, not NEW.
const PROPOSED_SECTIONS: PreviewSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    defaultOpen: true,
    items: [
      { title: "Analytics Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "core",
    title: "Core Management",
    defaultOpen: true,
    items: [
      { title: "Contacts",       href: "/admin/contacts",       icon: Users },
      { title: "Leads",          href: "/admin/leads",          icon: UserPlus },
      { title: "Quotes",         href: "/admin/quotes",         icon: FileText },
      { title: "Orders",         href: "/admin/orders",         icon: ClipboardList },
      { title: "Invoices",       href: "/admin/invoices",       icon: Receipt },
      { title: "Refunds",        href: "/admin/refunds",        icon: CreditCard },
      { title: "Calendar",       href: "/admin/calendar",       icon: Calendar },
      { title: "Client Search",  href: "/admin/client-search",  icon: Search,    movedFrom: "Operations" },
    ],
  },
  {
    id: "offering",
    title: "Offering",
    defaultOpen: false,
    isNewSection: true,
    items: [
      { title: "Offering Hub", icon: Sparkles, isNew: true },
      { title: "Menu",         href: "/admin/menu", icon: BookOpen, movedFrom: "Core" },
    ],
  },
  {
    id: "stock",
    title: "Stock",
    defaultOpen: true,                    // ← decision #8: daily-use, open
    isNewSection: true,
    items: [
      { title: "Stock Overview",     icon: BarChart3, isNew: true },
      { title: "Food & Ingredients", href: "/admin/inventory", icon: Package, movedFrom: "Core" },
      { title: "Equipment",          href: "/admin/equipment", icon: Layers, movedFrom: "Core" },
      { title: "Hire-in Orders",     href: "/admin/equipment/hire-orders", icon: ShoppingCart, movedFrom: "Core" },
      { title: "Suppliers",          href: "/admin/suppliers", icon: Building2, movedFrom: "Operations" },
    ],
  },
  {
    id: "teams",                          // ← renamed from "departments" (#5)
    title: "Teams",
    defaultOpen: false,
    isNewSection: true,
    items: [
      { title: "Teams Hub", icon: Briefcase, isNew: true },
      { title: "Kitchen",   icon: ChefHat,   isNew: true },
      { title: "Drivers",   icon: Truck,     isNew: true },
      { title: "Shopping",  href: "/admin/shopping", icon: ShoppingBag, movedFrom: "Operations" },
      { title: "Cleaning",  icon: Sparkles,  isNew: true },
    ],
  },
  {
    id: "wages",
    title: "Wages",
    defaultOpen: true,                    // ← decision #8: daily-use, open
    isNewSection: true,
    items: [
      { title: "All Wages Dashboard", href: "/admin/wages",             icon: Wallet,    isNew: true },
      { title: "Staff & Rates",       href: "/admin/staff",             icon: Users,     movedFrom: "Team" },
      { title: "Staff Hours",         href: "/admin/staff-hours",       icon: Clock,     movedFrom: "Team" },
      { title: "Driver Settlement",   href: "/admin/driver-settlement", icon: DollarSign, movedFrom: "Team" },
      { title: "Public Holidays",     href: "/admin/public-holidays",   icon: Calendar,  movedFrom: "Team" },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    defaultOpen: false,
    items: [
      { title: "Dispatch Queue",  href: "/admin/order-assignments", icon: Target },
      { title: "Live Operations", href: "/admin/tracking",          icon: MapPin },
      { title: "Plan Routes",     href: "/admin/route-planning",    icon: Route },
      { title: "Vehicles",        href: "/admin/vehicles",          icon: Truck },
      { title: "Regions",         href: "/admin/regions",           icon: Globe2 },
      { title: "Job Progress",    href: "/admin/job-progress-overview", icon: BarChart3, movedFrom: "(unlinked)" },
      { title: "Equipment Shortages", href: "/admin/equipment-shortages", icon: Bell },
    ],
  },
  {
    id: "financial",
    title: "Financial",
    defaultOpen: false,
    items: [
      { title: "Financial Dashboard", href: "/admin/financial-dashboard", icon: TrendingUp },
      { title: "Tax Overview",        href: "/admin/tax-purchases",       icon: FileSpreadsheet, movedFrom: "Operations" },
    ],
  },
  {
    id: "team",
    title: "Team Management",
    defaultOpen: false,
    items: [
      { title: "Full Team",     href: "/admin/users",         icon: Users },
      { title: "Onboarding",    href: "/admin/onboarding",    icon: Wand2,   movedFrom: "Core" },
      { title: "HR Solutions",  href: "/admin/hr-solutions",  icon: Briefcase, movedFrom: "(unlinked)" },
    ],
  },
  {
    id: "comms",
    title: "Communications",
    defaultOpen: false,
    items: [
      { title: "Email Settings",       href: "/admin/email-settings",      icon: Mail },
      { title: "Zapier & Webhooks",    href: "/admin/integrations",        icon: Plug },
      { title: "Lead Capture Forms",   href: "/admin/integrations/embed",  icon: Code2 },
      { title: "Messaging Templates",  href: "/admin/messaging-templates", icon: MessageSquare },
      { title: "Lifecycle Emails",     href: "/admin/email-templates",     icon: Zap, isNew: true },
      { title: "Notification Settings", href: "/admin/notification-settings", icon: Bell },
    ],
  },
  {
    id: "branding",
    title: "Branding & Settings",
    defaultOpen: false,
    items: [
      { title: "Company Profile", href: "/admin/company-profile", icon: Building2 },
      { title: "White Label",     href: "/admin/white-label",     icon: Palette },
      { title: "System Settings", href: "/admin/settings",        icon: SettingsIcon },
      // NB: duplicate /admin/integrations link removed -- now lives
      // only in Communications (decision #2).
    ],
  },
];

// Visual primitives copied from AdminNav so the preview LOOKS authentic
// without sharing the routing logic.
function PreviewLink({ item }: { item: PreviewItem }) {
  const Icon = item.icon;
  const inner = (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors">
      <Icon className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-700" />
      <span className="flex-1 truncate">{item.title}</span>
      {item.isNew && (
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
          New
        </span>
      )}
      {item.movedFrom && !item.isNew && (
        <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
          Moved
        </span>
      )}
    </div>
  );
  if (!item.href) {
    return <div className="opacity-90 cursor-not-allowed">{inner}</div>;
  }
  return <a href={item.href}>{inner}</a>;
}

function ProposedNav() {
  return (
    <nav className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-[0.18em] font-bold opacity-90">Proposed</p>
        <h2 className="text-lg font-bold mt-0.5">Restructured admin nav</h2>
        <p className="text-xs opacity-80 mt-1">
          NEW = section/page that doesn't exist yet · MOVED = same page, new home
        </p>
      </div>
      <div className="px-3 py-4 max-h-[80vh] overflow-y-auto">
        {PROPOSED_SECTIONS.map((section) => (
          <CollapsibleNavSection
            key={section.id}
            title={section.title}
            defaultOpen={section.defaultOpen}
          >
            <div className="space-y-1">
              {section.items.map((item) => (
                <PreviewLink key={item.title} item={item} />
              ))}
            </div>
            {section.isNewSection && (
              <div className="ml-2 mt-1 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                ↑ New section
              </div>
            )}
          </CollapsibleNavSection>
        ))}
      </div>
    </nav>
  );
}

// ── Current structure ───────────────────────────────────────────────
// Mirror of the real AdminNav.tsx as it ships today. Static render so
// the two columns share identical layout primitives; nothing here can
// drift when AdminNav.tsx is edited -- update both intentionally.
const CURRENT_SECTIONS: PreviewSection[] = [
  {
    id: "dashboard", title: "Dashboard", defaultOpen: true,
    items: [
      { title: "Analytics Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "core", title: "Core Management", defaultOpen: true,
    items: [
      { title: "Contacts",       href: "/admin/contacts",       icon: Users },
      { title: "Leads",          href: "/admin/leads",          icon: UserPlus },
      { title: "Quotes",         href: "/admin/quotes",         icon: FileText },
      { title: "Orders",         href: "/admin/orders",         icon: ClipboardList },
      { title: "Invoices",       href: "/admin/invoices",       icon: Receipt },
      { title: "Refunds",        href: "/admin/refunds",        icon: CreditCard },
      { title: "Calendar",       href: "/admin/calendar",       icon: Calendar },
      { title: "Inventory",      href: "/admin/inventory",      icon: Package },
      { title: "Menu",           href: "/admin/menu",           icon: BookOpen },
      { title: "Equipment",      href: "/admin/equipment",      icon: Layers },
      { title: "Onboarding",     href: "/admin/onboarding",     icon: Wand2 },
      { title: "Hire-in orders", href: "/admin/equipment/hire-orders", icon: ShoppingCart },
    ],
  },
  {
    id: "team", title: "Team Management", defaultOpen: true,
    items: [
      { title: "Full team",         href: "/admin/users",             icon: Users },
      { title: "Drivers",           href: "/admin/driver-management", icon: Truck },
      { title: "Driver Settlement", href: "/admin/driver-settlement", icon: DollarSign },
      { title: "Staff & rates",     href: "/admin/staff",             icon: Briefcase },
      { title: "Public holidays",   href: "/admin/public-holidays",   icon: Calendar },
      { title: "Wage Dashboard",    href: "/admin/wages",             icon: Wallet },
      { title: "Staff Hours",       href: "/admin/staff-hours",       icon: Clock },
    ],
  },
  {
    id: "operations", title: "Operations", defaultOpen: true,
    items: [
      { title: "Dispatch Queue",     href: "/admin/order-assignments", icon: Target },
      { title: "Live Operations",    href: "/admin/tracking",          icon: MapPin },
      { title: "Plan Routes",        href: "/admin/route-planning",    icon: Route },
      { title: "Vehicles",           href: "/admin/vehicles",          icon: Truck },
      { title: "Equipment Shortages", href: "/admin/equipment-shortages", icon: Bell },
      { title: "Regions",            href: "/admin/regions",           icon: Globe2 },
      { title: "Shopping Dashboard", href: "/admin/shopping",          icon: ShoppingBag },
      { title: "Suppliers",          href: "/admin/suppliers",         icon: Building2 },
      { title: "Tax overview",       href: "/admin/tax-purchases",     icon: FileSpreadsheet },
      { title: "Client Search",      href: "/admin/client-search",     icon: Search },
    ],
  },
  {
    id: "finance", title: "Finance", defaultOpen: false,
    items: [
      { title: "Financial Dashboard", href: "/admin/financial-dashboard", icon: TrendingUp },
    ],
  },
  {
    id: "comms", title: "Communications", defaultOpen: false,
    items: [
      { title: "Email & Integrations", href: "/admin/email-settings",      icon: Mail },
      { title: "Zapier & Webhooks",    href: "/admin/integrations",        icon: Plug },
      { title: "Lead Capture Forms",   href: "/admin/integrations/embed",  icon: Code2 },
      { title: "Messaging Templates",  href: "/admin/messaging-templates", icon: MessageSquare },
      { title: "Email Automation",     href: "/admin/email-automation-dashboard", icon: Zap },
      { title: "Notification Settings", href: "/admin/notification-settings", icon: Bell },
    ],
  },
  {
    id: "branding", title: "Branding & Settings", defaultOpen: false,
    items: [
      { title: "Company Profile", href: "/admin/company-profile", icon: Building2 },
      { title: "White Label",     href: "/admin/white-label",     icon: Palette },
      { title: "Integrations",    href: "/admin/integrations",    icon: Plug },
      { title: "System Settings", href: "/admin/settings",        icon: SettingsIcon },
    ],
  },
];

function CurrentNav() {
  return (
    <nav className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-700 px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-[0.18em] font-bold opacity-90">Current</p>
        <h2 className="text-lg font-bold mt-0.5">What ships today</h2>
        <p className="text-xs opacity-80 mt-1">
          7 sections · Core Management at 12 items · Refunds in Core, not Finance
        </p>
      </div>
      <div className="px-3 py-4 max-h-[80vh] overflow-y-auto">
        {CURRENT_SECTIONS.map((section) => (
          <CollapsibleNavSection
            key={section.id}
            title={section.title}
            defaultOpen={section.defaultOpen}
          >
            <div className="space-y-1">
              {section.items.map((item) => (
                <PreviewLink key={item.title} item={item} />
              ))}
            </div>
          </CollapsibleNavSection>
        ))}
      </div>
    </nav>
  );
}

export default function NavPreviewPage() {
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Nav restructure preview</title>
      </Head>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Admin nav -- proposed restructure
            </h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">
              Side-by-side mockup. Nothing here is wired into the live nav --
              this page is a sketch. Compare the two columns and react.
              When you sign off, Stage 1 ships the proposed structure as
              a one-shot edit to <code className="bg-slate-100 px-1 rounded">AdminNav.tsx</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CurrentNav />
            <ProposedNav />
          </div>

          {/* Legend / cheat-sheet so the visual badges are unambiguous. */}
          <div className="mt-8 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Legend</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-700">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  New
                </span>
                <span className="ml-2">Page or dashboard that doesn't exist yet -- Stage 2 build</span>
              </div>
              <div>
                <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                  Moved
                </span>
                <span className="ml-2">Existing page, just relocating in the nav -- Stage 1 ship</span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">↑ New section</span>
                <span className="ml-2">Top-level heading that's brand new</span>
              </div>
            </div>
          </div>

          {/* Decisions log -- reflects what's already locked in vs.
              what's still being shaped. Useful when Bobby comes back
              after sleep / brings Callum into the conversation. */}
          <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-emerald-900 mb-3">
              Decisions locked in (round 1)
            </h3>
            <ul className="text-sm text-emerald-900 space-y-1.5 list-disc pl-5">
              <li>Refunds stays under Core, ungated -- not moved to Financial.</li>
              <li>Drop Branding's duplicate Integrations link (kept under Communications).</li>
              <li>Fold After-Sales templates / Automation into a single "Lifecycle Emails" sub-page.</li>
              <li>Kill the "Planning Admin" section -- Client Search to Core, Job Progress to Operations, HR Solutions to Team Management.</li>
              <li>Rename "Departments" to "Teams".</li>
              <li>Suppliers moves to Stock (operator tool, not finance).</li>
              <li>Equipment becomes one hub page with internal tabs (Catalog / Availability / Shortages / Hire-in).</li>
              <li>Stock + Wages default-open (daily-use sections).</li>
              <li>Teams Hub renders all 4 team rows always.</li>
            </ul>
            <p className="text-xs text-emerald-800 mt-3">
              Look at the right column. If the new shape feels right, reply
              "ship Stage 1" and the regroup goes live behind a feature
              flag for the 24h watch window.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
