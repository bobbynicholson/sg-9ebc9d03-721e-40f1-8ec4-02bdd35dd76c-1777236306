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
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, Loader2, Trash2, Download, AlertCircle, FileText, FileImage, FileSignature } from "lucide-react";

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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("order_attachments")
        .select("id, file_name, storage_path, mime_type, size_bytes, description, is_client_visible, kind, created_at, uploaded_by_user_id, uploader:uploaded_by_user_id(full_name)")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data || []) as AttachmentRow[]);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadAttachments", orderId, companyId } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

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
      <div className="space-y-3">
        {/* Upload affordance - hidden file input + styled label so the
            button looks like a primary action. */}
        <label
          htmlFor={`attach-file-${orderId}`}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold cursor-pointer ${uploading ? "bg-slate-200 text-slate-500 cursor-wait" : "bg-slate-900 text-white hover:bg-slate-800"}`}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading..." : "Upload file"}
          <input
            id={`attach-file-${orderId}`}
            type="file"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
            disabled={uploading}
          />
        </label>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading attachments...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-start gap-2 p-3 rounded-md bg-slate-50 border border-slate-200">
            <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-700">No files yet</p>
              <p className="text-xs text-slate-500 mt-0.5">Attach signed contracts, dietary forms, venue maps, or anything else operators need on this order.</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const Icon = iconFor(r.mime_type);
              return (
                <li key={r.id} className="flex items-center gap-3 p-2.5 rounded-md border border-slate-200 bg-white">
                  <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.file_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {fmtSize(r.size_bytes)}
                      {r.uploader?.full_name && <span> · {r.uploader.full_name}</span>}
                      <span> · {new Date(r.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {r.is_client_visible && <span className="ml-1 text-brand-primary">· Client visible</span>}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(r)}
                    className="h-7 text-xs"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(r)}
                    disabled={deletingId === r.id}
                    className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                    title="Delete"
                  >
                    {deletingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
