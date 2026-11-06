/** Moves between the three WhatsApp pages. */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "setup", label: "Set up", href: "/admin/whatsapp" },
  { key: "replies", label: "Replies", href: "/admin/whatsapp/replies" },
  { key: "activity", label: "Activity", href: "/admin/whatsapp/activity" },
] as const;

export function WhatsAppTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  const { withSlug } = useTenantHref();
  return (
    <nav aria-label="WhatsApp pages" className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={withSlug(tab.href)}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors",
            active === tab.key
              ? "bg-brand-primary text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
