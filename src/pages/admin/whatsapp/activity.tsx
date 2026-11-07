/**
 * /admin/whatsapp/activity - everything WhatsApp has done: totals for a period,
 * a report per message, and the full sent log. All paged on the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { CheckCheck, Clock, Eye, MessageCircle, RefreshCw, Reply, Search, Send, TriangleAlert } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { WhatsAppTabs } from "@/components/admin/whatsapp/WhatsAppTabs";
import { WhatsAppFailureNotice } from "@/components/admin/whatsapp/WhatsAppFailureNotice";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PortalHeader, PortalShell, StatTile } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { ACTIVITY_PERIODS, statusLabel, type MessageSource } from "@/lib/whatsapp/activity";
import { readableWhatsAppError } from "@/lib/whatsapp/failureReason";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

interface ActivityMessage {
  id: string;
  recipient: string;
  phone: string;
  name: string;
  source: MessageSource;
  status: string;
  failureReason: string | null;
  at: string;
  orderId: string | null;
}

interface ActivityData {
  days: number;
  page: number;
  pageSize: number;
  matching: number;
  totals: Record<string, number>;
  reportReady: boolean;
  report: Array<{ name: string; sent: number; delivered: number; read: number; failed: number }>;
  messages: ActivityMessage[];
}

const STATUS_FILTERS = [
  ["", "All statuses"], ["waiting", "Waiting"], ["sent", "Sent"], ["delivered", "Delivered"],
  ["read", "Read"], ["failed", "Failed"], ["cancelled", "Cancelled"],
] as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        active ? "border-brand-primary bg-brand-primary text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}

function ActivityPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const [days, setDays] = useState(30);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const companyQuery = user?.company_id ? `companyId=${encodeURIComponent(user.company_id)}` : "";
  const baseUrl = useMemo(() => `/api/admin/whatsapp/activity${companyQuery ? `?${companyQuery}` : ""}`, [companyQuery]);

  const summaryDays = useRef<number | null>(null);
  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days), page: String(page) });
      // Totals only change with the period, so filters and paging skip them.
      if (!fresh && summaryDays.current === days) params.set("summary", "0");
      if (status) params.set("status", status);
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not load WhatsApp activity.");
      summaryDays.current = days;
      setData((current) => ({ ...current, ...json }));
      setLoadError(null);
    } catch (e) {
      setLoadError(readableWhatsAppError(e, "Could not load WhatsApp activity."));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, days, page, status, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Try again.");
      toast({ title: "Retry queued", description: "WhatsApp will try again within about 5 minutes." });
      await load(true);
    } catch (e) {
      toast({ title: "WhatsApp", description: readableWhatsAppError(e, "Try again."), variant: "destructive" });
    } finally {
      setRetrying(null);
    }
  };

  const totals = data?.totals || {};
  const matching = data?.matching || 0;
  const firstShown = data && matching > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastShown = data ? Math.min(data.page * data.pageSize, matching) : 0;
  const lastPage = data ? Math.max(1, Math.ceil(matching / data.pageSize)) : 1;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Head><title>WhatsApp activity - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            icon={MessageCircle}
            title="WhatsApp activity"
            subtitle="See what was sent, what was read, and what needs attention."
          />
          <WhatsAppTabs active="activity" />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose a period">
              {ACTIVITY_PERIODS.map((value) => (
                <Chip key={value} active={days === value} onClick={() => { setDays(value); setPage(1); }}>Last {value} days</Chip>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" disabled={loading} onClick={() => void load(true)}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh activity
              </Button>
            </div>

            {loadError && (
              <Card className="border-rose-200">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm text-rose-700">
                  <p>{loadError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>Try loading again</Button>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Waiting" icon={Clock} value={totals.waiting ?? "-"} hint="Queued; usually under 5 min" />
              <StatTile label="Sent" icon={Send} value={totals.sent ?? "-"} hint="Meta accepted; not delivered yet" />
              <StatTile label="Delivered" icon={CheckCheck} value={totals.delivered ?? "-"} hint="Reached the phone" />
              <StatTile label="Read" icon={Eye} value={totals.read ?? "-"} hint="Opened by the recipient" />
              <StatTile label="Failed" icon={TriangleAlert} value={totals.failed ?? "-"} hint="Reason and next step below" />
              <StatTile label="Replies" icon={Reply} value={totals.replies ?? "-"} hint="Incoming WhatsApp messages" />
            </div>

            <Card className="border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20">
              <CardContent className="py-4">
                <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">How to read delivery status</p>
                <p className="mt-1 text-sm leading-relaxed text-sky-900 dark:text-sky-200"><strong>Sent</strong> means Meta accepted the request. It does not confirm the recipient got it. <strong>Delivered</strong> means it reached their phone; <strong>Read</strong> means they opened it. Failed messages include Meta’s reason and a suggested next step.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5">
                <p className="pb-3 text-sm font-semibold text-slate-900 dark:text-white">By message</p>
                {data && !data.reportReady ? (
                  <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">The message breakdown is temporarily unavailable. Your message history and delivery statuses below are still available; refresh this report later.</p>
                ) : !data?.report.length ? (
                  <p className="text-xs text-slate-500">Nothing was sent in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-1.5 pr-3 font-medium">Message</th>
                          {["Sent", "Delivered", "Read", "Failed"].map((label) => <th key={label} className="py-1.5 pl-3 text-right font-medium">{label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.report.map((row) => (
                          <tr key={row.name} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{row.name}</td>
                            {[row.sent, row.delivered, row.read, row.failed].map((value, index) => (
                              <td key={index} className="py-1.5 pl-3 text-right text-slate-700 dark:text-slate-300">{value}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 py-5">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">All messages</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    aria-label="Search messages"
                    className="pl-9"
                    placeholder="Search by name, number or template"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                  {STATUS_FILTERS.map(([value, label]) => (
                    <Chip key={label} active={status === value} onClick={() => { setStatus(value); setPage(1); }}>{label}</Chip>
                  ))}
                </div>

                {loading && !data && <p className="py-6 text-center text-sm text-slate-500">Loading activity...</p>}
                {data && (
                  <div className={cn("transition-opacity", loading && "opacity-60")}>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.messages.map((message) => (
                        <li key={message.id} className="space-y-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{message.name}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {message.recipient} | {new Date(message.at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline">{message.source}</Badge>
                              <Badge variant={message.status === "failed" ? "destructive" : "secondary"}>{statusLabel(message.status)}</Badge>
                              {message.orderId && (
                                <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                                  <Link href={withSlug(`/order/${message.orderId}`)}>Open order</Link>
                                </Button>
                              )}
                              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                                <Link href={withSlug(`/admin/whatsapp/replies?phone=${encodeURIComponent(message.phone)}`)}>Open conversation</Link>
                              </Button>
                              {message.status === "failed" && (
                                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={retrying === message.id} onClick={() => void retry(message.id)}>
                                  {retrying === message.id ? "Queueing..." : "Queue retry"}
                                </Button>
                              )}
                            </span>
                          </div>
                          {message.failureReason && (message.status === "failed" || message.status === "pending" || message.status === "sending") && (
                            <WhatsAppFailureNotice reason={message.failureReason} state={message.status === "failed" ? "failed" : "retrying"} />
                          )}
                        </li>
                      ))}
                      {data.messages.length === 0 && (
                        <li className="py-6 text-center">
                          {search.trim() || status ? (
                            <>
                              <p className="text-sm text-slate-600 dark:text-slate-300">No messages match these filters.</p>
                              <Button type="button" variant="link" size="sm" className="mt-1" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}>Clear search and status filter</Button>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-slate-600 dark:text-slate-300">No WhatsApp messages in this period yet.</p>
                              <Link href={withSlug("/admin/whatsapp")} className="mt-1 inline-block text-sm font-medium text-brand-primary underline underline-offset-2">Go to setup to send a test</Link>
                            </>
                          )}
                        </li>
                      )}
                    </ul>
                    {matching > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <p className="text-xs text-slate-500">
                          Showing {firstShown.toLocaleString("en-ZA")}-{lastShown.toLocaleString("en-ZA")} of {matching.toLocaleString("en-ZA")}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous page</Button>
                          <span className="text-xs text-slate-500">Page {page} of {lastPage.toLocaleString("en-ZA")}</span>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={page >= lastPage || loading} onClick={() => setPage(page + 1)}>Next page</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </PortalShell>
        <Footer />
      </div>
    </div>
  );
}

export default function ProtectedActivityPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <ActivityPage />
    </ProtectedRoute>
  );
}
