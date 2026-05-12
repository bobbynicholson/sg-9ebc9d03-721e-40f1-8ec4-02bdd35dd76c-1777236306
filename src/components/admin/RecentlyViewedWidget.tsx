/**
 * RecentlyViewedWidget -- last 5 entities the operator opened
 * across orders / quotes / contacts.
 *
 * Phase 17 #8. The dashboard is the entry point but operators
 * jump between deep pages all day. This widget surfaces the
 * trail back so the operator doesn't have to remember which
 * order they were just on.
 *
 * Reads from localStorage. Pages that want to be tracked call
 * `trackRecentlyViewed({ id, type, label })` on mount; the
 * helper is exported alongside the component.
 *
 * Self-hides until at least one entity is tracked.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, ShoppingCart, FileText, Users, X } from "lucide-react";

export interface RecentlyViewedItem {
  id: string;
  type: "order" | "quote" | "contact" | "invoice";
  label: string;
  href: string;
  viewedAt: string; // ISO
}

const STORAGE_KEY = "cateringms.adminRecentlyViewed.v1";
const MAX_ITEMS = 5;

/**
 * Append (or move-to-front) an item in the recently-viewed list.
 * Safe to call from any client-side surface; SSR fallthroughs are
 * silent.
 */
export function trackRecentlyViewed(item: Omit<RecentlyViewedItem, "viewedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: RecentlyViewedItem[] = raw ? JSON.parse(raw) : [];
    const next = [
      { ...item, viewedAt: new Date().toISOString() },
      ...list.filter((x) => !(x.id === item.id && x.type === item.type)),
    ].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* storage blocked or quota exceeded -- harmless */ }
}

const ICON: Record<RecentlyViewedItem["type"], any> = {
  order: ShoppingCart,
  quote: FileText,
  contact: Users,
  invoice: FileText,
};

const TONE: Record<RecentlyViewedItem["type"], string> = {
  order:   "bg-blue-50 text-blue-700 border-blue-200",
  quote:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  contact: "bg-purple-50 text-purple-700 border-purple-200",
  invoice: "bg-amber-50 text-amber-700 border-amber-200",
};

const fmtRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function RecentlyViewedWidget() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as RecentlyViewedItem[]);
    } catch { /* ignore */ }
  }, []);

  // Phase 22 #7: per-row dismiss + clear-all. Local-only privacy
  // for shared workstations and end-of-day cleanup.
  const removeOne = (type: RecentlyViewedItem["type"], id: string) => {
    const next = items.filter((x) => !(x.type === type && x.id === id));
    setItems(next);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch { /* ignore */ }
  };
  const clearAll = () => {
    setItems([]);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore */ }
  };

  if (items.length === 0) return null;

  return (
    <Card className="mb-6 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4 text-slate-600" />
              Recently viewed
            </CardTitle>
            <CardDescription className="text-xs">
              The last 5 entities you opened. Click to jump back.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-slate-500 hover:text-rose-700 hover:underline"
            title="Clear the recently-viewed list on this browser"
          >
            Clear all
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-100">
          {items.map((i) => {
            const Icon = ICON[i.type] || FileText;
            return (
              <li key={`${i.type}-${i.id}`} className="py-2 group/row">
                <div className="flex items-center gap-3">
                  <Link href={i.href} className="flex items-center gap-3 flex-1 min-w-0 group">
                    <Badge variant="outline" className={`shrink-0 text-[10px] capitalize ${TONE[i.type]}`}>
                      <Icon className="w-3 h-3 mr-1" />
                      {i.type}
                    </Badge>
                    <span className="flex-1 text-sm text-slate-900 group-hover:underline truncate">{i.label}</span>
                    <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{fmtRelative(i.viewedAt)}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeOne(i.type, i.id)}
                    className="opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-rose-600 transition"
                    title="Remove this from the list"
                    aria-label={`Remove ${i.label} from recently viewed`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
