import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
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
import { AlertTriangle, Plus, Loader2, Search, Check, FileWarning } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CleaningNav } from "@/components/navigation/CleaningNav";
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
  created_at: string | null;
}

interface Equipment { id: string; name: string | null; replacement_cost: number | null; }

const typeTone: Record<string, string> = {
  damage:     "bg-amber-100 text-amber-800 border-amber-200",
  missing:    "bg-rose-100 text-rose-700 border-rose-200",
  broken:     "bg-rose-100 text-rose-700 border-rose-200",
  worn:       "bg-slate-100 text-slate-700 border-slate-200",
  cosmetic:   "bg-blue-100 text-blue-800 border-blue-200",
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
        .select("*")
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
    const cost = items.filter((d) => !d.resolved).reduce((s, d) => s + Number(d.repair_cost || 0), 0);
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
      <Head><title>Damage Reports - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            {/* Wave 38: gradient-box icon header for cleaning portal
                consistency (mirrors Wave 34 shopping fix). */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-md flex-shrink-0">
                <FileWarning className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                  Damage Reports
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">Track damaged or lost equipment with replacement cost estimates</p>
              </div>
            </div>
            <Button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700">
              <Plus className="h-4 w-4 mr-2" />Report damage
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Open reports <InfoTooltip content="How many damage or loss reports are still open and need fixing." /></p><p className="text-2xl font-bold tabular-nums text-amber-600">{stats.open}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Resolved <InfoTooltip content="Reports that have been closed off because the item was repaired, replaced or written off." /></p><p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.resolved}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Outstanding cost <InfoTooltip content="Total repair or replacement cost across reports that haven't been closed yet." /></p><p className="text-2xl font-bold tabular-nums">R {stats.cost.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}</p></CardContent></Card>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(["open", "resolved", "all"] as const).map((t) => (
              <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)} className={tab === t ? "bg-cyan-600 hover:bg-cyan-700 capitalize" : "capitalize"}>
                {t}
              </Button>
            ))}
            <div className="ml-auto relative max-w-xs flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No damage reports{tab !== "all" ? ` (${tab})` : ""}</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((d) => (
                    <li key={d.id} className="p-4 flex items-start gap-3">
                      <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${d.resolved ? "text-emerald-500" : "text-amber-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="outline" className={`${typeTone[d.damage_type ?? ""] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs capitalize`}>{d.damage_type ?? "damage"}</Badge>
                          {d.resolved ? (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Resolved</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 text-xs">Open</Badge>
                          )}
                          {d.repair_cost != null && (
                            <span className="text-xs tabular-nums text-slate-700">R {Number(d.repair_cost).toFixed(2)}</span>
                          )}
                          {d.created_at && (
                            <span className="text-[11px] text-slate-500">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                          )}
                        </div>
                        {d.notes && <p className="text-sm text-slate-700">{d.notes}</p>}
                      </div>
                      {!d.resolved && (
                        <Button size="sm" variant="ghost" onClick={() => markResolved(d.id)}>
                          <Check className="h-4 w-4 mr-1" />Resolve
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
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
            <Button onClick={saveCreate} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
