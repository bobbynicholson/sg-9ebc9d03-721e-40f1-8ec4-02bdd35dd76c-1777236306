/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: file attachments tied to an order.
 *
 * Renders a list of attachments (contracts, dietary forms, venue
 * photos, signed POD scans, etc) with an upload affordance for
 * staff. Each row is a one-click signed-URL download.
 *
 * Storage: `order-attachments` bucket, path
 *   {company_id}/{order_id}/{uuid}_{filename}
 * Metadata: public.order_attachments table.
 *
 * RLS scopes everything by company_id. Client-visible attachments
 * (is_client_visible) optionally surface on the magic-link client
 * portal too - default off, so internal docs stay internal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, Loader2, Trash2, Download, FileText, FileImage, FileSignature } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

interface AttachmentRow {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  is_client_visible: boolean;
  kind: string;
  created_at: string;
  uploaded_by_user_id: string | null;
  uploader?: { full_name: string | null } | null;
}

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string | null): React.ComponentType<{ className?: string }> {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return FileImage;
  if (mime === "application/pdf") return FileSignature;
  return FileText;
}

export function AttachmentsSection({ orderId, companyId, defaultOpen, forceOpen }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Only the first load for an order shows the spinner. Live updates refresh
  // the rows in place so the section does not blink.
  const shownOrderRef = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (shownOrderRef.current !== orderId) setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("order_attachments")
        .select("id, file_name, storage_path, mime_type, size_bytes, description, is_client_visible, kind, created_at, uploaded_by_user_id, uploader:uploaded_by_user_id(full_name)")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data || []) as AttachmentRow[]);
      shownOrderRef.current = orderId;
      setLoadError(false);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadAttachments", orderId, companyId } });
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId, companyId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: new uploads from elsewhere should appear here.
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-doc-attachments:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_attachments", filter: `order_id=eq.${orderId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, load]);

  const onUpload = async (file: File) => {
    if (!user?.id) return;
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: `${file.name} is over the 25 MB limit.`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Deterministic path: {company_id}/{order_id}/{uuid}_{slug}
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const objectKey = `${companyId}/${orderId}/${crypto.randomUUID()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("order-attachments")
        .upload(objectKey, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await (supabase as any)
        .from("order_attachments")
        .insert({
          company_id: companyId,
          order_id: orderId,
          uploaded_by_user_id: user.id,
          kind: "document",
          file_name: file.name,
          storage_path: objectKey,
          mime_type: file.type || null,
          size_bytes: file.size,
          is_client_visible: false,
        });
      if (insErr) throw insErr;

      toast({ title: "Uploaded", description: file.name });
      load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "uploadAttachment", orderId, companyId } });
      toast({ title: "Upload failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (row: AttachmentRow) => {
    try {
      const { data, error } = await supabase.storage
        .from("order-attachments")
        .createSignedUrl(row.storage_path, 60);
      if (error || !data?.signedUrl) throw error || new Error("No URL");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "downloadAttachment", orderId } });
      toast({ title: "Could not open", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const onDelete = async (row: AttachmentRow) => {
    if (!confirm(`Delete ${row.file_name}?`)) return;
    setDeletingId(row.id);
    try {
      // Soft-delete the row, then best-effort remove from storage.
      const { error: dbErr } = await (supabase as any)
        .from("order_attachments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", row.id);
      if (dbErr) throw dbErr;
      // Storage cleanup is best-effort - if it fails the row is
      // already hidden by the soft-delete.
      supabase.storage.from("order-attachments").remove([row.storage_path]).catch(() => {});
      load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "deleteAttachment", orderId } });
      toast({ title: "Could not delete", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const summary = loading
    ? "Loading..."
    : loadError ? "Unable to load files"
    : rows.length === 0
      ? "No files attached"
      : `${rows.length} file${rows.length === 1 ? "" : "s"}`;

  return (
    <CollapsibleSection
      id="section-attachments"
      title="Attachments"
      summary={summary}
      icon={Paperclip}
      accent="slate"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-auto min-h-[44px] max-w-full whitespace-normal"
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? "Uploading…" : "Upload file"}
          </Button>
          <p className="text-sm text-slate-600">Up to 25 MB per file</p>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void onUpload(file);
              event.currentTarget.value = "";
            }}
            disabled={uploading}
          />
        </div>

        {loading ? (
          <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-600">
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> Loading attachments…
          </p>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
            <p>Attachments could not be loaded.</p>
            <Button type="button" variant="outline" className="h-auto min-h-[44px] max-w-full whitespace-normal print:hidden" onClick={() => void load()}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No files attached to this order.</p>
        ) : (
          <ul className="divide-y divide-slate-200 border-t border-slate-200" aria-label="Order files">
            {rows.map((row) => {
              const Icon = iconFor(row.mime_type);
              const addedOn = new Date(row.created_at);
              const size = fmtSize(row.size_bytes);
              return (
                <li key={row.id} className="flex min-w-0 flex-wrap items-start justify-between gap-2 py-3">
                  <div className="flex min-w-0 flex-[1_1_12rem] items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{row.file_name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-slate-600">
                        {size && <span>{size}</span>}
                        <time dateTime={row.created_at}>{addedOn.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</time>
                        {row.uploader?.full_name && <span>{row.uploader.full_name}</span>}
                      </p>
                      {row.is_client_visible && <p className="mt-1 text-sm font-medium text-brand-primary">Visible to client</p>}
                    </div>
                  </div>
                  <div className="flex max-w-full flex-wrap gap-1 print:hidden">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => onDownload(row)}
                      className="h-11 w-11 min-h-[44px] min-w-[44px]"
                      aria-label={`Download ${row.file_name}`}
                      title="Download"
                    >
                      <Download />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(row)}
                      disabled={deletingId === row.id}
                      className="h-11 w-11 min-h-[44px] min-w-[44px] text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      aria-label={`Delete ${row.file_name}`}
                      title="Delete"
                    >
                      {deletingId === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
