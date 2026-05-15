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
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .order("supplier_name", { ascending: true })
        .returns<Supplier[]>();
      if (error) throw error;
      setItems(data || []);
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
      const payload = { ...editing, company_id: user.company_id, supplier_name: editing.supplier_name.trim() };
      if (editing.id) {
        const { error } = await supabase.from("suppliers").update(payload as never).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Supplier updated" });
      } else {
        const { error } = await supabase.from("suppliers").insert([payload as never]);
        if (error) throw error;
        toast({ title: "Supplier added" });
      }
      close();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
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
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            {/* Wave 34: gradient-box icon header. */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Suppliers
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">Database of your suppliers, contacts, payment terms, ratings</p>
              </div>
            </div>
            <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />Add supplier
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Total suppliers <InfoTooltip content="Every supplier saved against your company, whether they're active right now or not." /></p><p className="text-2xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Active <InfoTooltip content="Suppliers you're currently using.\n\nThese are the ones that show up when you're picking who to buy from." /></p><p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.active}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Avg rating <InfoTooltip content="Average rating across every supplier that has a score from 1 to 5." /></p><p className="text-2xl font-bold tabular-nums flex items-center gap-1">{stats.avgRating.toFixed(1)}<Star className="h-5 w-5 text-amber-400 fill-amber-400" /></p></CardContent></Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Search by name, contact, city..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button variant={showInactive ? "default" : "outline"} onClick={() => setShowInactive((v) => !v)} className={showInactive ? "bg-slate-600 hover:bg-slate-700" : ""}>
                {showInactive ? "Showing inactive" : "Active only"}
              </Button>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading suppliers...</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="text-center py-16 text-slate-500">
                <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No suppliers yet</p>
                <p className="text-xs mt-1">Click "Add supplier" to start your supplier database</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((s) => (
                <Card key={s.id} className={!s.is_active ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">{s.supplier_name}</div>
                        {s.contact_person && <div className="text-xs text-slate-500 truncate">{s.contact_person}</div>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1 text-sm text-slate-700">
                      {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" />{s.phone}</div>}
                      {s.email && <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /><span className="truncate">{s.email}</span></div>}
                      {(s.city || s.address_line1) && <div className="flex items-center gap-2 truncate"><MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /><span className="truncate">{[s.address_line1, s.city].filter(Boolean).join(", ")}</span></div>}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      {s.rating != null && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400" />{s.rating}/5
                        </Badge>
                      )}
                      {s.payment_terms != null && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Net {s.payment_terms}</Badge>
                      )}
                      {!s.is_active && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">Inactive</Badge>
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
              <div className="col-span-2">
                <Label htmlFor="sn">Supplier name *</Label>
                <Input id="sn" value={editing.supplier_name ?? ""} onChange={(e) => update("supplier_name", e.target.value)} autoFocus />
              </div>
              <div>
                <Label htmlFor="cp">Contact person</Label>
                <Input id="cp" value={editing.contact_person ?? ""} onChange={(e) => update("contact_person", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ph">Phone</Label>
                <Input id="ph" value={editing.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" value={editing.email ?? ""} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="a1">Address</Label>
                <Input id="a1" value={editing.address_line1 ?? ""} onChange={(e) => update("address_line1", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ct">City</Label>
                <Input id="ct" value={editing.city ?? ""} onChange={(e) => update("city", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pc">Postal code</Label>
                <Input id="pc" value={editing.postal_code ?? ""} onChange={(e) => update("postal_code", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pt">Payment terms (days)</Label>
                <Input id="pt" type="number" min="0" value={editing.payment_terms ?? 30} onChange={(e) => update("payment_terms", Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="rt">Rating (1-5)</Label>
                <Input id="rt" type="number" min="1" max="5" value={editing.rating ?? 5} onChange={(e) => update("rating", Number(e.target.value))} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="nt">Notes</Label>
                <Textarea id="nt" rows={2} value={editing.notes ?? ""} onChange={(e) => update("notes", e.target.value)} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="ia" checked={editing.is_active !== false} onChange={(e) => update("is_active", e.target.checked)} className="rounded" />
                <Label htmlFor="ia" className="cursor-pointer">Active supplier</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : editing?.id ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
