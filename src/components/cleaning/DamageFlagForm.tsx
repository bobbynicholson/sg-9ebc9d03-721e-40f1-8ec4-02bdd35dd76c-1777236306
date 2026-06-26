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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, Camera, Mic, MicOff, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { equipmentTrackingService, type DamageType, type HandoverStage } from "@/services/equipmentTrackingService";
import { emitEquipmentDamaged } from "@/lib/events/equipmentEvents";
import { reporterNameFromUser } from "@/lib/damageReporter";

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
  // CLN2-H (CLN2-69): camera capture. The cleaner picks an image via
  // <input capture="environment"> which opens the back camera on a
  // phone and the file picker on desktop. We upload on submit so the
  // cleaner can swap photos before committing.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // CLN2-H (CLN2-71): voice note dictation for the reason field.
  // Cleaner taps the mic, narrates the damage ("rim cracked, fell
  // off the trolley"), Web Speech API converts to text and appends
  // to the textarea. Wet hands + tablet = typing is a non-starter
  // for the long-form description, so this is the highest-leverage
  // place to wire dictation in the cleaning portal.
  const [listening, setListening] = useState(false);
  const [supportsSpeech, setSupportsSpeech] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    setSupportsSpeech(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    recogRef.current = null;
    setListening(false);
  }, []);
  const startListening = useCallback(() => {
    const w = window as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      SpeechRecognition?: new () => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webkitSpeechRecognition?: new () => any;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      toast({
        title: "Voice not supported",
        description: "Use Chrome or Edge on the tablet to dictate.",
        variant: "destructive",
      });
      return;
    }
    const r = new Ctor();
    r.lang = "en-GB";
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (ev: any) => {
      const transcript = ev.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setReason((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
      }
    };
    r.onerror = () => { stopListening(); };
    r.onend = () => { setListening(false); recogRef.current = null; };
    recogRef.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      // Already started or browser blocked; the recognition handlers
      // will reset listening state anyway.
      stopListening();
    }
  }, [toast, stopListening]);
  useEffect(() => () => { stopListening(); }, [stopListening]);

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

  // CLN2-H camera capture: file picked from <input>. We revoke the
  // prior preview URL to avoid leaking object URLs when the user
  // re-shoots before submit.
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

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // CLN2-H (CLN2-69): if the cleaner captured a photo, upload it
      // to the equipment-damage-photos bucket first and use the
      // resulting public URL on the damage record. We do this BEFORE
      // reportDamage so the photo url is attached on the initial
      // insert - no follow-up update / orphan-row risk.
      let resolvedPhotoUrl = photoUrl.trim() || undefined;
      if (photoFile && companyId) {
        const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const photoPath = `${companyId}/${orderId}/${Date.now()}-damage.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("equipment-damage-photos")
          .upload(photoPath, photoFile, { upsert: true, contentType: photoFile.type });
        if (upErr) {
          console.error("[DamageFlagForm] photo upload failed:", upErr);
          toast({
            title: "Photo upload failed",
            description: "Saving damage flag without the photo.",
            variant: "destructive",
          });
        } else {
          const { data: pub } = supabase.storage
            .from("equipment-damage-photos")
            .getPublicUrl(photoPath);
          if (pub?.publicUrl) resolvedPhotoUrl = pub.publicUrl;
        }
      }

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
        responsibleName: reporterNameFromUser(user),
        description: reason.trim(),
        photoUrl: resolvedPhotoUrl,
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
      handlePhotoPick(null);
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

          {/* CLN2-H (CLN2-71): voice dictation. The mic button is
              gated on Web Speech API support so unsupported tablets
              just see the textarea unchanged. While listening, a red
              recording badge + MicOff icon doubles as "tap to stop". */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="dmg-reason">What happened?</Label>
              {supportsSpeech && (
                <Button
                  type="button"
                  size="sm"
                  variant={listening ? "destructive" : "outline"}
                  onClick={listening ? stopListening : startListening}
                  className="gap-1.5 min-h-11"
                  aria-label={listening ? "Stop dictation" : "Dictate the description"}
                >
                  {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {listening ? "Listening..." : "Dictate"}
                </Button>
              )}
            </div>
            <Textarea
              id="dmg-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief description - cracked rim, never returned, etc."
            />
          </div>

          {/* CLN2-H (CLN2-69): in-field camera capture. The label is
              also the tap target so phones open the camera straight
              to the back lens via capture="environment". Desktop falls
              back to a normal file picker. URL input stays as a paste
              fallback for the case where someone already has a hosted
              link (DM photo, drive link). */}
          <div className="space-y-2 md:col-span-2">
            <Label>Photo (optional)</Label>
            {photoPreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Damage preview"
                  className="rounded-lg border border-slate-200 max-h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => handlePhotoPick(null)}
                  className="absolute -top-2 -right-2 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-300 text-slate-700 shadow"
                  aria-label="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="dmg-photo-file"
                className="flex items-center justify-center gap-2 min-h-11 px-4 rounded-md border border-dashed border-slate-300 text-sm text-slate-600 cursor-pointer hover:bg-slate-50"
              >
                <Camera className="w-4 h-4" />
                Tap to take a photo
                <input
                  id="dmg-photo-file"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => handlePhotoPick(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <Input
              id="dmg-photo"
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="Or paste a photo link"
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
