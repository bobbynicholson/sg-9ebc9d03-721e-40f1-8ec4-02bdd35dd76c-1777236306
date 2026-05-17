/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, FileSignature, AlertCircle, X, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { emitOrderUpdated } from "@/lib/events/orderEvents";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  clientName?: string;
  onSaved?: () => void;
}

/**
 * POD capture: photo upload + signature pad + recipient name. The driver
 * confirms a successful drop with this dialog. Writes pod_photo_url +
 * pod_signature_url + pod_recipient_name + pod_captured_at on the order
 * row plus marks status delivered.
 */
export function PodCaptureDialog({ open, onOpenChange, orderId, clientName, onSaved }: Props) {
  const { toast } = useToast();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Signature pad state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhotoFile(null);
    setPhotoPreview(null);
    setRecipientName("");
    setError("");
    setHasSignature(false);
    // Clear the canvas when re-opening
    setTimeout(() => clearCanvas(), 50);
  }, [open]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else {
      return { x: 0, y: 0 };
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  };

  const drawMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDraw = () => { drawingRef.current = false; };

  const onPhotoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Photo must be an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Photo too large (max 10MB).");
      return;
    }
    setError("");
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Convert canvas to PNG blob for upload
  const signatureBlob = (): Promise<Blob | null> => new Promise(resolve => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) { resolve(null); return; }
    canvas.toBlob(b => resolve(b), "image/png");
  });

  const handleSave = async () => {
    if (!photoFile) { setError("Please add a delivery photo."); return; }
    if (!recipientName.trim()) { setError("Please enter who received the order."); return; }

    setSaving(true);
    setError("");
    try {
      // Upload photo
      const photoExt = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const photoPath = `orders/${orderId}/photo-${Date.now()}.${photoExt}`;
      const { error: photoErr } = await supabase.storage
        .from("pod")
        .upload(photoPath, photoFile, { upsert: true, contentType: photoFile.type });
      if (photoErr) throw photoErr;
      const { data: photoUrl } = supabase.storage.from("pod").getPublicUrl(photoPath);

      // Upload signature (optional but expected)
      let sigPublicUrl: string | null = null;
      const sigBlob = await signatureBlob();
      if (sigBlob) {
        const sigPath = `orders/${orderId}/signature-${Date.now()}.png`;
        const { error: sigErr } = await supabase.storage
          .from("pod")
          .upload(sigPath, sigBlob, { upsert: true, contentType: "image/png" });
        if (sigErr) throw sigErr;
        const { data: sigUrl } = supabase.storage.from("pod").getPublicUrl(sigPath);
        sigPublicUrl = sigUrl.publicUrl;
      }

      // Wave 45 D2 -- two-step write so the status flip routes
      // through orderWorkflow.updateOrderStatus and triggers the
      // full side-effect cascade (status_history, audit_logs,
      // sendStatusNotifications, POD-missing alert, inventory
      // deduction, equipment cleaning rows, pending_reviews,
      // after-sales scheduler, transition validation). The
      // previous shape wrote status='delivered' raw and silently
      // skipped all of it -- same bug class Wave 5 fixed in
      // confirmDelivery (deliveryManagement.ts:38-52).
      const { error: podErr } = await supabase
        .from("orders")
        .update({
          pod_photo_url: photoUrl.publicUrl,
          pod_signature_url: sigPublicUrl,
          pod_recipient_name: recipientName.trim(),
          pod_captured_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (podErr) throw podErr;
      const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
      const flipResult = await (updateOrderStatus as any)(orderId, "delivered");
      if (flipResult && flipResult.ok === false) {
        throw new Error(flipResult.error || "Status flip to delivered failed");
      }

      toast({ title: "Delivery confirmed", description: clientName ? `${clientName} marked delivered.` : "Order marked delivered." });
      // Wave 70.40 -- POD upload flips status to delivered, stamps
      // delivery time, may cascade equipment-cleaning rows. Big
      // delta -- ping every listener.
      emitOrderUpdated(orderId, "driver:pod-upload", ["status"]);
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Could not save proof of delivery.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600" />
            Confirm delivery{clientName ? ` · ${clientName}` : ""}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Snap a photo of the drop, get the recipient to sign, then save. Marks the order as delivered.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Camera className="w-4 h-4 text-emerald-600" />
              Delivery photo
            </Label>
            {photoPreview ? (
              <div className="relative rounded-md overflow-hidden border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Delivery" className="w-full h-48 object-cover" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-7 w-7 p-0 bg-white/90 hover:bg-white"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center h-32 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer">
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoPicked} />
                <div className="text-center">
                  <Camera className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm text-slate-600 font-medium">Tap to take photo</p>
                  <p className="text-xs text-slate-500">or pick from library</p>
                </div>
              </label>
            )}
          </div>

          {/* Signature pad */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <FileSignature className="w-4 h-4 text-emerald-600" />
                Signature
              </Label>
              {hasSignature && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearCanvas}>
                  <Eraser className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </div>
            <div className="rounded-md border-2 border-slate-300 bg-white touch-none">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full h-32 cursor-crosshair touch-none rounded-[5px]"
                onMouseDown={startDraw}
                onMouseMove={drawMove}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={drawMove}
                onTouchEnd={stopDraw}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Optional but recommended.</p>
          </div>

          {/* Recipient */}
          <div>
            <Label htmlFor="pod_recipient">Received by *</Label>
            <Input
              id="pod_recipient"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              placeholder="Name of the person who took delivery"
              className="mt-1"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Saving..." : "Confirm delivered"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
