import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Loader2, Plus, Check, ListChecks, Calendar, Clock, Users as UsersIcon, Receipt, MapPin } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [listDate, setListDate] = useState(new Date().toISOString().slice(0, 10));
  const [listNotes, setListNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
          .gte("event_date", new Date().toISOString().slice(0, 10))
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
    setListDate(new Date().toISOString().slice(0, 10));
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

  const completeList = async (id: string) => {
    try {
      await supabase.from("shopping_lists").update({
        status: "completed",
      }).eq("id", id);
      toast({ title: "List completed" });
      load();
    } catch {
      toast({ title: "Could not complete", variant: "destructive" });
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
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-3">
                <ShoppingCart className="h-7 w-7 text-emerald-600" />
                Shopping Orders
              </h1>
              <p className="text-sm text-slate-600 mt-1">Active shopping lists + upcoming events that need procurement</p>
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
                            <Button size="sm" onClick={() => completeList(l.id)} className="bg-emerald-600 hover:bg-emerald-700">
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
    </>
  );
}
