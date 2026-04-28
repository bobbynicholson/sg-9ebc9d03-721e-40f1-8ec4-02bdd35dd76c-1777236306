import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Package, Search, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Equipment {
  id: string;
  name: string | null;
  category: string | null;
  quantity: number | null;
  available_quantity: number | null;
  condition: string | null;
  replacement_cost: number | null;
  cleaning_time_hours: number | null;
}

const conditionTone: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-800 border-emerald-200",
  excellent: "bg-emerald-100 text-emerald-800 border-emerald-200",
  good: "bg-blue-100 text-blue-800 border-blue-200",
  fair: "bg-amber-100 text-amber-800 border-amber-200",
  poor: "bg-rose-100 text-rose-700 border-rose-200",
  damaged: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function CleaningEquipmentPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [verifyItem, setVerifyItem] = useState<Equipment | null>(null);
  const [verifiedQty, setVerifiedQty] = useState("");
  const [missingQty, setMissingQty] = useState("");
  const [damageNotes, setDamageNotes] = useState("");
  const [verifyCondition, setVerifyCondition] = useState("good");
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
        .from("equipment")
        .select("id, name, category, quantity, available_quantity, condition, replacement_cost, cleaning_time_hours")
        .eq("company_id", user.company_id)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
        .returns<Equipment[]>();
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      toast({ title: "Could not load equipment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.category) s.add(i.category); });
    return ["all", ...Array.from(s).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (term && !`${i.name ?? ""} ${i.category ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, category]);

  const stats = useMemo(() => {
    const total = items.length;
    const damaged = items.filter((i) => ["damaged", "poor"].includes(i.condition || "")).length;
    const totalValue = items.reduce((s, i) => s + Number(i.replacement_cost || 0) * Number(i.quantity || 0), 0);
    return { total, damaged, totalValue };
  }, [items]);

  const openVerify = (item: Equipment) => {
    setVerifyItem(item);
    setVerifiedQty(String(item.quantity ?? 0));
    setMissingQty("0");
    setDamageNotes("");
    setVerifyCondition(item.condition || "good");
  };
  const closeVerify = () => {
    setVerifyItem(null);
    setVerifiedQty("");
    setMissingQty("");
    setDamageNotes("");
  };

  const saveVerification = async () => {
    if (!verifyItem || !user?.id || !user?.company_id) return;
    const verified = Number(verifiedQty);
    const missing = Number(missingQty);
    if (Number.isNaN(verified) || verified < 0 || Number.isNaN(missing) || missing < 0) {
      toast({ title: "Quantities must be positive numbers", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await supabase.from("equipment").update({
        condition: verifyCondition,
        available_quantity: Math.max(0, verified - missing),
      }).eq("id", verifyItem.id);

      if (missing > 0 || damageNotes.trim()) {
        await supabase.from("equipment_damages").insert([{
          company_id: user.company_id,
          damage_type: missing > 0 ? "missing" : "damage",
          notes: damageNotes.trim() || `${missing} missing on verification`,
          repair_cost: missing * Number(verifyItem.replacement_cost || 0),
          reported_by: user.id,
          resolved: false,
        }]);
      }
      toast({ title: "Verification saved", description: `${verifyItem.name}: ${verified} verified, ${missing} missing` });
      closeVerify();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head><title>Equipment Verification - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
              <ShieldCheck className="h-7 w-7 text-cyan-600" />
              Equipment Verification
            </h1>
            <p className="text-sm text-slate-600 mt-1">Verify gear returned from a function -- log missing or damaged items with auto-billing</p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600">Equipment items</p><p className="text-2xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600">Damaged / poor</p><p className="text-2xl font-bold tabular-nums text-rose-600">{stats.damaged}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600">Replacement value</p><p className="text-2xl font-bold tabular-nums">R {stats.totalValue.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}</p></CardContent></Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Search by name or category..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading equipment...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Package className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No equipment matches the filter</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((i) => (
                    <li key={i.id} className="p-4 flex items-center gap-3 hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{i.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          <span>{i.category ?? "--"}</span>
                          {i.replacement_cost != null && <span>R {Number(i.replacement_cost).toFixed(0)} replacement</span>}
                          {i.cleaning_time_hours != null && <span>{Number(i.cleaning_time_hours)}h to clean</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {i.condition && (
                          <Badge variant="outline" className={`${conditionTone[i.condition] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs`}>
                            {i.condition}
                          </Badge>
                        )}
                        <span className="text-right tabular-nums">
                          <span className="text-base font-semibold">{Number(i.available_quantity ?? 0)}</span>
                          <span className="text-xs text-slate-500">/{Number(i.quantity ?? 0)}</span>
                        </span>
                        <Button size="sm" variant="outline" onClick={() => openVerify(i)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />Verify
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!verifyItem} onOpenChange={(o) => !o && closeVerify()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {verifyItem?.name}</DialogTitle>
            <DialogDescription>
              {verifyItem && `Sent out ${verifyItem.quantity ?? 0} -- check what came back. Missing items auto-bill the client at R ${Number(verifyItem.replacement_cost || 0).toFixed(0)} each.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="verifiedQty">Returned</Label>
                <Input id="verifiedQty" type="number" min="0" value={verifiedQty} onChange={(e) => setVerifiedQty(e.target.value)} autoFocus />
              </div>
              <div>
                <Label htmlFor="missingQty">Missing</Label>
                <Input id="missingQty" type="number" min="0" value={missingQty} onChange={(e) => setMissingQty(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="cond">Condition</Label>
              <Select value={verifyCondition} onValueChange={setVerifyCondition}>
                <SelectTrigger id="cond"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dnotes">Damage / loss notes</Label>
              <Textarea id="dnotes" rows={3} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} placeholder="e.g. 2 chafing dishes dented, 1 ladle missing" />
            </div>
            {Number(missingQty) > 0 && verifyItem?.replacement_cost && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span>Auto-bill: <span className="font-semibold tabular-nums">R {(Number(missingQty) * Number(verifyItem.replacement_cost)).toFixed(2)}</span></span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeVerify} disabled={saving}>Cancel</Button>
            <Button onClick={saveVerification} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Save verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
