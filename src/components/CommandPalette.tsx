import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
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
  DollarSign,
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";

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

/**
 * Global Cmd+K / Ctrl+K command palette.
 * Mounted once in _app.tsx so every authenticated page picks it up.
 * Lets you jump anywhere without learning the URL structure.
 */
export function CommandPalette() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [open, setOpen] = useState(false);

  const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
  const companySlug = (profile as any)?.company_slug || "";
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
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    await signOutAndRedirect(profile);
  };

  const adminBase = companySlug ? `/${companySlug}/admin` : "/admin";

  const allItems = useMemo<PaletteItem[]>(() => [
    // ---- Common / company admin ----
    { id: "go-dashboard", label: "Go to Admin Dashboard", icon: LayoutDashboard, href: `${adminBase}/dashboard`, group: "Navigate", roles: ["admin","company_admin","owner"], keywords: ["home","main"] },
    { id: "go-orders", label: "Orders", icon: ShoppingCart, href: "/admin/orders", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-quotes", label: "Quotes", icon: FileText, href: "/admin/quotes", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-leads", label: "Leads", icon: TrendingUp, href: "/admin/leads", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-calendar", label: "Calendar", icon: Calendar, href: "/admin/calendar", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-inventory", label: "Inventory", icon: Package, href: "/admin/inventory", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-users", label: "Team / Users", icon: Users, href: "/admin/users", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-drivers", label: "Drivers", icon: Truck, href: "/admin/driver-management", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-regions", label: "Regions", icon: Globe, href: "/admin/regions", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-financial", label: "Financial Dashboard", icon: DollarSign, href: "/admin/financial-dashboard", group: "Navigate", roles: ["company_admin","owner","super_admin"] },
    { id: "go-invoices", label: "Invoices", icon: CreditCard, href: "/admin/invoices", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-tracking", label: "Live Delivery Tracking", icon: Truck, href: "/admin/tracking", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-route", label: "Route Planning", icon: Truck, href: "/admin/route-planning", group: "Navigate", roles: ["admin","company_admin","owner"] },
    { id: "go-settings", label: "System Settings", icon: Settings, href: "/admin/settings", group: "Navigate", roles: ["admin","company_admin","owner"] },

    // ---- Quick actions ----
    { id: "act-new-lead", label: "Create new lead", icon: Plus, href: "/admin/leads/new", group: "Quick actions", roles: ["admin","company_admin","owner"] },
    { id: "act-new-quote", label: "Create new quote", icon: Plus, href: "/admin/quotes/new", group: "Quick actions", roles: ["admin","company_admin","owner"] },
    { id: "act-low-stock", label: "Show low-stock items", icon: Package, href: "/admin/inventory?tab=low-stock", group: "Quick actions", roles: ["admin","company_admin","owner"], keywords: ["restock","stock"] },

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
  ], [adminBase]);

  const items = useMemo(() => {
    if (!isAuthed) return [];
    return allItems.filter((it) => !it.roles || it.roles.length === 0 || it.roles.includes(role));
  }, [allItems, isAuthed, role]);

  const groups = useMemo(() => {
    const order = ["Navigate", "Quick actions", "Team portals", "Platform admin", "Client", "Account"];
    const grouped: Record<string, PaletteItem[]> = {};
    items.forEach((it) => {
      grouped[it.group] = grouped[it.group] || [];
      grouped[it.group].push(it);
    });
    return order.filter((g) => grouped[g]?.length).map((g) => ({ name: g, items: grouped[g] }));
  }, [items]);

  const runItem = (it: PaletteItem) => {
    setOpen(false);
    if (it.action) {
      void it.action();
    } else if (it.href) {
      void router.push(it.href);
    }
  };

  // Don't render the dialog at all when signed out.
  if (!isAuthed) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a page or command... (Cmd K / Ctrl K)" />
      <CommandList>
        <CommandEmpty>No matches. Try &ldquo;orders&rdquo;, &ldquo;invoice&rdquo;, &ldquo;sign out&rdquo;...</CommandEmpty>
        {groups.map((g, gi) => (
          <div key={g.name}>
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
            {gi < groups.length - 1 && <CommandSeparator />}
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
        <span className="ml-auto flex items-center gap-1">
          <Search className="h-3 w-3" />
          {role || "signed in"}
        </span>
      </div>
    </CommandDialog>
  );
}
