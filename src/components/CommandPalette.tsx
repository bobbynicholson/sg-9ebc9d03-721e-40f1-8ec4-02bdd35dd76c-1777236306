import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Truck,
  ChefHat,
  Sparkles,
  Calendar,
  Package,
  FileText,
  Banknote,
  Settings,
  Globe,
  TrendingUp,
  Crown,
  Building2,
  CreditCard,
  Tag,
  Plus,
  Search,
  HelpCircle,
  LogOut,
  Clock,
  User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import { orderService } from "@/services/orderService";
import { quoteService } from "@/services/quoteService";
import { leadService } from "@/services/leadService";
import { clientManagementService } from "@/services/clientManagementService";
import { inventoryService } from "@/services/inventoryService";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void | Promise<void>;
  keywords?: string[];
  group: string;
  /** Roles that should see this entry. Empty array = everyone signed in. */
  roles?: string[];
}

interface DataResult {
  id: string;
  label: string;
  sublabel?: string;
  badge: "Order" | "Client" | "Lead" | "Quote" | "Inventory";
  href: string;
  /** Free-form haystack for the fuzzy matcher to score against. */
  haystack: string;
}

const RECENT_KEY = "cmdk:recent-searches";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  if (typeof window === "undefined" || !term.trim()) return;
  try {
    const cur = loadRecent();
    const next = [term, ...cur.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage can fail in private mode - the palette still works.
  }
}

const badgeTone: Record<DataResult["badge"], string> = {
  Order: "bg-blue-100 text-blue-700",
  Client: "bg-purple-100 text-purple-700",
  Lead: "bg-amber-100 text-amber-700",
  Quote: "bg-emerald-100 text-emerald-700",
  Inventory: "bg-slate-100 text-slate-700",
};

/**
 * Global Cmd+K / Ctrl+K command palette.
 *
 * Mounted once in _app.tsx so every authenticated page picks it up. Two
 * modes share the same input:
 *   - With no query: navigation shortcuts + recent searches.
 *   - With a query: live results from orders, clients, leads, quotes,
 *     inventory (all company-scoped via the user's company_id) AND any
 *     navigation entry that fuzzy-matches.
 *
 * Lets you jump anywhere without learning the URL structure, and lets you
 * pull up the right order / client / lead by typing two characters of their
 * name from anywhere in the app.
 */
export function CommandPalette() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [data, setData] = useState<DataResult[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
  const companySlug = (profile as any)?.company_slug || "";
  const companyId = (user as any)?.company_id || (profile as any)?.company_id || "";
  const isAuthed = !!user;

  // Cmd+K (Mac) / Ctrl+K (Win/Linux) toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // Also support "/" as a quick-open from anywhere not in a textbox.
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    // Custom event so mobile drawers (no keyboard) can trigger the palette.
    const onCustom = () => setOpen(true);
    window.addEventListener("cmdk:open", onCustom as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onCustom as EventListener);
    };
  }, []);

  // Reset state when the dialog closes so the next open is clean.
  useEffect(() => {
    if (!open) {
      setTerm("");
    } else {
      setRecent(loadRecent());
    }
  }, [open]);

  // Lazy-load company-scoped data the first time the palette is opened with
  // an authenticated session. We do not refetch on every open - a small
  // staleness is fine for a search palette and keeps Supabase quiet.
  useEffect(() => {
    if (!open || !companyId || dataLoaded || dataLoading) return;
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      try {
        const [orders, quotes, leads, clients, inventory] = await Promise.all([
          // SHAPE-A (task #97, 2026-05-24): palette only shows
          // order_number / client_name / event_date / venue_address
          // in search results. Light shape cuts the join cost on a
          // mature tenant - this dropdown fires on every Cmd-K.
          orderService.getAllOrders(companyId, { mode: "light" }).catch(() => []),
          quoteService.getQuotes(companyId, { mode: "light" }).catch(() => []),
          leadService.getLeads(companyId).catch(() => []),
          clientManagementService.getCompanyClients(companyId).catch(() => []),
          inventoryService.getInventory(companyId).catch(() => []),
        ]);
        if (cancelled) return;

        const merged: DataResult[] = [];

        // Orders - number / id, client name, venue
        (orders || []).forEach((o: any) => {
          const ref = o.order_number || (o.id ? `#${String(o.id).slice(0, 8).toUpperCase()}` : "");
          const label = `${ref || "Order"}, ${o.client_name || "Unknown client"}`;
          const sublabel = [o.venue_address, o.event_date && new Date(o.event_date).toLocaleDateString("en-ZA")]
            .filter(Boolean)
            .join(" - ");
          merged.push({
            id: `order-${o.id}`,
            label,
            sublabel,
            badge: "Order",
            href: `/order/${o.id}`,
            haystack: [ref, o.order_number, o.client_name, o.venue_address, o.event_name, o.id].filter(Boolean).join(" "),
          });
        });

        // Clients - name, email, phone
        (clients || []).forEach((c: any) => {
          const label = c.full_name || c.email || "Unnamed client";
          const sublabel = [c.email, c.phone_number].filter(Boolean).join(" - ");
          merged.push({
            id: `client-${c.id}`,
            label,
            sublabel,
            badge: "Client",
            href: `/admin/contacts?clientId=${c.id}`,
            haystack: [c.full_name, c.email, c.phone_number, c.company_name].filter(Boolean).join(" "),
          });
        });

        // Leads - name, company, email
        (leads || []).forEach((l: any) => {
          const label = l.client_name || l.client_email || "Unnamed lead";
          const sublabel = [l.client_email, l.company_name, l.event_type].filter(Boolean).join(" - ");
          merged.push({
            id: `lead-${l.id}`,
            label,
            sublabel,
            badge: "Lead",
            href: `/admin/leads`,
            haystack: [l.client_name, l.client_email, l.company_name, l.event_type, l.notes].filter(Boolean).join(" "),
          });
        });

        // Quotes - number, client, event
        (quotes || []).forEach((q: any) => {
          const ref = q.quote_number || (q.id ? `#${String(q.id).slice(0, 8).toUpperCase()}` : "");
          const label = `${ref || "Quote"}, ${q.client_name || "Unknown client"}`;
          const sublabel = [q.event_name, q.event_date && new Date(q.event_date).toLocaleDateString("en-ZA")]
            .filter(Boolean)
            .join(" - ");
          merged.push({
            id: `quote-${q.id}`,
            label,
            sublabel,
            badge: "Quote",
            href: `/admin/quotes/${q.id}`,
            haystack: [ref, q.quote_number, q.client_name, q.client_email, q.event_name, q.id].filter(Boolean).join(" "),
          });
        });

        // Inventory - item name (+ category, sku)
        (inventory || []).forEach((i: any) => {
          const label = i.item_name || i.name || "Inventory item";
          const sublabel = [i.category, i.sku].filter(Boolean).join(" - ");
          merged.push({
            id: `inv-${i.id}`,
            label,
            sublabel,
            badge: "Inventory",
            href: `/admin/inventory-tracking?itemId=${i.id}`,
            haystack: [i.item_name, i.name, i.category, i.sku, i.location].filter(Boolean).join(" "),
          });
        });

        setData(merged);
        setDataLoaded(true);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, dataLoaded, dataLoading]);

  const handleSignOut = useCallback(async () => {
    await signOutAndRedirect(profile);
  }, [profile]);

  const adminBase = companySlug ? `/${companySlug}/admin` : "/admin";

  const allItems = useMemo<PaletteItem[]>(() => [
    // ---- Common / company admin ----
    { id: "go-dashboard", label: "Go to Admin Dashboard", icon: LayoutDashboard, href: `${adminBase}/dashboard`, group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["home","main"] },
    { id: "go-orders", label: "Orders", icon: ShoppingCart, href: "/admin/orders", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-quotes", label: "Quotes", icon: FileText, href: "/admin/quotes", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-leads", label: "Leads", icon: TrendingUp, href: "/admin/leads", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-calendar", label: "Calendar", icon: Calendar, href: "/admin/calendar", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-inventory", label: "Food & Ingredients", icon: Package, href: "/admin/inventory", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["inventory","ingredients","food","stock","pantry"] },
    { id: "go-users", label: "Team / Users", icon: Users, href: "/admin/users", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-drivers", label: "Drivers (manage)", icon: Truck, href: "/admin/driver-management", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["driver","manage","add","invite"] },
    { id: "go-regions", label: "Regions", icon: Globe, href: "/admin/regions", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-financial", label: "Financial Dashboard", icon: Banknote, href: "/admin/financial-dashboard", group: "Navigate", roles: ["company_admin","owner","super_admin"] },
    { id: "go-invoices", label: "Invoices", icon: CreditCard, href: "/admin/invoices", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-dispatch", label: "Dispatch Queue", icon: Truck, href: "/admin/order-assignments", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["assign","driver","queue","dispatch"] },
    { id: "go-tracking", label: "Live Operations", icon: Truck, href: "/admin/tracking", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["track","map","live"] },
    { id: "go-route", label: "Plan Routes", icon: Truck, href: "/admin/route-planning", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["optimise","optimize","route"] },
    { id: "go-settings", label: "System Settings", icon: Settings, href: "/admin/settings", group: "Navigate", roles: ["admin","company_admin","owner"] },
    // Pages added to the sidebar in the Stage-1 nav restructure - mirror
    // them here so Cmd-K finds anything the user can see in the nav.
    { id: "go-contacts",    label: "Contacts",            icon: Users,        href: "/admin/contacts",            group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["crm","client"] },
    { id: "go-refunds",     label: "Refunds",             icon: CreditCard,   href: "/admin/refunds",             group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["refund","cancel"] },
    { id: "go-client-srch", label: "Client Search",       icon: Users,        href: "/admin/client-search",       group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["find","search","client"] },
    { id: "go-menu",        label: "Menu",                icon: FileText,     href: "/admin/menu",                group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["recipe","food","catalog"] },
    { id: "go-equipment",   label: "Equipment",           icon: Package,      href: "/admin/equipment",           group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["catalog","chair","table","chafing"] },
    // Hire-in is reachable as both /admin/equipment/hire-orders (legacy
    // bookmark) and /admin/equipment?tab=hire-in (the canonical hub).
    // We surface only the hub-tabbed entry in the palette below as a
    // Quick action - the standalone URL still resolves for old links.
    { id: "go-suppliers",   label: "Suppliers",           icon: Building2,    href: "/admin/suppliers",           group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["vendor","supplier"] },
    { id: "go-shopping",    label: "Shopping Dashboard",  icon: ShoppingCart, href: "/admin/shopping",            group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["buy","procurement","shopping"] },
    { id: "go-vehicles",    label: "Vehicles",            icon: Truck,        href: "/admin/vehicles",            group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["fleet","cold-chain"] },
    { id: "go-shortages",   label: "Equipment Shortages", icon: Package,      href: "/admin/equipment?tab=shortages", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["short","missing"] },
    // Phase 3 admin sweep: "go-job-prog" pointed at a redirect stub.
    // Dropped from the palette; orders/dispatch/tracking cover the
    // same job. See docs/personas/admin.md.
    { id: "go-tax",         label: "Tax Overview",        icon: FileText,     href: "/admin/tax-purchases",       group: "Navigate", roles: ["company_admin","owner","super_admin"], keywords: ["tax","sars","deductible"] },
    { id: "go-wages",       label: "All Wages Dashboard", icon: Banknote,   href: "/admin/wages",               group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["pay","wage","payroll"] },
    { id: "go-staff-rates", label: "Staff & Rates",       icon: Users,        href: "/admin/staff",               group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["pay","rates"] },
    { id: "go-staff-hrs",   label: "Staff Hours",         icon: Calendar,     href: "/admin/staff-hours",         group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["hours","timesheet"] },
    { id: "go-driver-set",  label: "Driver Settlement",   icon: Banknote,   href: "/admin/driver-settlement",   group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["pay","driver"] },
    { id: "go-holidays",    label: "Public Holidays",     icon: Calendar,     href: "/admin/public-holidays",     group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["holiday","bcea"] },
    { id: "go-hr",          label: "HR Solutions",        icon: Users,        href: "/admin/hr-solutions",        group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["hr","compliance"] },
    { id: "go-onboarding",  label: "Onboarding",          icon: Sparkles,     href: "/admin/onboarding",          group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["import","setup"] },
    { id: "go-email-life",  label: "Lifecycle Emails",    icon: Sparkles,     href: "/admin/email-templates",     group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["after-sales","automation","template"] },
    { id: "go-templates",   label: "Messaging Templates", icon: Sparkles,     href: "/admin/messaging-templates", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["whatsapp","email","template"] },
    { id: "go-notifs",      label: "Notification Settings", icon: Settings,   href: "/admin/notification-settings", group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["alert","push"] },
    // Stage-2 hubs and team indexes.
    { id: "go-offering",    label: "Offering Hub",        icon: Sparkles,     href: "/admin/offering",            group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["menu","equipment","catalog","what we sell"] },
    { id: "go-stock",       label: "Stock Overview",      icon: Package,      href: "/admin/stock",               group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["stock","low","pressure","ingredients"] },
    { id: "go-teams-hub",   label: "Teams Hub",           icon: Users,        href: "/admin/teams",               group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["teams","departments","monday"] },
    { id: "go-teams-kit",   label: "Kitchen Team",        icon: ChefHat,      href: "/admin/teams/kitchen",       group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["kitchen","chef","duties"] },
    { id: "go-teams-drv",   label: "Drivers Team",        icon: Truck,        href: "/admin/teams/drivers",       group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["drivers","fleet"] },
    { id: "go-teams-cln",   label: "Cleaning Team",       icon: Sparkles,     href: "/admin/teams/cleaning",      group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["cleaning","clean","damage"] },
    { id: "go-eq-tab-avl",  label: "Equipment availability", icon: Package,   href: "/admin/equipment?tab=availability", group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["available","free","date"] },
    { id: "go-eq-tab-sho",  label: "Equipment shortages",   icon: Package,    href: "/admin/equipment?tab=shortages",    group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["short","missing"] },
    { id: "go-eq-tab-hir",  label: "Hire-in equipment",     icon: ShoppingCart, href: "/admin/equipment?tab=hire-in",   group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["hire","procurement","rent"] },

    // ---- Quick actions ----
    { id: "act-new-lead", label: "Create new lead", icon: Plus, href: "/admin/leads/new", group: "Quick actions", roles: ["admin","company_admin","owner"] },
    { id: "act-new-quote", label: "Create new quote", icon: Plus, href: "/admin/quotes/new", group: "Quick actions", roles: ["admin","company_admin","owner"] },
    { id: "act-low-stock", label: "Show low-stock items", icon: Package, href: "/admin/inventory?tab=low-stock", group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["restock","stock"] },
    { id: "inv-receive", label: "Receive stock", icon: Package, href: "/admin/inventory?action=receive", group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["delivery","supplier","incoming","stock"] },
    { id: "inv-count", label: "Cycle count inventory", icon: Package, href: "/admin/inventory?action=count", group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["count","stocktake","audit"] },
    { id: "inv-writeoff", label: "Write off stock", icon: Package, href: "/admin/inventory?action=writeoff", group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["waste","spoilage","breakage","expiry"] },

    // ---- Super admin / platform ----
    { id: "p-platform", label: "Platform Dashboard", icon: Crown, href: "/admin/platform/dashboard", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-companies", label: "All Companies", icon: Building2, href: "/admin/platform/company-database", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-trials", label: "Trial Management", icon: Calendar, href: "/admin/platform/trial-management", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-subs", label: "Subscriptions", icon: CreditCard, href: "/admin/platform/subscription-management", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-pricing", label: "Pricing", icon: Tag, href: "/admin/platform/pricing-management", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-users", label: "All Users", icon: Users, href: "/admin/platform/user-management", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-cms-pages", label: "CMS Pages", icon: FileText, href: "/admin/platform/cms-pages", group: "Platform admin", roles: ["super_admin"] },
    { id: "p-cms-blog", label: "Blog", icon: FileText, href: "/admin/platform/cms-blog", group: "Platform admin", roles: ["super_admin"] },

    // ---- Team portals ----
    { id: "team-driver", label: "Driver Dashboard", icon: Truck, href: "/team-portal/driver/dashboard", group: "Team portals", roles: ["driver","admin","company_admin","owner","super_admin"] },
    { id: "team-kitchen", label: "Kitchen Dashboard", icon: ChefHat, href: "/team-portal/kitchen/dashboard", group: "Team portals", roles: ["kitchen_staff","admin","company_admin","owner","super_admin"] },
    { id: "team-shopping", label: "Shopping Dashboard", icon: ShoppingCart, href: "/team-portal/shopping/dashboard", group: "Team portals", roles: ["shopping_staff","admin","company_admin","owner","super_admin"] },
    { id: "team-cleaning", label: "Cleaning Dashboard", icon: Sparkles, href: "/team-portal/cleaning/dashboard", group: "Team portals", roles: ["cleaning_staff","admin","company_admin","owner","super_admin"] },

    // ---- Client ----
    { id: "client-dash", label: "My Events", icon: LayoutDashboard, href: "/client-portal/dashboard", group: "Client", roles: ["client"] },
    { id: "client-orders", label: "My Orders", icon: ShoppingCart, href: "/client-portal/my-orders", group: "Client", roles: ["client"] },
    { id: "client-tracking", label: "Track delivery", icon: Truck, href: "/client-portal/tracking", group: "Client", roles: ["client"] },
    { id: "client-billing", label: "Billing & invoices", icon: CreditCard, href: "/client-portal/billing", group: "Client", roles: ["client"] },

    // ---- Account (everyone) ----
    { id: "acc-profile", label: "My profile / settings", icon: Settings, href: "/account/settings", group: "Account" },
    { id: "acc-help", label: "Contact support", icon: HelpCircle, href: "/support", group: "Account" },
    { id: "acc-signout", label: "Sign out", icon: LogOut, action: handleSignOut, group: "Account", keywords: ["logout","log out","exit"] },
  ], [adminBase, handleSignOut]);

  const items = useMemo(() => {
    if (!isAuthed) return [];
    return allItems.filter((it) => !it.roles || it.roles.length === 0 || it.roles.includes(role));
  }, [allItems, isAuthed, role]);

  // Fuzzy-search the navigation items (always, with debounce 0 so the
  // dialog feels instant - the list is tiny).
  const navIndexed = useMemo(
    () => items.map((it) => ({
      ...it,
      _haystack: `${it.label} ${(it.keywords || []).join(" ")} ${it.hint || ""}`,
    })),
    [items],
  );
  const { results: navResults } = useFuzzySearch(
    navIndexed,
    term,
    [{ key: "_haystack" as any, weight: 1 }],
    { debounceMs: 0, includeAllOnEmpty: true, limit: 100 },
  );

  // Fuzzy-search the loaded company data. Debounced 150ms because there can
  // be hundreds of items and we don't want to recompute on every keystroke.
  const { results: dataResults } = useFuzzySearch(
    data,
    term,
    [
      { key: "label", weight: 2 },
      { key: "haystack", weight: 1 },
      { key: "sublabel", weight: 1 },
    ],
    { debounceMs: 150, includeAllOnEmpty: false, limit: 25 },
  );

  const groupedNav = useMemo(() => {
    const order = ["Navigate", "Quick actions", "Team portals", "Platform admin", "Client", "Account"];
    const grouped: Record<string, PaletteItem[]> = {};
    navResults.forEach((r) => {
      grouped[r.item.group] = grouped[r.item.group] || [];
      grouped[r.item.group].push(r.item);
    });
    return order.filter((g) => grouped[g]?.length).map((g) => ({ name: g, items: grouped[g] }));
  }, [navResults]);

  const groupedData = useMemo(() => {
    const order: Array<DataResult["badge"]> = ["Order", "Quote", "Lead", "Client", "Inventory"];
    const grouped: Record<string, DataResult[]> = {};
    dataResults.forEach((r) => {
      grouped[r.item.badge] = grouped[r.item.badge] || [];
      grouped[r.item.badge].push(r.item);
    });
    return order.filter((g) => grouped[g]?.length).map((g) => ({ name: g, items: grouped[g] }));
  }, [dataResults]);

  const runItem = (it: PaletteItem) => {
    setOpen(false);
    if (term.trim()) saveRecent(term.trim());
    if (it.action) {
      void it.action();
    } else if (it.href) {
      void router.push(it.href);
    }
  };

  const runData = (d: DataResult) => {
    setOpen(false);
    if (term.trim()) saveRecent(term.trim());
    void router.push(d.href);
  };

  const runRecent = (q: string) => {
    setTerm(q);
  };

  // Don't render the dialog at all when signed out.
  if (!isAuthed) return null;

  const showRecent = !term.trim() && recent.length > 0;
  const totalResults = navResults.length + dataResults.length;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} label="Global command palette">
      <CommandInput
        placeholder="Search orders, clients, leads, quotes, inventory or jump anywhere..."
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {dataLoading
            ? "Loading your company data..."
            : "Nothing matches. Try a client name, order number, venue or page name."}
        </CommandEmpty>

        {/* Recent searches (no query) */}
        {showRecent && (
          <CommandGroup heading="Recent searches">
            {recent.map((q) => (
              <CommandItem key={`recent-${q}`} value={`recent ${q}`} onSelect={() => runRecent(q)}>
                <Clock className="mr-2 h-4 w-4 text-slate-400" />
                <span>{q}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {showRecent && (groupedNav.length > 0) && <CommandSeparator />}

        {/* Live data results, only when there's a query */}
        {term.trim() && groupedData.map((g, gi) => (
          <div key={`data-${g.name}`}>
            <CommandGroup heading={`${g.name}s`}>
              {g.items.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`${d.label} ${d.haystack}`}
                  onSelect={() => runData(d)}
                >
                  <DataIcon badge={d.badge} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{d.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeTone[d.badge]}`}>
                        {d.badge}
                      </span>
                    </div>
                    {d.sublabel && (
                      <span className="text-xs text-slate-500 truncate">{d.sublabel}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {(gi < groupedData.length - 1 || groupedNav.length > 0) && <CommandSeparator />}
          </div>
        ))}

        {/* Navigation entries, always shown, top-ranked move to top when searching */}
        {groupedNav.map((g, gi) => (
          <div key={`nav-${g.name}`}>
            <CommandGroup heading={g.name}>
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <CommandItem
                    key={it.id}
                    value={`${it.label} ${(it.keywords || []).join(" ")} ${it.hint || ""}`}
                    onSelect={() => runItem(it)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-slate-500" />
                    <span>{it.label}</span>
                    {it.hint && <span className="ml-2 text-xs text-slate-400">{it.hint}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {gi < groupedNav.length - 1 && <CommandSeparator />}
          </div>
        ))}
      </CommandList>
      <div className="border-t px-3 py-2 text-[11px] text-slate-500 flex items-center gap-3">
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-slate-50 px-1.5 py-0.5 text-[10px]">↵</kbd> open
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-slate-50 px-1.5 py-0.5 text-[10px]">esc</kbd> close
        </span>
        {term.trim() && (
          <span className="text-slate-400">{totalResults} {totalResults === 1 ? "match" : "matches"}</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Search className="h-3 w-3" />
          {role || "signed in"}
        </span>
      </div>
    </CommandDialog>
  );
}

function DataIcon({ badge }: { badge: DataResult["badge"] }) {
  const cls = "mr-2 h-4 w-4 text-slate-500";
  if (badge === "Order") return <ShoppingCart className={cls} />;
  if (badge === "Client") return <User className={cls} />;
  if (badge === "Lead") return <TrendingUp className={cls} />;
  if (badge === "Quote") return <FileText className={cls} />;
  return <Package className={cls} />;
}
