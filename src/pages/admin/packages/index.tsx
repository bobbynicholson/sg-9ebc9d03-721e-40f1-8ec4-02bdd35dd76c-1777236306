/**
 * /admin/packages - Wave 70.45b
 *
 * List of booking packages for the current tenant. A package is the
 * parent container that groups multiple orders into one logical
 * multi-day event (wedding setup Fri + function Sat + strike Sun =
 * one package, three orders).
 *
 * Operator flow:
 *   1. Click "New package" - creates a draft package + opens detail.
 *   2. From detail, link existing orders OR build orders within the
 *      package context.
 *   3. Package promotes draft -> active automatically on first link.
 *   4. "Cancel package" cascades cancelOrder to every linked order.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/formatters";
import { Calendar as CalendarIcon, Layers, MapPin, Plus, ArrowRight, ChefHat } from "lucide-react";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";

type BookingPackageStatus = "draft" | "active" | "completed" | "cancelled";

interface BookingPackage {
  id: string;
  company_id: string;
  name: string;
  primary_client_id: string | null;
  status: BookingPackageStatus;
  notes: string | null;
  venue_summary: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

const STATUS_TONE: Record<BookingPackageStatus, string> = {
  draft:     "bg-slate-100 text-slate-700 border-slate-200",
  active:    "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function ProtectedPackagesPage() {
  return (
    // PKG-A (packages audit, PKG-7): sales_admin builds packages
    // (wedding sales reps); region_admin sees their region.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <PackagesPage />
    </ProtectedRoute>
  );
}

function PackagesPage() {
  const router = useRouter();
  const { withSlug: tenantHref } = useTenantHref();
  const { toast } = useToast();
  const { user } = useAuth();

  const [packages, setPackages] = useState<BookingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | BookingPackageStatus>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", venue_summary: "", starts_at: "", ends_at: "", notes: "" });
  // PKG-B (packages audit, PKG-4): one-shot guard so the smart default-
  // tab logic only fires on the first successful load. After that the
  // operator's manual tab choice is sacred.
  const tabAutoSetRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/booking-packages");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load");
      setPackages(data.packages || []);
    } catch (err: any) {
      toast({ title: "Couldn't load packages", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // PKG-B (packages audit, PKG-8): realtime channel on booking_packages
  // scoped to the caller's company. Pre-PKG-B the list never refreshed
  // automatically, so two admins working in parallel couldn't see each
  // other's new packages without a hard refresh. Matches the pattern
  // already shipped on /admin/orders, /admin/leads, /admin/quotes.
  useEffect(() => {
    const companyId = (user as any)?.company_id;
    if (!companyId) return;
    const channelKey = `admin-packages-realtime:${companyId}`;
    const channel = (supabase as any)
      .channel(channelKey)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_packages", filter: `company_id=eq.${companyId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [(user as any)?.company_id]);

  const filtered = useMemo(() => {
    if (tab === "all") return packages;
    return packages.filter((p) => p.status === tab);
  }, [packages, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: packages.length, draft: 0, active: 0, completed: 0, cancelled: 0 };
    packages.forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [packages]);

  // PKG-B (packages audit, PKG-4): smart default tab. Pre-PKG-B the page
  // hardcoded `active` on first mount, so a tenant whose only package is
  // a draft landed on an empty Card with the existing record one click
  // away on the Draft tab. Now: on first load with data, pick the first
  // non-empty tab in priority order (active beats draft beats completed
  // beats cancelled beats all). The ref above keeps subsequent loads
  // (e.g. realtime refetches) from clobbering the operator's tab choice.
  useEffect(() => {
    if (loading) return;
    if (tabAutoSetRef.current) return;
    if (packages.length === 0) return;
    tabAutoSetRef.current = true;
    const order: Array<"active" | "draft" | "completed" | "cancelled"> = ["active", "draft", "completed", "cancelled"];
    const firstNonEmpty = order.find((t) => (counts[t] || 0) > 0);
    if (firstNonEmpty && firstNonEmpty !== tab) {
      setTab(firstNonEmpty);
    }
  }, [loading, packages.length, counts, tab]);

  const submitCreate = async () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give the package a label, e.g. 'Smith Wedding'.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/booking-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          venue_summary: form.venue_summary.trim() || null,
          starts_at: form.starts_at || null,
          ends_at: form.ends_at || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Create failed");
      toast({ title: "Package created", description: name });
      setCreateOpen(false);
      setForm({ name: "", venue_summary: "", starts_at: "", ends_at: "", notes: "" });
      // Jump straight to detail so the operator can start linking orders.
      router.push(tenantHref(`/admin/packages/${data.package.id}`));
    } catch (err: any) {
      toast({ title: "Couldn't create package", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head><title>Booking packages - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Booking packages"
            icon={Layers}
            subtitle="Group multi-day events into one logical booking. Track every order against the parent record and cancel them in one action when the booking falls through."
            actions={
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-1.5" />
                    New package
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New booking package</DialogTitle>
                    <DialogDescription>
                      Create the parent record. You can link orders on the
                      next screen.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="pkg-name">Name</Label>
                      <Input
                        id="pkg-name"
                        placeholder="e.g. Smith Wedding"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="pkg-venue">Venue (optional)</Label>
                      <Input
                        id="pkg-venue"
                        placeholder="e.g. Boschendal Estate"
                        value={form.venue_summary}
                        onChange={(e) => setForm({ ...form, venue_summary: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="pkg-start">Starts</Label>
                        <Input
                          id="pkg-start"
                          type="date"
                          value={form.starts_at}
                          onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="pkg-end">Ends</Label>
                        <Input
                          id="pkg-end"
                          type="date"
                          value={form.ends_at}
                          onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="pkg-notes">Internal notes (optional)</Label>
                      <Textarea
                        id="pkg-notes"
                        placeholder="Shared notes that apply to every event in this package."
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
                    <Button onClick={submitCreate} disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
          />
          <PageWorkbench />

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="active">Active <span className="ml-1.5 text-xs text-slate-500">{counts.active || 0}</span></TabsTrigger>
              <TabsTrigger value="draft">Draft <span className="ml-1.5 text-xs text-slate-500">{counts.draft || 0}</span></TabsTrigger>
              <TabsTrigger value="completed">Completed <span className="ml-1.5 text-xs text-slate-500">{counts.completed || 0}</span></TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled <span className="ml-1.5 text-xs text-slate-500">{counts.cancelled || 0}</span></TabsTrigger>
              <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-slate-500">{counts.all || 0}</span></TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <Card><CardContent className="py-10 text-center text-sm text-slate-500">Loading packages...</CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-600">
                  No {tab === "all" ? "" : tab} packages yet.
                </p>
                {tab !== "cancelled" && (
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Packages are useful when one event spans multiple
                    days or multiple orders - weddings, conferences,
                    multi-stop catering runs.
                  </p>
                )}
                {/* PKG-B (packages audit, PKG-5): empty-state CTA.
                    Pre-PKG-B the operator landing on a tenant with no
                    packages had to scroll their eyes to the top-right
                    "New package" button. Standard empty-state pattern
                    across the rest of the admin pages puts the create
                    action inline. */}
                {tab !== "cancelled" && tab !== "completed" && (
                  <div className="mt-4">
                    <Button onClick={() => setCreateOpen(true)} size="sm">
                      <Plus className="w-4 h-4 mr-1.5" />
                      Create your first package
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((pkg) => (
                <Link key={pkg.id} href={tenantHref(`/admin/packages/${pkg.id}`)}>
                  <Card className="hover:border-slate-300 hover:shadow-sm transition cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base truncate">{pkg.name}</CardTitle>
                        <Badge variant="outline" className={`${STATUS_TONE[pkg.status]} text-[10px] capitalize`}>
                          {pkg.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-1.5 text-xs text-slate-600">
                      {(pkg.starts_at || pkg.ends_at) && (
                        <div className="flex items-center gap-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {pkg.starts_at ? formatDate(pkg.starts_at) : "-"}
                            {pkg.ends_at && pkg.ends_at !== pkg.starts_at && (
                              <> &nbsp;→&nbsp; {formatDate(pkg.ends_at)}</>
                            )}
                          </span>
                        </div>
                      )}
                      {pkg.venue_summary && (
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate">{pkg.venue_summary}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-end pt-1">
                        <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </PortalShell>
      </div>
    </>
  );
}
