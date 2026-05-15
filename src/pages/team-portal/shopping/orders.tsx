import { useState, useEffect, useMemo, useRef } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Loader2, Plus, Check, ListChecks, Calendar, Clock, Users as UsersIcon, Receipt, MapPin, Camera, X } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toLocalISO } from "@/lib/localDate";

interface ShoppingList {
  id: string;
  list_date: string | null;
  status: string | null;
  shopper_id: string | null;
  receipt_url: string | null;
  notes: string | null;
  estimated_total: number | null;
  actual_total: number | null;
  created_at: string | null;
}

interface Order {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  status: string | null;
  /** Venue address gives the shopper a sense of how far the kitchen is
   *  from the event, useful when the same shopping list might be split
   *  between branches. Surfaced inline on each upcoming-event card. */
  venue_address?: string | null;
  client_name?: string | null;
}

const listStatusTone: Record<string, string> = {
  draft:        "bg-slate-100 text-slate-700 border-slate-200",
  pending:      "bg-amber-100 text-amber-800 border-amber-200",
  in_progress:  "bg-purple-100 text-purple-800 border-purple-200",
  shopping:     "bg-purple-100 text-purple-800 border-purple-200",
  completed:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:    "bg-rose-100 text-rose-700 border-rose-200",
};

const orderStatusTone: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-800 border-amber-200",
  confirmed:  "bg-blue-100 text-blue-800 border-blue-200",
  preparing:  "bg-purple-100 text-purple-800 border-purple-200",
  ready:      "bg-green-100 text-green-800 border-green-200",
};

export default function ShoppingOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [upcomingOrders, setUpcomingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"lists" | "upcoming">("lists");

  const [creating, setCreating] = useState(false);
  const [listDate, setListDate] = useState(toLocalISO(new Date()));
  const [listNotes, setListNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Phase 7 #7: complete-with-receipt dialog. The shopper picks
  // a slip photo when they finish a list, mirroring the driver's
  // POD flow on delivered orders. The url lands on shopping_lists.
  // receipt_url and the existing badge surfaces it on the list.
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [actualTotal, setActualTotal] = useState<string>("");
  const [completing, setCompleting] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const [listsRes, ordersRes] = await Promise.all([
        supabase
          .from("shopping_lists")
          .select("*")
          .eq("company_id", user.company_id)
          .order("list_date", { ascending: false })
          .limit(50)
          .returns<ShoppingList[]>(),
        supabase
          .from("orders")
          .select("id, order_number, event_name, event_date, event_time, guest_count, status, venue_address, client_name")
          .eq("company_id", user.company_id)
          .gte("event_date", toLocalISO(new Date()))
          .in("status", ["pending", "confirmed", "preparing"])
          .order("event_date", { ascending: true })
          .limit(50)
          .returns<Order[]>(),
      ]);
      setLists(listsRes.data || []);
      setUpcomingOrders(ordersRes.data || []);
    } catch (e) {
      toast({ title: "Could not load orders", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalLists = lists.length;
    const open = lists.filter((l) => l.status !== "completed" && l.status !== "cancelled").length;
    const upcoming = upcomingOrders.length;
    return { totalLists, open, upcoming };
  }, [lists, upcomingOrders]);

  const openCreate = () => {
    setCreating(true);
    setListDate(toLocalISO(new Date()));
    setListNotes("");
  };
  const closeCreate = () => setCreating(false);

  const saveCreate = async () => {
    if (!user?.id || !user?.company_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("shopping_lists").insert([{
        company_id: user.company_id,
        user_id: user.id,
        shopper_id: user.id,
        list_date: listDate,
        status: "pending",
        notes: listNotes.trim() || null,
      }] as never);
      if (error) throw error;
      toast({ title: "Shopping list created" });
      closeCreate();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const claimList = async (id: string) => {
    if (!user?.id) return;
    try {
      await supabase.from("shopping_lists").update({
        shopper_id: user.id,
        status: "in_progress",
      }).eq("id", id);
      toast({ title: "List claimed" });
      load();
    } catch {
      toast({ title: "Could not claim", variant: "destructive" });
    }
  };

  const openComplete = (id: string) => {
    setCompletingId(id);
    setReceiptFile(null);
    setReceiptPreview(null);
    setActualTotal("");
  };
  const closeComplete = () => {
    setCompletingId(null);
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    setActualTotal("");
  };
  const onReceiptPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setReceiptFile(f);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(f ? URL.createObjectURL(f) : null);
  };
  const completeList = async () => {
    if (!completingId) return;
    setCompleting(true);
    try {
      let receipt_url: string | null = null;
      if (receiptFile) {
        // Reuse the imports bucket -- it's the only one with a
        // receipt-style policy already in place. Path-prefix the
        // file so the shopping artefacts are easy to find later.
        const ext = (receiptFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `shopping-list-receipts/${completingId}/receipt-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("imports")
          .upload(path, receiptFile, {
            upsert: true,
            contentType: receiptFile.type || "image/jpeg",
          });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("imports").getPublicUrl(path);
        receipt_url = pub.publicUrl;
      }
      const updates: Record<string, any> = {
        status: "completed",
      };
      if (receipt_url) updates.receipt_url = receipt_url;
      if (actualTotal.trim()) {
        const n = Number(actualTotal.replace(/[^0-9.]/g, ""));
        if (!isNaN(n)) updates.actual_total = n;
      }
      const { error } = await supabase
        .from("shopping_lists")
        .update(updates as never)
        .eq("id", completingId);
      if (error) throw error;
      toast({ title: "List completed", description: receipt_url ? "Receipt attached." : undefined });
      closeComplete();
      load();
    } catch (e: any) {
      toast({
        title: "Could not complete",
        description: e?.message || "Upload or update failed.",
        variant: "destructive",
      });
    } finally {
      setCompleting(false);
    }
  };

  const fmtTime = (t?: string | null) => t ? t.slice(0, 5) : "TBC";

  return (
    <>
      <Head><title>Shopping Orders - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            {/* Wave 34: gradient-box icon header. */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Shopping Orders
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">Active shopping lists + upcoming events that need procurement</p>
              </div>
            </div>
            <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />New shopping list
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Open lists <InfoTooltip content="Shopping lists that haven't been finished off or cancelled yet." /></p><p className="text-2xl font-bold tabular-nums text-amber-600">{stats.open}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Total lists <InfoTooltip content="Every shopping list, no matter the status.\n\nWe show the most recent 50." /></p><p className="text-2xl font-bold tabular-nums">{stats.totalLists}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Upcoming events <InfoTooltip content="Confirmed or pending orders happening today or later." /></p><p className="text-2xl font-bold tabular-nums">{stats.upcoming}</p></CardContent></Card>
          </div>

          <div className="flex gap-2 mb-4">
            <Button variant={tab === "lists" ? "default" : "outline"} size="sm" onClick={() => setTab("lists")} className={tab === "lists" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
              <ListChecks className="h-4 w-4 mr-2" />Shopping lists
            </Button>
            <Button variant={tab === "upcoming" ? "default" : "outline"} size="sm" onClick={() => setTab("upcoming")} className={tab === "upcoming" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
              <Calendar className="h-4 w-4 mr-2" />Upcoming events
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
          ) : tab === "lists" ? (
            lists.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16 text-slate-500">
                  <ListChecks className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No shopping lists yet</p>
                  <p className="text-xs mt-1">Click "New shopping list" to start one</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {lists.map((l) => (
                      <li key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900">{l.list_date ?? "Undated list"}</span>
                            {l.status && (
                              <Badge variant="outline" className={`${listStatusTone[l.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs capitalize`}>
                                {l.status.replace("_", " ")}
                              </Badge>
                            )}
                            {l.receipt_url && (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs flex items-center gap-1">
                                <Receipt className="h-3 w-3" />Receipt attached
                              </Badge>
                            )}
                          </div>
                          {l.notes && <p className="text-xs text-slate-600 mb-1">{l.notes}</p>}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            {l.estimated_total != null && <span>Est. R {Number(l.estimated_total).toFixed(2)}</span>}
                            {l.actual_total != null && <span className="text-slate-700">Actual R {Number(l.actual_total).toFixed(2)}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {l.status !== "completed" && !l.shopper_id && (
                            <Button size="sm" variant="outline" onClick={() => claimList(l.id)}>Claim</Button>
                          )}
                          {l.status !== "completed" && (
                            <Button size="sm" onClick={() => openComplete(l.id)} className="bg-emerald-600 hover:bg-emerald-700">
                              <Check className="h-4 w-4 mr-1" />Complete
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          ) : (
            upcomingOrders.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16 text-slate-500">
                  <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No upcoming events</p>
                  <p className="text-xs mt-1">When orders are confirmed they'll appear here for shopping</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {upcomingOrders.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 truncate">{o.event_name ?? o.order_number ?? "Event"}</div>
                          {o.client_name && (
                            <div className="text-xs text-slate-600 truncate">{o.client_name}</div>
                          )}
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{o.event_date}</span>
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(o.event_time)}</span>
                            {o.guest_count != null && <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3" />{o.guest_count}</span>}
                          </div>
                          {/* Venue inline so the shopper knows where this
                              event lands -- useful when the kitchen is
                              splitting purchases between branches. */}
                          {o.venue_address && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{o.venue_address}</span>
                            </p>
                          )}
                        </div>
                        {o.status && (
                          <Badge variant="outline" className={`${orderStatusTone[o.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs capitalize flex-shrink-0`}>
                            {o.status}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New shopping list</DialogTitle>
            <DialogDescription>Start a list for a procurement run</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ld">Date</Label>
              <Input id="ld" type="date" value={listDate} onChange={(e) => setListDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ln">Notes</Label>
              <Textarea id="ln" rows={3} value={listNotes} onChange={(e) => setListNotes(e.target.value)} placeholder="What's this list for? e.g. 'Saturday wedding 200 pax'" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button>
            <Button onClick={saveCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Create list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7 #7: complete-with-receipt dialog. Mirrors the
          driver POD flow -- the shopper closes out the list with
          a photo of the supplier slip plus the actual cash total
          paid so reconciliation against the till stays honest. */}
      <Dialog open={completingId !== null} onOpenChange={(o) => !o && closeComplete()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete shopping list</DialogTitle>
            <DialogDescription>
              Snap the till slip and capture the actual amount paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actual_total">Actual total paid (R)</Label>
              <Input
                id="actual_total"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 1 248.50"
                value={actualTotal}
                onChange={(e) => setActualTotal(e.target.value)}
              />
            </div>
            <div>
              <Label>Receipt photo</Label>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onReceiptPicked}
                className="hidden"
              />
              {receiptPreview ? (
                <div className="relative mt-1 border border-slate-200 rounded-md overflow-hidden">
                  <img src={receiptPreview} alt="Receipt preview" className="w-full max-h-64 object-contain bg-slate-50" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 bg-white/80 hover:bg-white"
                    onClick={() => {
                      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                      setReceiptFile(null);
                      setReceiptPreview(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="mt-1 w-full"
                  onClick={() => receiptInputRef.current?.click()}
                  type="button"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take photo or pick file
                </Button>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                Optional but recommended. Goes into the imports bucket and surfaces on the list as a receipt-attached badge.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeComplete} disabled={completing}>
              Cancel
            </Button>
            <Button
              onClick={completeList}
              disabled={completing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : <><Check className="h-4 w-4 mr-2" />Mark complete</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
