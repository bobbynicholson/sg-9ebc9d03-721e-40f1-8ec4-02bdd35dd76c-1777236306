/**
 * /admin/packages/[id] - Wave 70.45b
 *
 * Detail view for a booking package. Shows package metadata, the
 * timeline of linked orders, and the actions panel (edit metadata,
 * link/unlink orders, cancel package).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useMemo } from "react";
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
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/formatters";
import { onOrderUpdated } from "@/lib/events/orderEvents";
import { Calendar as CalendarIcon, MapPin, ArrowLeft, Layers, Plus, X, Trash2, AlertTriangle, Edit3, Save, Link as LinkIcon } from "lucide-react";

type BookingPackageStatus = "draft" | "active" | "completed" | "cancelled";

interface BookingPackageWithOrders {
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
  orders: Array<{
    id: string;
    order_number: string | null;
    event_name: string | null;
    event_date: string | null;
    event_time: string | null;
    status: string | null;
    guest_count: number | null;
    total_amount: number | null;
  }>;
}

const STATUS_TONE: Record<BookingPackageStatus, string> = {
  draft:     "bg-slate-100 text-slate-700 border-slate-200",
  active:    "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function ProtectedPackageDetailPage() {
  return (
    // PKG-A (PKG-7): same role set as the list.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <PackageDetailPage />
    </ProtectedRoute>
  );
}

function PackageDetailPage() {
  const router = useRouter();
  const { withSlug: tenantHref } = useTenantHref();
  const { toast } = useToast();
  const packageId = String(router.query.id || "");

  const [pkg, setPkg] = useState<BookingPackageWithOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  // PKG-B (packages audit, PKG-2): searchable order picker replaces
  // the UUID paste field. State: free-text query, fetched results,
  // loading flag, the picked order (id only - the API row provides
  // the labels for the confirm row).
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<Array<{
    id: string; order_number: string | null; client_name: string | null;
    event_name: string | null; event_date: string | null; event_time: string | null;
    guest_count: number | null; total_amount: number | null; status: string | null;
  }>>([]);
  const [linkResultsLoading, setLinkResultsLoading] = useState(false);
  const [pickedOrderId, setPickedOrderId] = useState<string | null>(null);
  const linkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [linking, setLinking] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Edit form state - only initialised when entering edit mode so the
  // user-typed values aren't clobbered by a fetch refresh.
  const [editForm, setEditForm] = useState({ name: "", venue_summary: "", starts_at: "", ends_at: "", notes: "" });

  const load = async () => {
    if (!packageId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/booking-packages/${packageId}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load");
      setPkg(data.package);
    } catch (err: any) {
      toast({ title: "Couldn't load package", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [packageId]);

  // PKG-A (PKG-6): refetch on cateringms:order-updated so an order
  // edit on /admin/orders / /admin/dispatch refreshes the package's
  // timeline + totals without a manual reload. Window focus also
  // refetches in case the event-emit path was missed.
  useEffect(() => {
    if (!packageId) return;
    const off = onOrderUpdated(() => { void load(); });
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { off(); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId]);

  const totalGuests = useMemo(() => (pkg?.orders || []).reduce((s, o) => s + (o.guest_count || 0), 0), [pkg]);
  const totalRevenue = useMemo(() => (pkg?.orders || []).reduce((s, o) => s + (Number(o.total_amount) || 0), 0), [pkg]);

  const enterEdit = () => {
    if (!pkg) return;
    setEditForm({
      name: pkg.name,
      venue_summary: pkg.venue_summary || "",
      starts_at: pkg.starts_at || "",
      ends_at: pkg.ends_at || "",
      notes: pkg.notes || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!pkg) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/booking-packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          venue_summary: editForm.venue_summary.trim() || null,
          starts_at: editForm.starts_at || null,
          ends_at: editForm.ends_at || null,
          notes: editForm.notes.trim() || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      setPkg(data.package);
      setEditing(false);
      toast({ title: "Package updated" });
    } catch (err: any) {
      toast({ title: "Couldn't update package", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // PKG-B (packages audit, PKG-2): debounced fetch of available orders
  // when the dialog is open. Runs on dialog open with empty q so the
  // operator sees recent unlinked orders immediately, then re-fires
  // 200ms after each keystroke. Cancelled / soft-deleted / already-
  // packaged orders are excluded server-side.
  useEffect(() => {
    if (!linkDialogOpen) return;
    if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);
    linkDebounceRef.current = setTimeout(async () => {
      setLinkResultsLoading(true);
      try {
        const url = `/api/booking-packages/available-orders?limit=20${linkQuery.trim() ? `&q=${encodeURIComponent(linkQuery.trim())}` : ""}`;
        const r = await fetch(url);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Search failed");
        setLinkResults(data.orders || []);
      } catch (err: any) {
        toast({ title: "Couldn't search orders", description: err?.message || "Unknown error", variant: "destructive" });
        setLinkResults([]);
      } finally {
        setLinkResultsLoading(false);
      }
    }, 200);
    return () => {
      if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current);
    };
  }, [linkDialogOpen, linkQuery, toast]);

  // Reset picker state every time the dialog closes so reopening it
  // doesn't surface a stale picked row.
  useEffect(() => {
    if (!linkDialogOpen) {
      setLinkQuery("");
      setLinkResults([]);
      setPickedOrderId(null);
    }
  }, [linkDialogOpen]);

  const linkOrder = async () => {
    if (!pkg) return;
    const orderId = pickedOrderId;
    if (!orderId) {
      toast({ title: "Pick an order first", variant: "destructive" });
      return;
    }
    setLinking(true);
    try {
      const r = await fetch(`/api/booking-packages/${pkg.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Link failed");
      setPkg(data.package);
      setLinkDialogOpen(false);
      toast({ title: "Order linked" });
    } catch (err: any) {
      toast({ title: "Couldn't link order", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const unlinkOrder = async (orderId: string) => {
    if (!pkg) return;
    if (!window.confirm("Detach this order from the package? The order itself is not deleted.")) return;
    try {
      const r = await fetch(`/api/booking-packages/${pkg.id}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unlink failed");
      setPkg(data.package);
      toast({ title: "Order detached" });
    } catch (err: any) {
      toast({ title: "Couldn't detach order", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  const cancelPackage = async () => {
    if (!pkg) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast({ title: "Reason required", description: "Tell us why - this cascades to every linked order.", variant: "destructive" });
      return;
    }
    setCancelling(true);
    try {
      const r = await fetch(`/api/booking-packages/${pkg.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Cancel failed");
      toast({ title: "Package cancelled", description: `${data.orders_cancelled} linked orders cancelled.` });
      setCancelDialogOpen(false);
      setCancelReason("");
      await load();
    } catch (err: any) {
      toast({ title: "Couldn't cancel package", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Head><title>{pkg?.name || "Package"} - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="space-y-4 w-full px-4 sm:px-6 pt-20 lg:pt-6 pb-6">
          <Link href={tenantHref("/admin/packages")} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-3.5 h-3.5" />
            All packages
          </Link>

          {loading ? (
            <Card><CardContent className="py-10 text-center text-sm text-slate-500">Loading...</CardContent></Card>
          ) : !pkg ? (
            <Card><CardContent className="py-10 text-center text-sm text-slate-500">Package not found.</CardContent></Card>
          ) : (
            <>
              {/* Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Layers className="w-4 h-4 text-slate-400" />
                        <Badge variant="outline" className={`${STATUS_TONE[pkg.status]} text-[10px] capitalize`}>
                          {pkg.status}
                        </Badge>
                      </div>
                      {editing ? (
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="text-lg font-bold"
                        />
                      ) : (
                        <CardTitle className="text-xl sm:text-2xl">{pkg.name}</CardTitle>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!editing && pkg.status !== "cancelled" && (
                        <Button variant="outline" size="sm" onClick={enterEdit}>
                          <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
                        </Button>
                      )}
                      {editing && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                          <Button size="sm" onClick={saveEdit} disabled={saving}>
                            <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving..." : "Save"}
                          </Button>
                        </>
                      )}
                      {!editing && pkg.status !== "cancelled" && (
                        <Button variant="outline" size="sm" className="text-rose-700 border-rose-200 hover:bg-rose-50" onClick={() => setCancelDialogOpen(true)}>
                          <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Cancel package
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {editing ? (
                      <>
                        <div>
                          <Label className="text-xs">Starts</Label>
                          <Input type="date" value={editForm.starts_at} onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Ends</Label>
                          <Input type="date" value={editForm.ends_at} onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Venue</Label>
                          <Input value={editForm.venue_summary} onChange={(e) => setEditForm({ ...editForm, venue_summary: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2 md:col-span-4">
                          <Label className="text-xs">Notes (internal)</Label>
                          <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Dates</p>
                          <p className="font-medium text-slate-900 mt-0.5 flex items-center gap-1">
                            <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                            {pkg.starts_at ? formatDate(pkg.starts_at) : "-"}
                            {pkg.ends_at && pkg.ends_at !== pkg.starts_at && <> → {formatDate(pkg.ends_at)}</>}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Venue</p>
                          <p className="font-medium text-slate-900 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{pkg.venue_summary || "-"}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Orders</p>
                          <p className="font-bold tabular-nums text-slate-900 mt-0.5">{pkg.orders.length}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Total guests</p>
                          <p className="font-bold tabular-nums text-slate-900 mt-0.5">{totalGuests}</p>
                        </div>
                        {pkg.notes && (
                          <div className="sm:col-span-2 md:col-span-4 pt-2 border-t border-slate-100">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">Notes</p>
                            <p className="text-slate-700 mt-0.5 whitespace-pre-wrap text-xs">{pkg.notes}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Orders */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Linked orders</CardTitle>
                    {pkg.status !== "cancelled" && (
                      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <LinkIcon className="w-3.5 h-3.5 mr-1.5" /> Link order
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Link an order to this package</DialogTitle>
                            <DialogDescription>
                              Search by order number, client name or
                              event name. Already-packaged and cancelled
                              orders are hidden.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2">
                            <Input
                              placeholder="Search orders..."
                              value={linkQuery}
                              onChange={(e) => { setLinkQuery(e.target.value); setPickedOrderId(null); }}
                              autoFocus
                            />
                            <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white">
                              {linkResultsLoading ? (
                                <div className="py-6 text-center text-xs text-slate-500">Searching...</div>
                              ) : linkResults.length === 0 ? (
                                <div className="py-6 text-center text-xs text-slate-500">
                                  {linkQuery.trim()
                                    ? `No unlinked orders match "${linkQuery.trim()}".`
                                    : "No unlinked orders found. Every order is already in a package or cancelled."}
                                </div>
                              ) : (
                                <ul className="divide-y divide-slate-100">
                                  {linkResults.map((o) => {
                                    const picked = pickedOrderId === o.id;
                                    return (
                                      <li key={o.id}>
                                        <button
                                          type="button"
                                          onClick={() => setPickedOrderId(o.id)}
                                          className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition ${picked ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-sm text-slate-900 truncate">
                                              {o.event_name || o.client_name || "Untitled event"}
                                            </span>
                                            {o.order_number && (
                                              <span className="font-mono text-[10px] text-slate-500 tabular-nums flex-shrink-0">
                                                #{o.order_number}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                                            {o.client_name && o.event_name && <span>{o.client_name}</span>}
                                            {o.event_date && <span>{formatDate(o.event_date)}{o.event_time ? ` · ${o.event_time.slice(0, 5)}` : ""}</span>}
                                            {o.guest_count != null && o.guest_count > 0 && <span>{o.guest_count} guests</span>}
                                            {o.status && <span className="capitalize">{o.status.replace(/_/g, " ")}</span>}
                                          </div>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} disabled={linking}>Cancel</Button>
                            <Button onClick={linkOrder} disabled={linking || !pickedOrderId}>
                              {linking ? "Linking..." : "Link order"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {pkg.orders.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-500">
                      <Plus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      No orders linked yet. Use "Link order" to add one.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {pkg.orders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={tenantHref(`/admin/orders?id=${o.id}`)}
                              className="font-medium text-slate-900 hover:underline truncate block"
                            >
                              {o.event_name || o.order_number || "Untitled event"}
                            </Link>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                              {o.order_number && <span className="tabular-nums">#{o.order_number}</span>}
                              {o.event_date && <span>{formatDate(o.event_date)}{o.event_time ? ` · ${o.event_time.slice(0, 5)}` : ""}</span>}
                              {o.guest_count != null && o.guest_count > 0 && <span>{o.guest_count} guests</span>}
                              {o.status && <span className="capitalize">{o.status.replace(/_/g, " ")}</span>}
                            </div>
                          </div>
                          {pkg.status !== "cancelled" && (
                            <Button variant="ghost" size="sm" onClick={() => unlinkOrder(o.id)} title="Detach from package">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cancel dialog - gated behind a typed reason because
                  the cascade fans out to every linked order's
                  cancelOrder workflow. */}
              <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-rose-700 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" /> Cancel the entire package?
                    </DialogTitle>
                    <DialogDescription>
                      This cancels the package <strong>and every linked
                      order</strong> ({pkg.orders.length} order{pkg.orders.length === 1 ? "" : "s"}). Each
                      order's normal cancellation cascade fires -
                      refunds, equipment release, comms stop.
                    </DialogDescription>
                  </DialogHeader>
                  <div>
                    <Label htmlFor="cancel-reason">Reason</Label>
                    <Textarea
                      id="cancel-reason"
                      placeholder="e.g. Client cancelled wedding - relationship breakdown."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>Back</Button>
                    <Button variant="destructive" onClick={cancelPackage} disabled={cancelling}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      {cancelling ? "Cancelling..." : "Cancel package"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>
    </>
  );
}
