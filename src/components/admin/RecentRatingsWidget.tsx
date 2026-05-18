/**
 * RecentRatingsWidget - the last few orders an admin star-rated,
 * plus the 30-day average across all ratings captured.
 *
 * Phase 19 #10. Closes the loop on the Phase 18 #10 quick-rating
 * capture in the order drawer. Ops can stamp 1-5 stars on each
 * event after it lands, but until now there was no surface to see
 * the result - the ratings just lived in audit_logs.
 *
 * Reads audit_logs where action='order_rating_set' and rolls up
 * the latest rating per order (so re-rating an event doesn't double
 * count). Self-hides until at least one rating exists.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Star, ArrowRight } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface RatingRow {
  entity_id: string;
  rating: number;
  created_at: string;
  order_number: string | null;
  author_name: string | null;
}

const fmtAgo = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
};

export function RecentRatingsWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        // Last 30 days of order ratings. Order desc so the per-order
        // dedup below keeps the latest rating per order (re-ratings
        // overwrite older ones in the rollup).
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data, error } = await (supabase as any)
          .from("audit_logs")
          .select("entity_id, details, created_at")
          .eq("company_id", companyId)
          .eq("entity_type", "order")
          .eq("action", "order_rating_set")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) {
          console.error("[RecentRatingsWidget] audit_logs fetch failed:", error);
        }
        const list = (data || []) as any[];
        const seen = new Set<string>();
        const latest: RatingRow[] = [];
        for (const r of list) {
          const id = String(r.entity_id);
          if (seen.has(id)) continue;
          seen.add(id);
          const n = Number(r.details?.rating);
          if (!Number.isFinite(n) || n < 1 || n > 5) continue;
          latest.push({
            entity_id: id,
            rating: n,
            created_at: r.created_at,
            order_number: r.details?.order_number || null,
            author_name: r.details?.author_name || null,
          });
        }
        if (cancelled) return;
        setRows(latest.slice(0, 5));
        if (latest.length > 0) {
          const a = latest.reduce((s, x) => s + x.rating, 0) / latest.length;
          setAvg(Math.round(a * 10) / 10);
        } else {
          setAvg(null);
        }
      } catch {
        if (!cancelled) { setRows([]); setAvg(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-yellow-200 bg-yellow-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              Recent event ratings
              {avg != null && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-800 text-xs px-2 py-0.5">
                  <span className="font-semibold">{avg.toFixed(1)}</span>
                  <span className="opacity-70">avg / 5</span>
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Star ratings captured in the order drawer over the last 30 days. Latest per order.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/orders")} className="text-xs text-yellow-700 hover:underline inline-flex items-center">
            Open orders <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-yellow-100">
            {rows.map((r) => (
              // Phase 23 #2: full-row link to /admin/orders so a
              // single click off any rated order opens it for re-
              // rating or post-mortem.
              <li key={r.entity_id}>
                <Link
                  href={withSlug(`/admin/orders?orderId=${r.entity_id}`)}
                  className="py-2 flex items-center gap-3 hover:bg-yellow-50/60 rounded transition"
                >
                  <div className="shrink-0 flex items-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-3.5 h-3.5 ${n <= r.rating ? "fill-yellow-500 text-yellow-500" : "text-yellow-300"}`}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {r.order_number || "Order"}
                      {r.author_name && (
                        <span className="ml-2 text-[11px] font-normal text-slate-500">
                          by {r.author_name}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">{fmtAgo(r.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
