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

/**
 * localStorage key marking a POD capture in progress. Written when the
 * dialog opens, cleared on explicit close or successful save. The
 * driver dashboard reads it on mount to reopen an interrupted capture
 * (page killed while the native camera was open). Value:
 * {"orderId": "...", "at": epoch-ms}.
 */
export const POD_PENDING_KEY = "cms-pod-pending";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  clientName?: string;
  onSaved?: () => void;
  /**
   * Optional capture handler. When supplied, the dialog uploads the
   * photo + signature and hands the URLs back to the caller instead of
   * doing its own orders update + delivered flip. Used by the driver
   * "Setup completed" flow, where the write must route through
   * completeSetupWithPod() so the setup_started driver_confirmation is
   * inserted (that's what stamps setup_started_at) AND the POD is
   * recorded AND the status flips to delivered - all in one consistent
   * path. Without this prop the dialog keeps its original
   * self-contained behaviour.
   */
  onCapture?: (pod: { photoUrl: string; signatureUrl: string | null; recipientName: string }) => Promise<void>;
  /** Header verb override - e.g. "Arrived at venue" vs "Confirm delivery". */
  title?: string;
}

/**
 * POD capture: photo upload + signature pad + recipient name. The driver
 * confirms a successful drop with this dialog. Writes pod_photo_url +
 * pod_signature_url + pod_recipient_name + pod_captured_at on the order
 * row plus marks status delivered.
 */
export function PodCaptureDialog({ open, onOpenChange, orderId, clientName, onSaved, onCapture, title }: Props) {
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
    // Camera-return resilience (Callum, Pic 92). Two protections while
    // a capture is in progress:
    //  1. window.__cmsHoldSwReload - tells the _app service-worker
    //     updater "do not auto-reload right now"; a deploy landing
    //     mid-capture must not eat the photo.
    //  2. localStorage pending marker - if the page dies anyway (some
    //     Androids kill the tab while the native camera is open, and a
    //     hard reload wipes React state), the dashboard finds the
    //     marker on remount and reopens this dialog so the driver can
    //     finish instead of discovering the POD silently vanished.
    // The marker is cleared ONLY on explicit close/save (see
    // handleOpenChange/handleSave), never in unmount cleanup - an
    // unmount-while-open is exactly the failure we want to recover.
    try {
      (window as unknown as { __cmsHoldSwReload?: boolean }).__cmsHoldSwReload = true;
      localStorage.setItem(POD_PENDING_KEY, JSON.stringify({ orderId, at: Date.now() }));
    } catch { /* storage unavailable - degrade to old behaviour */ }
    return () => {
      try {
        (window as unknown as { __cmsHoldSwReload?: boolean }).__cmsHoldSwReload = false;
      } catch { /* ignore */ }
    };
  }, [open]);

  const clearPendingMarker = () => {
    try {
      const raw = localStorage.getItem(POD_PENDING_KEY);
      if (raw && JSON.parse(raw)?.orderId === orderId) {
        localStorage.removeItem(POD_PENDING_KEY);
      }
    } catch { /* ignore */ }
  };

  // All dismiss paths (X, Cancel, Escape) route through here; a
  // deliberate close means the driver abandoned the capture, so the
  // resume marker must go too or the dialog would haunt them on the
  // next reload.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) clearPendingMarker();
    onOpenChange(nextOpen);
  };

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

      if (onCapture) {
        // Caller-owned write path (driver "Arrived at venue" flow). We've
        // uploaded the artefacts; confirmAtVenue() inserts the at_venue
        // confirmation (stamps arrived_at_venue_at), records the POD and
        // flips to delivered in one consistent cascade.
        await onCapture({
          photoUrl: photoUrl.publicUrl,
          signatureUrl: sigPublicUrl,
          recipientName: recipientName.trim(),
        });
      } else {
        // Wave 45 D2 - two-step write so the status flip routes
        // through orderWorkflow.updateOrderStatus and triggers the
        // full side-effect cascade (status_history, audit_logs,
        // sendStatusNotifications, POD-missing alert, inventory
        // deduction, equipment cleaning rows, pending_reviews,
        // after-sales scheduler, transition validation). The
        // previous shape wrote status='delivered' raw and silently
        // skipped all of it - same bug class Wave 5 fixed in
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
      }

      toast({ title: "Delivery confirmed", description: clientName ? `${clientName} marked delivered.` : "Order marked delivered." });
      // Wave 70.40 - POD upload flips status to delivered, stamps
      // delivery time, may cascade equipment-cleaning rows. Big
      // delta - ping every listener.
      emitOrderUpdated(orderId, "driver:pod-upload", ["status"]);
      clearPendingMarker();
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        // Mobile camera fix (owner Callum): tapping "Take photo" opens
        // the native camera (capture="environment"); when it returns,
        // the browser fires a focus/pointer "interact outside" that
        // Radix treats as a dismiss - so the POD dialog vanished the
        // instant the photo came back and nothing could be captured.
        // Block outside-dismiss entirely (the photo + signature are
        // unsaved work you don't want to lose to a stray tap anyway).
        // The X, Cancel and Confirm buttons still close it.
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-primary" />
            {title || "Confirm delivery"}{clientName ? ` · ${clientName}` : ""}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Snap a photo of the drop, get the recipient to sign, then save. Marks the order as delivered.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Camera className="w-4 h-4 text-brand-primary" />
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
                <FileSignature className="w-4 h-4 text-brand-primary" />
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
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
            {saving ? "Saving..." : "Confirm delivered"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
