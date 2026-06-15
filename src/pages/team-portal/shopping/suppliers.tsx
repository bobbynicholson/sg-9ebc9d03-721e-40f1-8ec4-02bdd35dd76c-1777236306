import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Users, Search, Plus, Loader2, Phone, Mail, MapPin, Star, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
// SUP-C: route reads + writes through the canonical service so the
// admin and team-portal surfaces stop drifting. The card UI stays
// shopper-shaped but the data plumbing is unified.
import { supplierService } from "@/services/supplierService";

interface Supplier {
  id: string;
  supplier_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  payment_terms: number | null;
  account_number: string | null;
  rating: number | null;
  is_active: boolean | null;
  active: boolean | null;
  notes: string | null;
  emergency_contact: string | null;
}

const blank: Partial<Supplier> = {
  supplier_name: "",
  contact_person: "",
  email: "",
  phone: "",
  address_line1: "",
  city: "",
  payment_terms: 30,
  rating: 5,
  is_active: true,
  active: true,
  notes: "",
};

export default function ShoppingSuppliersPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    void load();

    // Shopping persona follow-up (shopping.md 5.5): realtime refresh
    // on supplier changes. Previously the list was mount-only - a
    // supplier added on the admin side stayed invisible until the
    // shopper hard-refreshed. Per-tenant channel + company_id filter
    // matches the docs/perf-and-ops.md realtime pattern.
    const channel = supabase
      .channel(`shopping-suppliers:${user.company_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "suppliers",
          filter: `company_id=eq.${user.company_id}`,
        },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const data = await supplierService.listForCompany(user.company_id);
      setItems(data as unknown as Supplier[]);
    } catch (e) {
      toast({ title: "Could not load suppliers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const preFiltered = useMemo(() => {
    return showInactive ? items : items.filter((s) => s.is_active !== false);
  }, [items, showInactive]);

  const filtered = useFuzzyItems(
    preFiltered,
    search,
    [
      { key: "supplier_name" as any, weight: 3 },
      { key: "contact_person" as any, weight: 2 },
      { key: "email" as any, weight: 2 },
      { key: "city" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((s) => s.is_active !== false).length;
    const avgRating = items.filter((s) => s.rating != null).reduce((a, s, _, arr) => a + Number(s.rating || 0) / arr.length, 0);
    return { total, active, avgRating };
  }, [items]);

  const openNew = () => setEditing({ ...blank });
  const openEdit = (s: Supplier) => setEditing(s);
  const close = () => setEditing(null);

  const save = async () => {
    if (!editing || !user?.company_id || !editing.supplier_name?.trim()) {
      toast({ title: "Supplier name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const sharedPayload = {
        supplier_name: editing.supplier_name.trim(),
        email: editing.email ?? null,
        phone: editing.phone ?? null,
        contact_person: editing.contact_person ?? null,
        payment_terms: editing.payment_terms ?? null,
        address_line1: editing.address_line1 ?? null,
        address_line2: editing.address_line2 ?? null,
        city: editing.city ?? null,
        postal_code: editing.postal_code ?? null,
        notes: editing.notes ?? null,
        account_number: editing.account_number ?? null,
        rating: editing.rating ?? null,
        emergency_contact: editing.emergency_contact ?? null,
      };
      if (editing.id) {
        await supplierService.update(editing.id, {
          ...sharedPayload,
          is_active: editing.is_active !== false,
        } as never);
        toast({ title: "Supplier updated" });
      } else {
        await supplierService.create({
          companyId: user.company_id,
          ...sharedPayload,
          is_active: editing.is_active !== false,
        });
        toast({ title: "Supplier added" });
      }
      close();
      load();
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof Supplier>(k: K, v: Supplier[K]) => {
    setEditing((s) => s ? { ...s, [k]: v } : s);
  };

  return (
    <>
      <Head><title>Suppliers - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              {/* Restrained icon tile: a single amber-tinted surface, not a
                  decorative gradient. Amber stays reserved for action/state. */}
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  Suppliers
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Your suppliers, contacts, payment terms and ratings</p>
              </div>
            </div>
            <Button onClick={openNew} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
              <Plus className="h-4 w-4 mr-2" />Add supplier
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none"><CardContent className="p-4"><p className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">Total suppliers <InfoTooltip content="Every supplier saved against your company, whether they're active right now or not." /></p><p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white mt-1">{stats.total}</p></CardContent></Card>
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none"><CardContent className="p-4"><p className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">Active <InfoTooltip content="Suppliers you're currently using.\n\nThese are the ones that show up when you're picking who to buy from." /></p><p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">{stats.active}</p></CardContent></Card>
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none"><CardContent className="p-4"><p className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">Avg rating <InfoTooltip content="Average rating across every supplier that has a score from 1 to 5." /></p><p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white flex items-center gap-1 mt-1">{stats.avgRating.toFixed(1)}<Star className="h-5 w-5 text-amber-500 fill-amber-500" /></p></CardContent></Card>
          </div>

          <Card className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <Input className="pl-9" placeholder="Search by name, contact, city..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {/* Toggle is a selection state, not a primary action: emerald
                  reads "active filter on", outline reads inactive. Amber stays
                  reserved for the primary Add action. */}
              <Button
                variant="outline"
                onClick={() => setShowInactive((v) => !v)}
                aria-pressed={showInactive}
                className={
                  showInactive
                    ? "rounded-lg border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                    : "rounded-lg"
                }
              >
                {showInactive ? "Showing inactive" : "Active only"}
              </Button>
            </CardContent>
          </Card>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-3.5 w-3/4" />
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <Skeleton className="h-5 w-12 rounded-md" />
                      <Skeleton className="h-5 w-14 rounded-md" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none">
              <CardContent className="text-center py-16 px-6">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200 dark:ring-amber-500/20 flex items-center justify-center">
                  <Users className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="font-medium text-slate-900 dark:text-white">
                  {search.trim() ? "No suppliers match your search" : "No suppliers yet"}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  {search.trim()
                    ? "Try a different name, contact or city, or clear the search to see everyone."
                    : "Add the people you buy from so you can track contacts, payment terms and ratings in one place."}
                </p>
                {!search.trim() && (
                  <Button onClick={openNew} className="mt-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                    <Plus className="h-4 w-4 mr-2" />Add your first supplier
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((s) => (
                <Card
                  key={s.id}
                  className={
                    "group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-none transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm motion-reduce:transition-none" +
                    (!s.is_active ? " opacity-60" : "")
                  }
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">{s.supplier_name}</div>
                        {s.contact_person && <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{s.contact_person}</div>}
                      </div>
                      {/* Edit affordance stays quiet until the card is hovered/focused. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(s)}
                        aria-label={`Edit ${s.supplier_name ?? "supplier"}`}
                        className="text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 motion-reduce:transition-none motion-reduce:opacity-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                      {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-500 dark:text-slate-500 flex-shrink-0" />{s.phone}</div>}
                      {s.email && <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-slate-500 dark:text-slate-500 flex-shrink-0" /><span className="truncate">{s.email}</span></div>}
                      {(s.city || s.address_line1) && <div className="flex items-center gap-2 truncate"><MapPin className="h-3.5 w-3.5 text-slate-500 dark:text-slate-500 flex-shrink-0" /><span className="truncate">{[s.address_line1, s.city].filter(Boolean).join(", ")}</span></div>}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      {s.rating != null && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-xs flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />{s.rating}/5
                        </Badge>
                      )}
                      {s.payment_terms != null && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs">Net {s.payment_terms}</Badge>
                      )}
                      {!s.is_active && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-xs">Inactive</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit supplier" : "New supplier"}</DialogTitle>
            <DialogDescription>Contact info, location, payment terms</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="sn">Supplier name *</Label>
                <Input id="sn" value={editing.supplier_name ?? ""} onChange={(e) => update("supplier_name", e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp">Contact person</Label>
                <Input id="cp" value={editing.contact_person ?? ""} onChange={(e) => update("contact_person", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Phone</Label>
                <Input id="ph" value={editing.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" value={editing.email ?? ""} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="a1">Address</Label>
                <Input id="a1" value={editing.address_line1 ?? ""} onChange={(e) => update("address_line1", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct">City</Label>
                <Input id="ct" value={editing.city ?? ""} onChange={(e) => update("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc">Postal code</Label>
                <Input id="pc" value={editing.postal_code ?? ""} onChange={(e) => update("postal_code", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pt">Payment terms (days)</Label>
                <Input id="pt" type="number" min="0" value={editing.payment_terms ?? 30} onChange={(e) => update("payment_terms", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt">Rating (1-5)</Label>
                <Input id="rt" type="number" min="1" max="5" value={editing.rating ?? 5} onChange={(e) => update("rating", Number(e.target.value))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="nt">Notes</Label>
                <Textarea id="nt" rows={2} value={editing.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <input type="checkbox" id="ia" checked={editing.is_active !== false} onChange={(e) => update("is_active", e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-amber-600 accent-amber-600 focus-visible:ring-1 focus-visible:ring-ring" />
                <Label htmlFor="ia" className="cursor-pointer text-slate-700 dark:text-slate-300">Active supplier</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving} className="rounded-lg">Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : editing?.id ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
