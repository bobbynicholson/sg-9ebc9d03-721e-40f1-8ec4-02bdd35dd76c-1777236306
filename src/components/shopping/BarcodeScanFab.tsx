/**
 * BarcodeScanFab - SHP2-H (shopping deep audit, SHP2-22)
 *
 * Floating camera button on the shopping dashboard. Tap opens a
 * sheet with the device camera + a ZXing barcode reader; a recognised
 * EAN / UPC / QR is matched against inventory_items.barcode for the
 * current tenant.
 *
 * Match -> onScanMatch fires with the inventory_item_id; the parent
 * (ShoppingDashboardInner) finds the matching shopping_list_items
 * row and toggles purchased=true via the existing hook.
 *
 * No match -> shows an inline "Not on your list - tap to add" link
 * to /buy-list with the barcode prefilled in the query string.
 *
 * Camera permission denied -> fallback to a text input "Enter
 * barcode manually" so a shopper with a faulty camera, an iPad with
 * no rear camera, or a permission-blocked browser can still scan
 * via the supplier's printed sticker.
 *
 * Bundle weight: @zxing/library is ~700KB compressed. Loaded via
 * dynamic import() the first time the FAB is tapped so the shopper
 * dashboard's first-paint stays light.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Camera, X, Keyboard, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import Link from "next/link";

interface Props {
  companyId: string | null;
  onScanMatch: (inventoryItemId: string, barcode: string) => Promise<void> | void;
  visible: boolean;
}

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "scanning" }
  | { kind: "denied"; reason: string }
  | { kind: "unsupported"; reason: string };

export function BarcodeScanFab({ companyId, onScanMatch, visible }: Props) {
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [open, setOpen] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>({ kind: "idle" });
  const [manualBarcode, setManualBarcode] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [noMatchBarcode, setNoMatchBarcode] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<any | null>(null);

  useEffect(() => {
    if (!open) {
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch { /* best-effort */ }
        readerRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        try {
          const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach((t) => t.stop());
        } catch { /* non-fatal */ }
        videoRef.current.srcObject = null;
      }
      setCameraState({ kind: "idle" });
      setNoMatchBarcode(null);
    }
  }, [open]);

  const lookupBarcode = async (raw: string): Promise<{ id: string; name: string } | null> => {
    if (!companyId) return null;
    const code = raw.trim();
    if (!code) return null;
    const sb = supabase as any;
    const { data: exact, error: exactErr } = await sb
      .from("inventory_items")
      .select("id, item_name")
      .eq("company_id", companyId)
      .eq("barcode", code)
      .is("deleted_at", null)
      .maybeSingle();
    if (exactErr) console.warn("[BarcodeScanFab] exact lookup failed:", exactErr);
    if (exact) return { id: exact.id, name: exact.item_name };
    if (code.length >= 8) {
      const { data: suffix, error: suffixErr } = await sb
        .from("inventory_items")
        .select("id, item_name, barcode")
        .eq("company_id", companyId)
        .ilike("barcode", `%${code}`)
        .is("deleted_at", null)
        .limit(2);
      if (suffixErr) console.warn("[BarcodeScanFab] suffix lookup failed:", suffixErr);
      const rows = (suffix || []) as Array<{ id: string; item_name: string; barcode: string }>;
      if (rows.length === 1) return { id: rows[0].id, name: rows[0].item_name };
    }
    return null;
  };

  const handleScannedCode = async (raw: string) => {
    setLookingUp(true);
    try {
      const match = await lookupBarcode(raw);
      if (match) {
        toast({ title: `Ticked: ${match.name}`, description: "Marked bought + saved." });
        try { (navigator as any).vibrate?.(80); } catch { /* no-op */ }
        await onScanMatch(match.id, raw);
        setOpen(false);
      } else {
        setNoMatchBarcode(raw);
      }
    } finally {
      setLookingUp(false);
    }
  };

  const startScanner = async () => {
    setCameraState({ kind: "requesting" });
    setNoMatchBarcode(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraState({ kind: "unsupported", reason: "This browser doesn't expose a camera API. Use the manual entry below." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraState({ kind: "scanning" });
      const zxing = await import("@zxing/library");
      const reader = new (zxing as any).BrowserMultiFormatReader();
      readerRef.current = reader;
      reader.decodeFromVideoElement(videoRef.current, (result: any, err: any) => {
        if (result) {
          const text = result.getText();
          if (text) void handleScannedCode(text);
        }
        if (err && err.name !== "NotFoundException") {
          console.warn("[BarcodeScanFab] decode warning:", err.name || err);
        }
      });
    } catch (e: unknown) {
      const error = e as { name?: string; message?: string };
      if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
        setCameraState({ kind: "denied", reason: "Camera permission denied. Use the manual entry below." });
      } else {
        setCameraState({ kind: "denied", reason: error?.message || "Could not open the camera. Use the manual entry below." });
      }
    }
  };

  const handleManualSubmit = async () => {
    const code = manualBarcode.trim();
    if (!code) return;
    await handleScannedCode(code);
    setManualBarcode("");
  };

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => { void startScanner(); }, 50);
        }}
        className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-40 inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-xl ring-4 ring-amber-100 transition focus:outline-none focus:ring-amber-200"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Scan a barcode to tick an item bought"
        title="Scan a barcode"
      >
        <Camera className="w-6 h-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-amber-600" />
              Scan a barcode
            </SheetTitle>
            <SheetDescription>
              Point your camera at the product barcode. A match ticks the item bought automatically.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {cameraState.kind === "scanning" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-amber-400 rounded-lg w-3/4 h-1/2 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
              )}
              {cameraState.kind === "idle" && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">Starting camera...</div>
              )}
              {cameraState.kind === "requesting" && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">Asking for camera access...</div>
              )}
              {lookingUp && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                  <p className="text-sm">Looking up...</p>
                </div>
              )}
            </div>

            {(cameraState.kind === "denied" || cameraState.kind === "unsupported") && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <Keyboard className="w-4 h-4" />
                  Manual entry
                </p>
                <p className="text-xs mt-1">{cameraState.reason}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="barcode-manual" className="text-xs uppercase tracking-wide font-semibold text-slate-700">
                Or type the barcode
              </label>
              <div className="flex gap-2">
                <Input
                  id="barcode-manual"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="e.g. 6001120121234"
                  className="flex-1 min-h-11"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleManualSubmit();
                    }
                  }}
                  disabled={lookingUp}
                />
                <Button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={lookingUp || !manualBarcode.trim()}
                  className="min-h-11 bg-amber-600 hover:bg-amber-700"
                >
                  Tick
                </Button>
              </div>
            </div>

            {noMatchBarcode && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900 space-y-2">
                <p className="font-semibold">Not on your list yet</p>
                <p className="text-xs">
                  Barcode <code className="bg-white px-1 py-0.5 rounded border border-rose-200">{noMatchBarcode}</code> isn't linked to any inventory item for your tenant.
                </p>
                <Link
                  href={withSlug(`/team-portal/shopping/buy-list?barcode=${encodeURIComponent(noMatchBarcode)}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-md bg-rose-600 text-white hover:bg-rose-700 text-sm font-medium"
                  onClick={() => setOpen(false)}
                >
                  Add to buy list
                </Link>
              </div>
            )}
          </div>

          <div className="border-t px-4 py-3 flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} className="min-h-11">
              <X className="w-4 h-4 mr-1.5" />
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
