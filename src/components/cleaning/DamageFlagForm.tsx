/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DamageFlagForm - CLN2-I (cleaner-side slice).
 *
 * Why: the cleaner only needs to flag broken / lost / damaged
 * gear and move on. The full cost-breakdown analytics lives at
 * /admin/equipment as DamageAnalytics. This form is intentionally
 * tight - equipment, type, qty, reason, optional photo URL, and
 * a live cost-impact estimate from replacement_cost * qty.
 *
 * On success it emits cateringms:equipment-damaged so the
 * kitchen dashboard's KIT2-O readiness chip can refetch the
 * cleaning_jobs roll-up without waiting for window focus.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { equipmentTrackingService, type DamageType, type HandoverStage } from "@/services/equipmentTrackingService";
import { emitEquipmentDamaged } from "@/lib/events/equipmentEvents";

interface EquipmentOption {
  id: string;
  name: string | null;
  replacement_cost: number | null;
}

interface OrderOption {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_date: string | null;
}

const DAMAGE_TYPES: Array<{ value: DamageType; label: string }> = [
  { value: "broken", label: "Broken" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "stolen", label: "Stolen" },
];

interface Props {
  onFlagged?: () => void;
}

export function DamageFlagForm({ onFlagged }: Props) {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const companyId: string | null = user?.company_id || user?.user_metadata?.company_id || null;

  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [orderList, setOrderList] = useState<OrderOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [equipmentId, setEquipmentId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [damageType, setDamageType] = useState<DamageType>("broken");
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoadingOptions(true);
    (async () => {
      // Orders limited to the last 30 days + future events so the
      // dropdown doesn't grow forever. A damage is always tied to
      // an order (handover chain) in the current schema.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const [{ data: eq }, { data: ord }] = await Promise.all([
        (supabase as any)
          .from("equipment")
          .select("id, name, replacement_cost")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        (supabase as any)
          .from("orders")
          .select("id, order_number, client_name, event_date")
          .eq("company_id", companyId)
          .gte("event_date", thirtyDaysAgo)
          .order("event_date", { ascending: false })
          .limit(50),
      ]);
      setEquipmentList((eq || []) as EquipmentOption[]);
      setOrderList((ord || []) as OrderOption[]);
      setLoadingOptions(false);
    })();
  }, [companyId]);

  const selectedEquipment = useMemo(
    () => equipmentList.find((e) => e.id === equipmentId) || null,
    [equipmentList, equipmentId],
  );

  const unitCost = Number(selectedEquipment?.replacement_cost || 0);
  const costImpact = unitCost * Math.max(0, quantity || 0);

  const canSubmit = !!equipmentId && !!orderId && quantity > 0 && !!reason.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // damage_stage="return" - this form is the cleaner flagging
      // an item that came back wrong. Driver / kitchen stages flow
      // through their own panels (EquipmentVerificationPanel etc.).
      await equipmentTrackingService.reportDamage({
        orderId,
        equipmentId,
        quantityDamaged: quantity,
        damageType,
        damageStage: "return" as HandoverStage,
        unitCost,
        responsibleUserId: user?.id,
        responsibleName: user?.email || "Cleaning Team",
        description: reason.trim(),
        photoUrl: photoUrl.trim() || undefined,
      });

      emitEquipmentDamaged({
        equipmentId,
        damageType,
        quantity,
        orderId,
        source: "cleaning/DamageFlagForm",
      });

      toast({
        title: "Damage flagged",
        description: `${quantity}x ${selectedEquipment?.name || "equipment"} marked ${damageType}. Admin notified.`,
      });

      setEquipmentId("");
      setOrderId("");
      setQuantity(1);
      setReason("");
      setPhotoUrl("");
      setDamageType("broken");
      onFlagged?.();
    } catch (e: any) {
      console.error("[DamageFlagForm] submit failed:", e);
      toast({
        title: "Could not flag damage",
        description: e?.message || "Try again or contact admin.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="font-semibold">Flag broken or lost equipment</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dmg-equipment">Equipment</Label>
            <select
              id="dmg-equipment"
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Select item</option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || "Unnamed"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmg-order">Order</Label>
            <select
              id="dmg-order"
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Select order</option>
              {orderList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number || o.id.slice(0, 8)} - {o.client_name || "client"}
                  {o.event_date ? ` (${o.event_date})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmg-type">Damage type</Label>
            <div className="flex flex-wrap gap-2">
              {DAMAGE_TYPES.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  size="sm"
                  variant={damageType === t.value ? "default" : "outline"}
                  onClick={() => setDamageType(t.value)}
                  className="min-h-[44px]"
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dmg-qty">Quantity</Label>
            <Input
              id="dmg-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="dmg-reason">What happened?</Label>
            <Textarea
              id="dmg-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief description - cracked rim, never returned, etc."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="dmg-photo">Photo URL (optional)</Label>
            <Input
              id="dmg-photo"
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="Paste a photo link if you have one"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Estimated cost impact</p>
            <p className="text-2xl font-bold text-red-600">
              R{costImpact.toFixed(2)}
            </p>
            {unitCost === 0 && equipmentId ? (
              <Badge variant="outline" className="mt-1 text-xs">
                No replacement cost on file
              </Badge>
            ) : null}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="min-h-[44px] bg-red-600 hover:bg-red-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Flagging...
              </>
            ) : (
              "Flag damage"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
