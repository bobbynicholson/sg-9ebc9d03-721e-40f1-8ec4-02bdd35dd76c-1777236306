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
import { AlertTriangle, Plus, Loader2, Search, Check, FileWarning, Package, Calendar as CalendarIcon, User, Image as ImageIcon } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { PortalShell, PortalHeader, PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import { formatDistanceToNow } from "date-fns";

interface Damage {
  id: string;
  damage_type: string | null;
  notes: string | null;
  repair_cost: number | null;
  resolved: boolean | null;
  reported_by: string | null;
  order_id: string | null;
  equipment_id: string | null;
  created_at: string | null;
  // Richer fields written by the Flag-damaged flow (reportDamage). The
  // legacy create dialog on this page writes notes/repair_cost; the cleaner
  // Flag button writes description/total_cost/quantity_damaged/photo. We read
  // both so every damage shows fully regardless of which path created it.
  description: string | null;
  total_cost: number | null;
  unit_cost: number | null;
  quantity_damaged: number | null;
  photo_url: string | null;
  responsible_name: string | null;
  // Event + client context (joined) so a damage reads as a billable line:
  // "broken bowl on ORD-003849, Smith Wedding, client Jane - charge R10".
  order: {
    order_number: string | null;
    event_name: string | null;
    client_name: string | null;
    event_date: string | null;
  } | null;
}

// Unified accessors so legacy (notes/repair_cost) and new (description/
// total_cost) damage rows render identically.
const damageDescription = (d: Damage): string => (d.description || d.notes || "").trim();
const damageCost = (d: Damage): number => Number(d.total_cost ?? d.repair_cost ?? 0);
const damageQty = (d: Damage): number => Number(d.quantity_damaged ?? 1);

interface Equipment { id: string; name: string | null; replacement_cost: number | null; }

const typeTone: Record<string, string> = {
  damage:     "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  missing:    "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  broken:     "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  worn:       "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  cosmetic:   "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export default function CleaningDamagePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Damage[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "open" | "resolved">("open");

  const [creating, setCreating] = useState(false);
  const [equipmentId, setEquipmentId] = useState("");
  const [damageType, setDamageType] = useState("damage");
  const [notes, setNotes] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, tab]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      let q = supabase
        .from("equipment_damages")
        .select("*, order:order_id(order_number, event_name, client_name, event_date)")
        .eq("company_id", user.company_id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (tab === "open") q = q.eq("resolved", false);
      if (tab === "resolved") q = q.eq("resolved", true);
      const { data, error } = await q.returns<Damage[]>();
      if (error) throw error;
      setItems(data || []);

      const { data: eqs } = await supabase
        .from("equipment")
        .select("id, name, replacement_cost")
        .eq("company_id", user.company_id)
        .order("name", { ascending: true })
        .returns<Equipment[]>();
      setEquipment(eqs || []);
    } catch (e) {
      toast({ title: "Could not load damage register", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useFuzzyItems(
    items,
    search,
    [
      { key: "notes" as any, weight: 2 },
      { key: "damage_type" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const open = items.filter((d) => !d.resolved).length;
    const resolved = items.filter((d) => d.resolved).length;
    const cost = items.filter((d) => !d.resolved).reduce((s, d) => s + damageCost(d), 0);
    return { open, resolved, cost };
  }, [items]);

  const openCreate = () => {
    setCreating(true);
    setEquipmentId("");
    setDamageType("damage");
    setNotes("");
    setRepairCost("");
  };
  const closeCreate = () => { setCreating(false); setEquipmentId(""); setDamageType("damage"); setNotes(""); setRepairCost(""); };

  const saveCreate = async () => {
    if (!user?.id || !user?.company_id || !notes.trim()) {
      toast({ title: "Notes are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from("equipment_damages")
        .insert([{
          company_id: user.company_id,
          // Cleaning follow-up (migration 20260521120000): the form's
          // equipment-picker now persists to a real column instead of
          // being silently dropped. Nullable for the case where the
          // cleaner doesn't know which specific item is involved.
          equipment_id: equipmentId || null,
          damage_type: damageType,
          notes: notes.trim(),
          repair_cost: repairCost ? Number(repairCost) : null,
          reported_by: user.id,
          resolved: false,
        }] as never)
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Damage report created" });

      // Phase 3c cleaning sweep: previously the damage row landed in
      // the DB and nobody downstream got told. Kitchen / admin only
      // saw it on their next manual review of the damage ledger,
      // which meant a broken chafing dish at Friday's event was
      // discovered when packing Saturday's equipment. Broadcast to
      // kitchen-aware admin roles so they can replan / re-stock.
      // notification_type 'equipment_shortage' is the existing enum
      // value that already carries the same kitchen-impact semantic
      // (no new enum migration required).
      try {
        const eqLabel = equipmentId
          ? (equipment.find((e) => e.id === equipmentId)?.name || "an item")
          : "an item";
        const costLabel = repairCost ? ` Repair estimate R${Number(repairCost).toFixed(2)}.` : "";
        await notificationService.broadcastNotification({
          companyId: user.company_id,
          targetRoles: ["company_admin", "admin", "owner"] as any,
          title: `Equipment damage logged: ${damageType}`,
          message: `Cleaning reported ${damageType} on ${eqLabel}.${costLabel} ${notes.trim().slice(0, 120)}`,
          type: "equipment_shortage" as any,
          priority: "high",
          link: "/admin/equipment?tab=shortages",
          relatedEntityType: "equipment_damage",
          relatedEntityId: (inserted as any)?.id || null,
          dedup: true,
          dedupWindowMinutes: 60,
        });
      } catch (notifErr) {
        // Non-fatal: the damage row is the source of truth, the
        // notification is the heads-up. Log + continue.
        console.warn("[damage.tsx] notification broadcast failed:", notifErr);
      }

      closeCreate();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const markResolved = async (id: string) => {
    try {
      await supabase.from("equipment_damages").update({ resolved: true }).eq("id", id);
      toast({ title: "Marked resolved" });
      load();
    } catch {
      toast({ title: "Could not update", variant: "destructive" });
    }
  };

  return (
    <>
      <Head><title>Damage reports - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Damage reports"
            subtitle="Track damaged or lost equipment with replacement cost estimates"
            icon={FileWarning}
            actions={
              <Button onClick={openCreate} className="bg-brand-primary hover:bg-brand-primary/90">
                <Plus className="h-4 w-4 mr-2" />Report damage
              </Button>
            }
          />

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <StatTile label="Open reports" value={stats.open} hint="Still need fixing" />
            <StatTile label="Resolved" value={stats.resolved} hint="Closed off" />
            <StatTile
              label="Outstanding cost"
              value={`R ${stats.cost.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
              hint="Across open reports"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(["open", "resolved", "all"] as const).map((t) => (
              <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)} className={tab === t ? "bg-brand-primary hover:bg-brand-primary/90 capitalize" : "capitalize"}>
                {t}
              </Button>
            ))}
            <div className="ml-auto relative max-w-xs flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input className="pl-9 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <PortalCard padded={false}>
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading damage reports">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-medium">No damage reports{tab !== "all" ? ` (${tab})` : ""}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((d) => {
                  // Cleaning follow-up: now that equipment_id
                  // persists, surface the equipment name on the
                  // ledger row so admins can correlate damages with
                  // specific items at a glance. Fall back to no chip
                  // for legacy rows (equipment_id NULL).
                  const eq = d.equipment_id
                    ? equipment.find((e) => e.id === d.equipment_id)
                    : null;
                  return (
                  <li key={d.id} className="p-4 flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${d.resolved ? "text-emerald-500 dark:text-emerald-400" : "text-amber-500 dark:text-amber-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className={`${typeTone[d.damage_type ?? ""] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"} text-xs capitalize`}>{d.damage_type ?? "damage"}</Badge>
                        {eq?.name && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs font-medium">
                            {eq.name}{damageQty(d) > 1 ? ` x${damageQty(d)}` : ""}
                          </Badge>
                        )}
                        {d.resolved ? (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900 text-xs">Resolved</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900 text-xs">Open</Badge>
                        )}
                        {damageCost(d) > 0 && (
                          <span className="text-xs tabular-nums font-semibold text-rose-700 dark:text-rose-300">R {damageCost(d).toFixed(2)}</span>
                        )}
                        {d.created_at && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                        )}
                      </div>
                      {/* Event + client context so this reads as a billable line:
                          which event it happened on + who to charge. */}
                      {(d.order?.order_number || d.order?.event_name || d.order?.client_name) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          {d.order?.order_number && (
                            <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{d.order.order_number}</span>
                          )}
                          {d.order?.event_name && d.order.event_name !== "Untitled" && (
                            <span>{d.order.event_name}</span>
                          )}
                          {d.order?.event_date && (
                            <span className="inline-flex items-center gap-1"><CalendarIcon className="w-3 h-3" />{d.order.event_date}</span>
                          )}
                          {d.order?.client_name && (
                            <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{d.order.client_name}</span>
                          )}
                        </div>
                      )}
                      {damageDescription(d) && <p className="text-sm text-slate-700 dark:text-slate-300">{damageDescription(d)}</p>}
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        {d.responsible_name && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">Reported by {d.responsible_name}</span>
                        )}
                        {d.photo_url && (
                          <a href={d.photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline">
                            <ImageIcon className="w-3 h-3" /> View photo
                          </a>
                        )}
                      </div>
                    </div>
                    {!d.resolved && (
                      <Button size="sm" variant="ghost" onClick={() => markResolved(d.id)}>
                        <Check className="h-4 w-4 mr-1" />Resolve
                      </Button>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </PortalCard>
        </PortalShell>
      </main>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report damage</DialogTitle>
            <DialogDescription>Capture damaged or missing equipment after a function</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="eq">Equipment (optional)</Label>
              <Select value={equipmentId} onValueChange={(v) => {
                setEquipmentId(v);
                const eq = equipment.find((e) => e.id === v);
                if (eq?.replacement_cost) setRepairCost(String(eq.replacement_cost));
              }}>
                <SelectTrigger id="eq"><SelectValue placeholder="Pick item if applicable" /></SelectTrigger>
                <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dt">Type</Label>
              <Select value={damageType} onValueChange={setDamageType}>
                <SelectTrigger id="dt"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                  <SelectItem value="worn">Worn</SelectItem>
                  <SelectItem value="cosmetic">Cosmetic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nt">Description</Label>
              <Textarea id="nt" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, where, and how bad" />
            </div>
            <div>
              <Label htmlFor="rc">Repair / replacement cost (R)</Label>
              <Input id="rc" type="number" min="0" step="0.01" value={repairCost} onChange={(e) => setRepairCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button>
            <Button onClick={saveCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
