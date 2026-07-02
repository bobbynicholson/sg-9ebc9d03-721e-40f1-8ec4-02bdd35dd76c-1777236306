/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RVW-A: Client reviews surface.
 *
 * Pre-audit: customers could rate orders from /client-portal/dashboard
 * (writes to delivery_feedback) and the cron-driven email prompt nudged
 * them 24h after delivery, but the catering office had NO surface to
 * read the responses back. Reviews landed in the DB and stayed there.
 *
 * This page reads delivery_feedback for the tenant, lists newest first,
 * surfaces requires_follow_up rows at the top, and tags the office
 * member who followed up. Region-scoped via the global picker.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { staffOrderHref } from "@/lib/orderUrls";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Star, AlertTriangle, RefreshCw, MessageSquareText, Search, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
  StatTile,
} from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { formatDistanceToNow } from "date-fns";

const ROUTE = "/admin/reviews";

interface ReviewRow {
  id: string;
  company_id: string;
  order_id: string;
  client_id: string;
  overall_rating: number | null;
  food_quality_rating: number | null;
  delivery_timeliness_rating: number | null;
  driver_professionalism_rating: number | null;
  comments: string | null;
  requires_follow_up: boolean | null;
  followed_up_at: string | null;
  followed_up_by: string | null;
  is_public: boolean | null;
  created_at: string | null;
  // Joined
  client?: { client_name: string | null; email: string | null } | null;
  order?: { order_number: string | null; event_name: string | null; event_date: string | null; region_id: string | null } | null;
}

function AdminReviewsInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { regionFilterId } = useRegionFilter();
  const { withSlug } = useTenantHref();

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Command-centre audit: a failed load used to fall through to the
  // "No reviews yet" empty state once the toast faded. Persist the
  // error so the page shows a recovery card with a Retry instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [follow, setFollow] = useState<"all" | "open" | "done">("all");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    setLoadError(null);
    try {
      // RVW-A: join the client (name + email) and the order (order_number,
      // event_name, event_date, region_id) so the row can be scanned at
      // a glance without N+1 follow-ups.
      const q = (supabase as any)
        .from("delivery_feedback")
        .select(
          "id, company_id, order_id, client_id, overall_rating, food_quality_rating, delivery_timeliness_rating, driver_professionalism_rating, comments, requires_follow_up, followed_up_at, followed_up_by, is_public, created_at, " +
          "client:clients!delivery_feedback_client_id_fkey(client_name, email), " +
          "order:orders!delivery_feedback_order_id_fkey(order_number, event_name, event_date, region_id)",
        )
        .eq("company_id", user.company_id)
        .order("created_at", { ascending: false })
        .limit(200);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data || []) as ReviewRow[];
      // RVW-A: region scoping done client-side off the joined order.region_id
      // because PostgREST can't filter on a joined field server-side without
      // a foreign-key embedded filter. With 200-row cap the perf hit is nil.
      if (regionFilterId) {
        rows = rows.filter((r) => r.order?.region_id === regionFilterId);
      }
      setReviews(rows);
      setLastLoadedAt(new Date());
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "loadReviews", companyId: user.company_id } });
      setLoadError(e?.message ?? "Unknown error");
      toast({ title: "Could not load reviews", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, regionFilterId, toast]);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, load]);

  // RVW-A: realtime sub on delivery_feedback so a fresh customer rating
  // appears the moment they submit it. Debounced 400ms.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.company_id) return;
    const trigger = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { load(); }, 400);
    };
    const channel = supabase
      .channel(`admin-reviews:${user.company_id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "delivery_feedback", filter: `company_id=eq.${user.company_id}` },
        trigger,
      )
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user?.company_id, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (follow === "open" && !r.requires_follow_up) return false;
      if (follow === "done" && (!r.requires_follow_up || !r.followed_up_at)) return false;
      if (!term) return true;
      const hay = [
        r.client?.client_name || "",
        r.client?.email || "",
        r.order?.order_number || "",
        r.order?.event_name || "",
        r.comments || "",
      ].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [reviews, follow, search]);

  const stats = useMemo(() => {
    const ratings = reviews.map((r) => r.overall_rating).filter((n): n is number => typeof n === "number");
    const avg = ratings.length === 0 ? 0 : ratings.reduce((s, n) => s + n, 0) / ratings.length;
    return {
      total: reviews.length,
      avg: Math.round(avg * 10) / 10,
      openFollowUps: reviews.filter((r) => r.requires_follow_up && !r.followed_up_at).length,
      promoters: ratings.filter((n) => n >= 4).length,
      detractors: ratings.filter((n) => n <= 2).length,
    };
  }, [reviews]);

  const markFollowedUp = async (id: string) => {
    if (!user?.id) return;
    setAcking(id);
    try {
      const followedUpAt = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("delivery_feedback")
        .update({
          followed_up_at: followedUpAt,
          followed_up_by: user.id,
        })
        .eq("id", id)
        // Belt-and-braces tenant scoping alongside RLS.
        .eq("company_id", user.company_id);
      if (error) throw error;
      // Update local state immediately - the realtime sub usually
      // refreshes within ~400ms, but if the channel drops the row
      // used to keep its "Needs follow-up" badge until a manual
      // reload even though the write had landed.
      setReviews((prev) => prev.map((r) =>
        r.id === id ? { ...r, followed_up_at: followedUpAt, followed_up_by: user.id } : r,
      ));
      toast({ title: "Marked followed-up" });
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "markFollowedUp", companyId: user.company_id, reviewId: id } });
      toast({ title: "Could not mark followed-up", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setAcking(null);
    }
  };

  const stars = (n: number | null | undefined) => {
    const v = Math.max(0, Math.min(5, Math.round(Number(n || 0))));
    return (
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${i <= v ? "text-brand-primary fill-brand-primary" : "text-slate-300"}`}
          />
        ))}
      </span>
    );
  };

  return (
    <>
      <Head><title>Reviews - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Reviews"
            icon={Star}
            subtitle="What clients said after their events. Ratings and comments from the post-delivery prompt, with follow-ups flagged for the office."
            meta={
              <>
                {!loading && !loadError && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {stats.total} review{stats.total === 1 ? "" : "s"}
                  </span>
                )}
                {!loading && !loadError && stats.total > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <Star className="h-3 w-3 text-white/80" />
                    {stats.avg || "-"} / 5 average
                  </span>
                )}
                {!loading && !loadError && stats.openFollowUps > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    {stats.openFollowUps} open follow-up{stats.openFollowUps === 1 ? "" : "s"}
                  </span>
                )}
              </>
            }
            actions={
            <>
              {lastLoadedAt && (
                // Hero band: muted copy must stay light-on-dark.
                <span className="text-[11px] text-white/70 tabular-nums hidden sm:inline" title={lastLoadedAt.toLocaleString("en-ZA")}>
                  As of {lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-8" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </>
            }
          />
          <PageWorkbench />

          {/* Persistent fetch-failure card with Retry - a failed load
              must not read as "No reviews yet". */}
          {loadError && !loading && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-rose-900">Couldn't load reviews</p>
              <p className="mt-0.5 text-xs text-slate-600">{loadError}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => load()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          )}

          {/* Command-centre stat row: real aggregates off the loaded
              set. Open follow-ups stays semantically rose (risk). */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile
              label="Total reviews"
              value={stats.total}
              icon={MessageSquareText}
              hint={lastLoadedAt ? `As of ${lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : undefined}
            />
            <StatTile
              label="Average rating"
              value={stats.total > 0 ? `${stats.avg || 0}/5` : "-"}
              icon={Star}
              hint={stats.total > 0 ? "Across all overall ratings" : "No ratings yet"}
            />
            <StatTile
              label="Promoters (4-5)"
              value={stats.promoters}
              icon={CheckCircle2}
              hint={stats.detractors > 0 ? `${stats.detractors} rated 2 or lower` : "No low ratings"}
            />
            <StatTile
              label="Open follow-ups"
              value={
                <span className={stats.openFollowUps > 0 ? "text-rose-600" : undefined}>
                  {stats.openFollowUps}
                </span>
              }
              icon={AlertTriangle}
              hint={stats.openFollowUps > 0 ? "Flagged by clients, not yet handled" : "All handled"}
            />
          </div>

          <Card className="mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Search by client, order, comment..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="inline-flex gap-1 p-1 bg-slate-100 rounded-lg self-start">
                <button
                  type="button"
                  onClick={() => setFollow("all")}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium ${follow === "all" ? "bg-white shadow-sm" : "text-slate-600"}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFollow("open")}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium ${follow === "open" ? "bg-white shadow-sm text-rose-700" : "text-slate-600"}`}
                >
                  Needs follow-up
                </button>
                <button
                  type="button"
                  onClick={() => setFollow("done")}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium ${follow === "done" ? "bg-white shadow-sm text-brand-primary" : "text-slate-600"}`}
                >
                  Followed up
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                // Skeleton inside the shell so the nav rail never
                // disappears while the list resolves.
                <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading reviews">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse rounded-lg border border-slate-100 p-4">
                      <div className="h-3.5 w-48 rounded bg-slate-200" />
                      <div className="mt-2 h-3 w-72 max-w-full rounded bg-slate-100" />
                      <div className="mt-3 h-3 w-32 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <MessageSquareText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium text-slate-700">
                    {reviews.length === 0
                      ? (loadError ? "Reviews unavailable right now" : "No reviews yet")
                      : "No reviews match the current filter"}
                  </p>
                  {reviews.length === 0 && !loadError && (
                    <>
                      <p className="text-xs mt-1">Clients rate orders from their portal or via the 24h post-delivery email prompt.</p>
                      <Button asChild size="sm" variant="outline" className="mt-4">
                        <Link href={withSlug("/admin/orders")}>View orders</Link>
                      </Button>
                    </>
                  )}
                  {reviews.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-4"
                      onClick={() => { setSearch(""); setFollow("all"); }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const needsFollow = !!r.requires_follow_up && !r.followed_up_at;
                    const rating = Number(r.overall_rating || 0);
                    const tone = rating >= 4 ? "bg-brand-primary/10" : rating <= 2 ? "bg-rose-50" : "";
                    return (
                      <li key={r.id} className={`p-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${needsFollow ? "bg-rose-50/60" : tone}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {stars(r.overall_rating)}
                              <span className="text-sm font-semibold text-slate-900">{r.client?.client_name || "Unknown client"}</span>
                              {r.order?.order_number && (
                                <Link
                                  href={user?.company_slug ? `/${user.company_slug}${staffOrderHref(r.order_id, "admin")}` : staffOrderHref(r.order_id, "admin")}
                                  className="inline-flex items-center gap-0.5 text-xs text-brand-primary hover:underline"
                                >
                                  {r.order.order_number}
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              )}
                              {needsFollow && (
                                <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                                  <AlertTriangle className="w-2.5 h-2.5 mr-1" />Needs follow-up
                                </Badge>
                              )}
                              {r.followed_up_at && (
                                <Badge variant="outline" className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 text-[10px]">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Followed up {formatDistanceToNow(new Date(r.followed_up_at), { addSuffix: true })}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {r.order?.event_name && <span>{r.order.event_name}</span>}
                              {r.order?.event_date && <span> · {new Date(r.order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>}
                              {r.created_at && <span> · rated {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>}
                            </div>
                            {r.comments && (
                              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap break-words bg-white border rounded p-2.5">
                                {r.comments}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-600">
                              {r.food_quality_rating != null && <span>Food {stars(r.food_quality_rating)}</span>}
                              {r.delivery_timeliness_rating != null && <span>Timeliness {stars(r.delivery_timeliness_rating)}</span>}
                              {r.driver_professionalism_rating != null && <span>Driver {stars(r.driver_professionalism_rating)}</span>}
                            </div>
                          </div>
                          {needsFollow && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markFollowedUp(r.id)}
                              disabled={acking === r.id}
                              className="border-rose-300 text-rose-800 hover:bg-rose-50"
                            >
                              {acking === r.id ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Saving</> : <><CheckCircle2 className="w-3 h-3 mr-1" />Mark followed up</>}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </PortalShell>
      </div>
    </>
  );
}

// Command-centre audit (2026-07-02): this page shipped with NO
// ProtectedRoute wrapper at all - any authenticated role that guessed
// the URL could read every client review (names, emails, complaints).
// Baseline admin tier only; no region/sales admission was ever
// deliberately granted here.
export default function AdminReviewsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AdminReviewsInner />
    </ProtectedRoute>
  );
}
