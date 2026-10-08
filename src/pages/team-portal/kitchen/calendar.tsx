import { useEffect, useMemo, useState } from "react";
import { formatClock } from "@/lib/portalTime";
import { useRouter } from "next/router";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, ExternalLink, Loader2, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { KitchenPageShell } from "@/components/kitchen/KitchenPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import { staffOrderHref } from "@/lib/orderUrls";
import { orderDisplayName } from "@/lib/orderDisplayName";

type ViewMode = "week" | "month";
type CalendarOrder = {
  id: string;
  order_number: string | null;
  event_name: string | null;
  client_name: string | null;
  event_date: string;
  event_time: string | null;
  pickup_time: string | null;
  guest_count: number | null;
  status: string;
  venue_address: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localDate = (value: string) => new Date(`${value}T00:00:00`);
const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const startOfWeek = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - (day === 0 ? 6 : day - 1));
  next.setHours(0, 0, 0, 0);
  return next;
};
const statusClass = (status: string) => {
  if (status === "preparing") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "in_transit") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

function KitchenCalendarInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { regionFilterId } = useRegionFilter();
  const { withSlug } = useTenantHref();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<ViewMode>("month");
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(iso(today));
  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const requested = router.query.view === "week" ? "week" : "month";
    setView(requested);
  }, [router.isReady, router.query.view]);

  const range = useMemo(() => {
    if (view === "month") {
      const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const start = startOfWeek(first);
      return { start, end: addDays(start, 41) };
    }
    const start = startOfWeek(anchorDate);
    return { start, end: addDays(start, 6) };
  }, [anchorDate, view]);

  const days = useMemo(
    () => Array.from({ length: view === "month" ? 42 : 7 }, (_, index) => addDays(range.start, index)),
    [range.start, view],
  );
  const ordersByDate = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    orders.forEach((order) => map.set(order.event_date, [...(map.get(order.event_date) || []), order]));
    return map;
  }, [orders]);
  const selectedOrders = ordersByDate.get(selectedDate) || [];
  const monthOrders = useMemo(
    () => orders.filter((order) => {
      const date = localDate(order.event_date);
      return date.getMonth() === anchorDate.getMonth() && date.getFullYear() === anchorDate.getFullYear();
    }),
    [orders, anchorDate],
  );
  const monthGuests = monthOrders.reduce((sum, order) => sum + Number(order.guest_count || 0), 0);
  const bookedDays = new Set(monthOrders.map((order) => order.event_date)).size;

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("orders")
        .select("id,order_number,event_name,client_name,event_date,event_time,pickup_time,guest_count,status,venue_address")
        .eq("company_id", user.company_id)
        .in("status", ["confirmed", "preparing", "ready", "in_transit"])
        .gte("event_date", iso(range.start))
        .lte("event_date", iso(range.end))
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true });
      if (regionFilterId) query = query.eq("region_id", regionFilterId);
      const { data, error: loadError } = await query;
      if (loadError) throw loadError;
      setOrders((data || []) as CalendarOrder[]);
    } catch (e: any) {
      setError(e?.message || "We couldn't load the kitchen calendar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [user?.company_id, regionFilterId, range.start.getTime(), range.end.getTime()]);

  const move = (amount: number) => {
    const next = new Date(anchorDate);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount * 7);
    setAnchorDate(next);
    setSelectedDate(iso(view === "month" ? new Date(next.getFullYear(), next.getMonth(), 1) : startOfWeek(next)));
  };
  const jumpToday = () => {
    setAnchorDate(new Date());
    setSelectedDate(iso(today));
    setIsPlannerOpen(false);
  };
  const heading = view === "month"
    ? anchorDate.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
    : `${range.start.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} – ${range.end.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <KitchenPageShell
      pageTitle="Kitchen calendar - CateringMS"
      heading="Kitchen calendar"
      subheading="A kitchen-only planning board for service dates, prep timing, guests and order handoffs."
      icon={CalendarDays}
      width="wide"
      headerAction={<Button variant="outline" onClick={jumpToday} className="gap-1.5"><CalendarDays className="h-4 w-4" /> Today</Button>}
    >
      {isPlannerOpen && <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-sm font-semibold text-brand-primary"><CalendarDays className="h-4 w-4" /> Month view</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => move(-1)} aria-label="Previous period"><ChevronLeft className="h-4 w-4" /></Button>
          <p className="min-w-[180px] text-center text-sm font-bold text-slate-900 dark:text-white">{heading}</p>
          <Button variant="outline" size="sm" onClick={() => move(1)} aria-label="Next period"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>}

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button className="ml-2 font-semibold underline" onClick={() => void load()}>Retry</button></div>}

      <div className="flex flex-col">
      <PortalCard className="order-2 overflow-hidden">
        <PortalCardHeader
          title={<span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-primary" />{view === "week" ? "Week at a glance" : "Month at a glance"}</span>}
          action={<Button variant={isPlannerOpen ? "outline" : "default"} size="sm" onClick={() => setIsPlannerOpen((open) => !open)} className="gap-1.5">{isPlannerOpen ? "Close calendar" : "Open full calendar"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${isPlannerOpen ? "rotate-180" : ""}`} /></Button>}
        />
        {isPlannerOpen ? <>
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-2xl font-bold tabular-nums text-brand-primary">{monthOrders.length}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Month events</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{monthGuests}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Guests</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{bookedDays}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Booked days</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{orders.filter((order) => order.status === "preparing").length}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">In prep now</p></div>
          </div>
          <div className="grid grid-cols-7 gap-2 border-b border-slate-100 px-4 pb-2 pt-4 dark:border-slate-800">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">{day}</span>)}
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-7">
          {days.map((day) => {
            const dayIso = iso(day);
            const dayOrders = ordersByDate.get(dayIso) || [];
            const isToday = dayIso === iso(today);
            const selected = dayIso === selectedDate;
            const isCurrentMonth = day.getMonth() === anchorDate.getMonth() && day.getFullYear() === anchorDate.getFullYear();
            return (
              <button key={dayIso} type="button" onClick={() => { setSelectedDate(dayIso); setIsPlannerOpen(true); }} className={`min-h-[112px] rounded-xl border p-3 text-left transition ${selected ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary/20" : isCurrentMonth ? "border-slate-200 bg-white hover:border-brand-primary/40 dark:border-slate-700 dark:bg-slate-900" : "border-slate-100 bg-slate-50/70 text-slate-400 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40"}`}>
                <div className="flex items-start justify-between gap-2"><span className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-brand-primary" : "text-slate-500"}`}>{isToday ? "Today" : day.toLocaleDateString("en-ZA", { weekday: "short" })}</span><span className="text-xs font-semibold text-slate-500">{day.getDate()} {day.toLocaleDateString("en-ZA", { month: "short" })}</span></div>
                <p className={`mt-4 text-2xl font-bold tabular-nums ${isCurrentMonth ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{dayOrders.length}</p>
                <p className="text-[11px] text-slate-500">event{dayOrders.length === 1 ? "" : "s"} · {dayOrders.reduce((sum, order) => sum + Number(order.guest_count || 0), 0)} guests</p>
                {dayOrders.length > 0 && <div className="mt-2 flex gap-1">{dayOrders.slice(0, 4).map((order) => <span key={order.id} className={`h-1.5 flex-1 rounded-full ${order.status === "ready" ? "bg-emerald-400" : order.status === "preparing" ? "bg-amber-400" : "bg-brand-primary"}`} />)}</div>}
              </button>
            );
          })}
          </div>
        </> : <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"><span>Full month planning is collapsed. Today&apos;s details are shown above.</span><span className="text-xs font-semibold text-slate-500">Open when needed</span></div>}
      </PortalCard>

      <PortalCard className="order-1 mb-5">
        <PortalCardHeader title={<span>{selectedDate === iso(today) ? "Today’s kitchen orders" : `Orders for ${localDate(selectedDate).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}`}</span>} action={<Badge variant="outline">{selectedOrders.length} event{selectedOrders.length === 1 ? "" : "s"}</Badge>} />
        {loading ? <div className="flex items-center justify-center p-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading calendar...</div> : selectedOrders.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No confirmed kitchen events on this day.</div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{selectedOrders.map((order) => <div key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-white">{orderDisplayName({ event_name: order.event_name || "Event", client_name: order.client_name, order_number: order.order_number || undefined })}</p><Badge variant="outline" className={`text-[10px] capitalize ${statusClass(order.status)}`}>{order.status.replace(/_/g, " ")}</Badge></div><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Eat {formatClock(order.event_time) || "TBC"}</span><span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{order.guest_count ?? "?"} guests</span>{order.pickup_time && <span>Collect {formatClock(order.pickup_time)}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{order.venue_address || "Venue not set"}</p></div><Link href={withSlug(staffOrderHref(order.id, "kitchen_staff"))} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-3 text-sm font-semibold text-white hover:opacity-90">Open order <ExternalLink className="h-3.5 w-3.5" /></Link></div>)}</div>}
      </PortalCard>
      </div>
    </KitchenPageShell>
  );
}

export default function KitchenCalendarPage() {
  return <ProtectedRoute allowedRoles={[UserRole.KITCHEN_MANAGER, UserRole.KITCHEN_STAFF, UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.REGION_ADMIN, UserRole.SUPER_ADMIN]}><KitchenCalendarInner /></ProtectedRoute>;
}
