import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
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
import { Package, Search, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, BookOpen, RefreshCw } from "lucide-react";
import Link from "next/link";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { useTenantHref } from "@/lib/tenantUrl";
import { formatZAR } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

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

function CleaningEquipmentPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  // First successful load done: skeleton only before it, and realtime
  // refreshes swap data in place instead of blanking the list.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    const refresh = () => void load();
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-equipment-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment", filter: `company_id=eq.${user.company_id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_damages", filter: `company_id=eq.${user.company_id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    if (!loaded) setLoading(true);
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
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Recovery card owns this state; never show an empty list for a
      // failed load.
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
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
    if (!verifyItem || !user?.id || !user?.company_id || saving) return;
    const verified = Number(verifiedQty);
    const missing = Number(missingQty);
    if (Number.isNaN(verified) || verified < 0 || Number.isNaN(missing) || missing < 0) {
      toast({ title: "Quantities must be positive numbers", variant: "destructive" });
      return;
    }
    const expected = Number(verifyItem.quantity || 0);
    if (verified > expected || missing > expected || verified + missing > expected) {
      toast({
        title: "Check the quantities",
        description: `Returned plus missing cannot exceed ${expected}.`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // Supabase errors don't throw on their own: check both writes so a
      // failed save can't toast "Verification saved".
      const { error: updateError } = await supabase.from("equipment").update({
        condition: verifyCondition,
        available_quantity: Math.max(0, Math.min(expected, verified)),
      }).eq("id", verifyItem.id).eq("company_id", user.company_id);
      if (updateError) throw updateError;

      const conditionNeedsDamageRow = verifyCondition === "poor" || verifyCondition === "damaged";
      if (missing > 0 || damageNotes.trim() || conditionNeedsDamageRow) {
        // Write the canonical damage-row shape so admin cost analytics
        // (getDamageCostBreakdown sums total_cost/quantity_damaged) and
        // RecentDamagesStrip (renders x{quantity_damaged}) both work.
        // Missing units are "lost" at replacement cost; a condition-only
        // flag counts the units that came back not-good (expected - verified).
        const unitCost = Number(verifyItem.replacement_cost || 0);
        const qtyDamaged = missing > 0 ? missing : Math.max(1, expected - verified);
        const totalCost = unitCost * qtyDamaged;
        const { error: damageError } = await supabase.from("equipment_damages").insert([{
          company_id: user.company_id,
          equipment_id: verifyItem.id,
          damage_type: missing > 0 ? "lost" : "damaged",
          damage_stage: "cleaning",
          quantity_damaged: qtyDamaged,
          unit_cost: unitCost,
          total_cost: totalCost,
          notes: damageNotes.trim() || (missing > 0 ? `${missing} missing on verification` : `Condition marked ${verifyCondition} during verification`),
          repair_cost: totalCost,
          reported_by: user.id,
          resolved: false,
        }] as never);
        if (damageError) throw damageError;
      }
      toast({ title: "Verification saved", description: `${verifyItem.name}: ${verified} verified, ${missing} missing` });
      closeVerify();
      void load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <CleaningPageShell
        pageTitle="Equipment verification - CateringMS"
        heading="Equipment verification"
        subheading={
          chipsReady
            ? stats.damaged > 0
              ? `${stats.total} equipment line${stats.total === 1 ? "" : "s"} on file, ${stats.damaged} flagged damaged or poor.`
              : `${stats.total} equipment line${stats.total === 1 ? "" : "s"} on file, nothing flagged damaged.`
            : "Verify gear returned from a function, then log missing or damaged items for admin invoice review."
        }
        icon={ShieldCheck}
        meta={
          chipsReady ? (
            <>
              <span className={CLEANING_HERO_CHIP}>
                <Package className="h-3 w-3" />
                {stats.total} item{stats.total === 1 ? "" : "s"}
              </span>
              <span className={CLEANING_HERO_CHIP}>
                <span className={cn("h-1.5 w-1.5 rounded-full", stats.damaged > 0 ? "bg-rose-400" : "bg-emerald-400")} />
                {stats.damaged > 0 ? `${stats.damaged} damaged / poor` : "None damaged"}
              </span>
              <span className={CLEANING_HERO_CHIP}>
                {formatZAR(stats.totalValue, { decimals: 0 })} replacement value
              </span>
            </>
          ) : undefined
        }
      >
        {/* Recovery card: the load failed. Never dress a failed load up
            as an empty equipment list. */}
        {loadError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the equipment list</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="bg-brand-primary hover:opacity-90 text-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatTile
            label="Equipment items"
            value={chipsReady ? stats.total : "--"}
            hint="Lines on file for your company"
          />
          <StatTile
            label="Damaged / poor"
            value={chipsReady ? stats.damaged : "--"}
            hint="Keep out of rotation until fixed"
          />
          <StatTile
            label="Replacement value"
            value={chipsReady ? formatZAR(stats.totalValue, { decimals: 0 }) : "--"}
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
          {showSkeleton ? (
            <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading equipment">
              {[0, 1, 2, 3, 4].map((n) => (
                <div key={n} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          ) : loadError && items.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              The equipment list is unavailable right now. Use Retry above to reload it.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-6 text-slate-500 dark:text-slate-400">
              <Package className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-700 dark:text-slate-200">
                {items.length === 0 ? "No equipment on file yet" : "No equipment matches the filter"}
              </p>
              <p className="text-xs mt-1">
                {items.length === 0
                  ? "Once admin adds equipment in the catalogue it will show here for verification"
                  : "Clear the search or pick another category to see the full list"}
              </p>
              {items.length > 0 && (search || category !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => { setSearch(""); setCategory("all"); }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((i) => (
                // Stack name above the controls on mobile - on one line the
                // condition badge + qty + SOP link + Verify button crowded the
                // name so hard it truncated to "Stainl...". Full width on
                // phones, single row from sm up.
                <li key={i.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white truncate">{i.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{i.category ?? "--"}</span>
                      {i.replacement_cost != null && <span className="tabular-nums">{formatZAR(i.replacement_cost, { decimals: 0 })} replacement</span>}
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
                        className="inline-flex items-center text-xs text-brand-primary dark:text-brand-primary hover:underline"
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
      </CleaningPageShell>

      <Dialog open={!!verifyItem} onOpenChange={(o) => !o && closeVerify()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {verifyItem?.name}</DialogTitle>
            <DialogDescription>
              {verifyItem && `Sent out ${verifyItem.quantity ?? 0}, check what came back. Missing items are recorded for admin review at ${formatZAR(Number(verifyItem.replacement_cost || 0), { decimals: 0 })} each.`}
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
                  <span>Replacement value: <span className="font-semibold tabular-nums">{formatZAR(Number(missingQty) * Number(verifyItem.replacement_cost))}</span></span>
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

export default function CleaningEquipmentPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.CLEANING_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningEquipmentPageInner />
    </ProtectedRoute>
  );
}
