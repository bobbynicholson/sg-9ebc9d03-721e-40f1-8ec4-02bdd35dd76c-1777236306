import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
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
import { Package, Search, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, BookOpen } from "lucide-react";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, PortalHeader, PortalCard, StatTile } from "@/components/portal/ui";
import { useTenantHref } from "@/lib/tenantUrl";

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
  new: "bg-brand-primary/15 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",
  excellent: "bg-brand-primary/15 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",
  good: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  fair: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  poor: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  damaged: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
};

export default function CleaningEquipmentPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

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

  // Apply category filter first; the fuzzy hook takes it from there.
  const categoryFiltered = useMemo(() => {
    return category === "all" ? items : items.filter((i) => i.category === category);
  }, [items, category]);

  const filtered = useFuzzyItems(
    categoryFiltered,
    search,
    [
      { key: "name" as any, weight: 3 },
      { key: "category" as any, weight: 1 },
      { key: "location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

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
          equipment_id: verifyItem.id,
          damage_type: missing > 0 ? "lost" : "damaged",
          notes: damageNotes.trim() || `${missing} missing on verification`,
          repair_cost: missing * Number(verifyItem.replacement_cost || 0),
          reported_by: user.id,
          resolved: false,
        }] as never);
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
      <Head><title>Equipment verification - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Equipment verification"
            subtitle="Verify gear returned from a function, then log missing or damaged items for admin invoice review"
            icon={ShieldCheck}
          />

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <StatTile
              label="Equipment items"
              value={stats.total}
              hint="Lines on file for your company"
            />
            <StatTile
              label="Damaged / poor"
              value={stats.damaged}
              hint="Keep out of rotation until fixed"
            />
            <StatTile
              label="Replacement value"
              value={`R ${stats.totalValue.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
              hint="Cost to replace everything today"
            />
          </div>

          <PortalCard className="mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input placeholder="Search by name or category..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </PortalCard>

          <PortalCard padded={false}>
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading equipment">
                {[0, 1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <Package className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-medium">No equipment matches the filter</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((i) => (
                  <li key={i.id} className="p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 dark:text-white truncate">{i.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                        <span>{i.category ?? "--"}</span>
                        {i.replacement_cost != null && <span className="tabular-nums">R {Number(i.replacement_cost).toFixed(0)} replacement</span>}
                        {i.cleaning_time_hours != null && <span className="tabular-nums">{Number(i.cleaning_time_hours)}h to clean</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {i.condition && (
                        <Badge variant="outline" className={`${conditionTone[i.condition] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"} text-xs`}>
                          {i.condition}
                        </Badge>
                      )}
                      <span className="text-right tabular-nums">
                        <span className="text-base font-semibold text-slate-900 dark:text-white">{Number(i.available_quantity ?? 0)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">/{Number(i.quantity ?? 0)}</span>
                      </span>
                      {/* Cleaning follow-up (cleaning.md 5.4): inline
                          SOP link. workflows.tsx has cleaning steps
                          by category but nothing on this page surfaced
                          them. Now one tap from a verification row to
                          "how do I clean this category?". */}
                      {i.category && (
                        <Link
                          href={withSlug(`/team-portal/cleaning/workflows?category=${encodeURIComponent(i.category)}`)}
                          className="inline-flex items-center text-xs text-amber-700 dark:text-amber-400 hover:underline"
                          title={`How to clean ${i.category}`}
                        >
                          <BookOpen className="h-4 w-4" />
                          <span className="sr-only">How to clean {i.category}</span>
                        </Link>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openVerify(i)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />Verify
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PortalCard>
        </PortalShell>
      </main>

      <Dialog open={!!verifyItem} onOpenChange={(o) => !o && closeVerify()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {verifyItem?.name}</DialogTitle>
            <DialogDescription>
              {verifyItem && `Sent out ${verifyItem.quantity ?? 0}, check what came back. Missing items are recorded for admin review at R ${Number(verifyItem.replacement_cost || 0).toFixed(0)} each.`}
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
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm dark:bg-amber-950 dark:border-amber-900 dark:text-amber-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span>Replacement value: <span className="font-semibold tabular-nums">R {(Number(missingQty) * Number(verifyItem.replacement_cost)).toFixed(2)}</span></span>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 ml-6">
                  Recorded on the damage log. Admin reviews and adds it to the client's invoice manually - it does not auto-bill yet.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeVerify} disabled={saving}>Cancel</Button>
            <Button onClick={saveVerification} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Save verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
