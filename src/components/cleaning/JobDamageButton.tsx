/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * JobDamageButton - contextual "Flag damaged" entry point on a single
 * cleaning job.
 *
 * The standalone DamageFlagForm (/team-portal/cleaning/damage) makes the
 * cleaner re-pick the equipment + order from dropdowns. When they're stood
 * at a specific job ("108x Bowl from the Smith wedding") that's friction.
 * This button opens a tight dialog ALREADY scoped to that job's equipment +
 * order, so the cleaner only sets quantity, type, reason, and an optional
 * photo, then submits. Same equipmentTrackingService.reportDamage path, so
 * inventory deduction + admin/kitchen/cleaning notifications fire identically.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, Camera, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { equipmentTrackingService, type DamageType, type HandoverStage } from "@/services/equipmentTrackingService";
import { emitEquipmentDamaged } from "@/lib/events/equipmentEvents";
import { reporterNameFromUser } from "@/lib/damageReporter";

const DAMAGE_TYPES: Array<{ value: DamageType; label: string }> = [
  { value: "broken", label: "Broken" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "stolen", label: "Stolen" },
];

interface Props {
  equipmentId: string;
  equipmentName: string;
  orderId: string;
  /** Job quantity - caps the damage qty so the cleaner can't flag more than came back. */
  maxQuantity: number;
  handoverId?: string;
  onFlagged?: () => void;
}

export function JobDamageButton({ equipmentId, equipmentName, orderId, maxQuantity, handoverId, onFlagged }: Props) {
  const { user } = useAuth() as any;
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [damageType, setDamageType] = useState<DamageType>("broken");
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const companyId: string | null = user?.company_id || user?.user_metadata?.company_id || null;

  // Pull the replacement_cost when the dialog opens so the cost impact +
  // the damage record's unit_cost are accurate. Best-effort - defaults to 0.
  useEffect(() => {
    if (!open || !equipmentId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("equipment")
        .select("replacement_cost")
        .eq("id", equipmentId)
        .maybeSingle();
      if (!cancelled) setUnitCost(Number((data as any)?.replacement_cost || 0));
    })();
    return () => { cancelled = true; };
  }, [open, equipmentId]);

  const handlePhotoPick = (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const reset = () => {
    setDamageType("broken");
    setQuantity(1);
    setReason("");
    handlePhotoPick(null);
  };

  const cap = Math.max(1, Number(maxQuantity || 1));
  const costImpact = unitCost * Math.max(0, quantity || 0);
  const canSubmit = !!reason.trim() && quantity > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Upload the photo first (if any) so its URL lands on the initial
      // damage insert - same pattern as DamageFlagForm.
      let resolvedPhotoUrl: string | undefined;
      if (photoFile && companyId) {
        const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const photoPath = `${companyId}/${orderId}/${Date.now()}-damage.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("equipment-damage-photos")
          .upload(photoPath, photoFile, { upsert: true, contentType: photoFile.type });
        if (upErr) {
          console.error("[JobDamageButton] photo upload failed:", upErr);
          toast({ title: "Photo upload failed", description: "Saving the flag without the photo.", variant: "destructive" });
        } else {
          const { data: pub } = supabase.storage.from("equipment-damage-photos").getPublicUrl(photoPath);
          if (pub?.publicUrl) resolvedPhotoUrl = pub.publicUrl;
        }
      }

      await equipmentTrackingService.reportDamage({
        orderId,
        equipmentId,
        handoverId,
        quantityDamaged: quantity,
        damageType,
        damageStage: "return" as HandoverStage,
        unitCost,
        responsibleUserId: user?.id,
        responsibleName: reporterNameFromUser(user),
        description: reason.trim(),
        photoUrl: resolvedPhotoUrl,
      });

      emitEquipmentDamaged({ equipmentId, damageType, quantity, orderId, source: "cleaning/JobDamageButton" });

      toast({
        title: "Damage flagged",
        description: `${quantity}x ${equipmentName} marked ${damageType}, pulled from stock. Team notified.`,
      });
      reset();
      setOpen(false);
      onFlagged?.();
    } catch (e: any) {
      console.error("[JobDamageButton] submit failed:", e);
      toast({ title: "Could not flag damage", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-xs h-8 gap-1 text-rose-700 border-rose-200 hover:bg-rose-50"
        title="Flag this item as damaged or lost"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Flag
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
              Flag damaged: {equipmentName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Damage type</Label>
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
              <Label htmlFor="jdb-qty">Quantity (of {cap})</Label>
              <Input
                id="jdb-qty"
                type="number"
                min={1}
                max={cap}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(cap, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jdb-reason">What happened?</Label>
              <Textarea
                id="jdb-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Brief description - cracked rim, never came back, etc."
              />
            </div>

            <div className="space-y-2">
              <Label>Photo (optional)</Label>
              {photoPreview ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Damage preview" className="rounded-lg border border-slate-200 max-h-40 object-cover" />
                  <button
                    type="button"
                    onClick={() => handlePhotoPick(null)}
                    className="absolute -top-2 -right-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-slate-300 text-slate-700 shadow"
                    aria-label="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="jdb-photo"
                  className="flex items-center justify-center gap-2 min-h-11 px-4 rounded-md border border-dashed border-slate-300 text-sm text-slate-600 cursor-pointer hover:bg-slate-50"
                >
                  <Camera className="w-4 h-4" />
                  Tap to take a photo
                  <input
                    id="jdb-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => handlePhotoPick(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>

            {unitCost > 0 && (
              <p className="text-xs text-slate-500">
                Estimated cost impact: <span className="font-semibold text-rose-600">R{costImpact.toFixed(2)}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-rose-600 hover:bg-rose-700 gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {submitting ? "Flagging..." : "Flag damage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
