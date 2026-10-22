import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FolderOpen, FileText, Loader2, Plus, X, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { DOCUMENT_IMPORT_LIMITS, fieldsForTarget, fieldDestination, reviewFromExtraction, validateDocumentReview, documentLineSchema, type CatalogueChoice, type DocumentReview, type DocumentTarget } from "@/lib/documentImport";
import type { ImportGap } from "./ImportReadinessBanner";

type ImportedDocument = { id: string; job_id: string; filename: string; target_table: DocumentTarget; status: string; source_hash: string; version: number; extraction?: any; reviewed_data?: DocumentReview; target_id?: string; setup_completed_at?: string; error_message?: string; readiness?: string[] };
type ImportData = { job: { id: string; source_filename: string; summary: any }; documents: ImportedDocument[]; regions: { id: string; name: string }[]; catalogue: CatalogueChoice[]; currency: string; pricingIncludesVat: boolean };
async function api(url: string, body?: any) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const json = await response.json().catch(() => ({ error: "The server could not finish this request. Refresh and try again." }));
  if (!response.ok) throw Object.assign(new Error(json.error || "Request failed."), { details: json.errors, gaps: json.gaps });
  return json;
}

export function DocumentImportWorkbench({ initialJob, initialDocument, initialTarget = "quotes", onJobChange }: { initialJob?: string; initialDocument?: string; initialTarget?: DocumentTarget; onJobChange?: (id: string) => void }) {
  const { withSlug } = useTenantHref();
  const [target, setTarget] = useState<DocumentTarget>(initialTarget);
  const [data, setData] = useState<ImportData | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState(initialDocument || "");
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [gaps, setGaps] = useState<ImportGap[]>([]);
  const fileRef = useRef<HTMLInputElement>(null), folderRef = useRef<HTMLInputElement>(null);
  const current = data?.documents.find((d) => d.id === selectedId) || data?.documents[0];
  const load = async (jobId: string) => {
    const next = await api(`/api/document-imports/${jobId}`); setData(next);
    setSelectedId((old) => next.documents.some((d: ImportedDocument) => d.id === old) ? old : next.documents[0]?.id || "");
    return next as ImportData;
  };
  useEffect(() => { api("/api/document-imports").then((r) => setJobs(r.jobs)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (initialJob) { setBusy("Loading import…"); load(initialJob).catch((e) => setError(e.message)).finally(() => setBusy("")); } }, [initialJob]);
  useEffect(() => {
    setServerErrors([]); setGaps([]);
    if (!current?.extraction) { setReview(null); return; }
    setReview(current.reviewed_data || reviewFromExtraction(current.extraction, data.catalogue, data.regions.length === 1 ? data.regions[0].id : ""));
    if (current.status === "committed") {
      const query = current.target_table === "orders" ? `orderId=${current.target_id}` : `quoteId=${current.target_id}`;
      api(`/api/document-imports/readiness?${query}`).then((v) => setGaps(v.gaps)).catch((e) => setError(e.message));
    }
  }, [current?.id, current?.version, current?.status, current?.setup_completed_at]);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(""); setNotice(""); setServerErrors([]);
    try { await action(); } catch (e: any) { setError(e.message); setServerErrors(e.details || []); if (e.gaps) setGaps(e.gaps); }
    finally { setBusy(""); }
  };
  const upload = (all: FileList | File[]) => run("Checking PDFs…", async () => {
    const files = Array.from(all).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) throw new Error("Choose PDF files, or a folder containing PDFs.");
    if (files.length > DOCUMENT_IMPORT_LIMITS.files) throw new Error("Choose up to 50 PDFs per batch.");
    if (files.some((f) => f.size > DOCUMENT_IMPORT_LIMITS.bytes)) throw new Error("Each PDF must be 20 MB or smaller.");
    if (files.reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024) throw new Error("Choose up to 200 MB per batch.");
    const metadata = [];
    for (const file of files) {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      metadata.push({ name: file.name, size: file.size, sha256: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("") });
    }
    const created = await api("/api/document-imports", { target, files: metadata });
    setSelectedId(""); await load(created.jobId); onJobChange?.(created.jobId);
    let failures = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy(`Reading PDF ${i + 1} of ${files.length}: ${files[i].name}`);
      try {
        const destination = created.uploads[i];
        const uploaded = await supabase.storage.from("booking-imports").uploadToSignedUrl(destination.path, destination.token, files[i], { contentType: "application/pdf" });
        if (uploaded.error) throw uploaded.error;
        await api(`/api/document-imports/${created.jobId}/${destination.id}`, { action: "extract" });
      } catch { failures++; }
      await load(created.jobId);
    }
    setNotice(failures ? `${files.length - failures} PDFs read; ${failures} need another attempt. Open each file to review or retry.` : "PDFs read. Review each document before creating records.");
  });
  const retryUpload = (file: File) => run("Uploading original PDF?", async () => {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
    if (hash !== current.source_hash) throw new Error("Select the same original PDF for this import. Use New import for a changed document.");
    const destination = await api(`/api/document-imports/${data.job.id}/${current.id}`, { action: "upload" });
    const uploaded = await supabase.storage.from("booking-imports").uploadToSignedUrl(destination.path, destination.token, file, { contentType: "application/pdf" });
    if (uploaded.error) throw uploaded.error;
    await api(`/api/document-imports/${data.job.id}/${current.id}`, { action: "extract", retry: true }); await load(data.job.id);
  });
  const updateField = (key: string, value: string) => setReview((r) => ({ ...r, reviewed: false, fields: { ...r.fields, [key]: value } }));
  const updateLine = (i: number, patch: any) => setReview((r) => ({ ...r, reviewed: false, items: r.items.map((line, idx) => idx === i ? { ...line, ...patch } : line) }));
  const validation = review && current ? validateDocumentReview(review, current.target_table, data.currency, data.catalogue, data.pricingIncludesVat) : { errors: [], followUps: [] };
  const committed = current?.status === "committed";
  const readonly = committed || !!busy;
  const recordHref = (doc: ImportedDocument) => doc.target_table === "orders" ? `/admin/orders?orderId=${doc.target_id}` : `/admin/quotes/${doc.target_id}`;
  return <div className="space-y-6">
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">{error}</p>{serverErrors.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{serverErrors.map((v, i) => <li key={i}>{v}</li>)}</ul>}</div>}
    {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
    {!data && <section className="rounded-xl border bg-card p-5 sm:p-8">
      <h2 className="text-xl font-semibold">Bring your PDFs into the workflow</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Upload a quote, order or invoice PDF, or choose a folder. Review customer details, event information, amounts and every dish or equipment line before saving.</p>
      <div className="mt-6 max-w-sm"><Label htmlFor="pdf-target">Create records in</Label><select id="pdf-target" value={target} onChange={(e) => setTarget(e.target.value as DocumentTarget)} className="mt-2 h-11 w-full rounded-md border bg-background px-3" disabled={!!busy}><option value="quotes">Quotes</option><option value="orders">Orders</option></select></div>
      <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="mr-2 h-4 w-4" />Choose PDFs</Button><Button variant="outline" onClick={() => folderRef.current?.click()} disabled={!!busy}><FolderOpen className="mr-2 h-4 w-4" />Choose folder</Button></div>
      <p className="mt-3 text-xs text-muted-foreground">Up to 50 PDFs per batch, 20 MB and 20 pages per PDF. Files stay private. Scanned pages are read with AI when a vision provider is available.</p>
      <p className="mt-4 text-sm">Records start as drafts or history. Sending and production stay blocked until required setup is complete. No payment is recorded from a PDF.</p>
    </section>}
    <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" aria-label="Choose PDF files" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
    <input ref={folderRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" aria-label="Choose PDF folder" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
    {busy && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span className="break-all">{busy}</span></p>}
    {data && <div className="grid min-w-0 gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">{data.documents.length} documents</h2><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => { if (!review || committed || window.confirm("Leave this review? Save your corrections first if you need them.")) { setData(null); setReview(null); } }}>New import</Button></div>
        <ul className="space-y-2">{data.documents.map((doc) => <li key={doc.id}><button type="button" disabled={!!busy} onClick={() => { if (current?.id === doc.id || !review || committed || window.confirm("Switch documents? Save your corrections first if you need them.")) setSelectedId(doc.id); }} aria-current={doc.id === current?.id ? "true" : undefined} className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${doc.id === current?.id ? "border-brand-primary bg-muted" : "bg-card"}`}><span className="block break-all text-sm font-semibold">{doc.filename}</span><span className="mt-1 block text-xs text-muted-foreground">{doc.status === "committed" ? "Saved" : doc.status === "review" ? "Ready to review" : doc.status === "duplicate" ? "Already imported" : doc.status === "error" ? "Needs another attempt" : doc.status === "extracting" ? "Reading…" : "Waiting to read"}</span></button></li>)}</ul>
      </aside>
      {current && <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-all text-lg font-semibold">{current.filename}</h2><p className="mt-1 text-sm text-muted-foreground">Import as {current.target_table === "quotes" ? "a quote" : "an order"}. New document numbers are allocated; the original reference is retained.</p></div>
          <Button variant="outline" size="sm" asChild><a href={`/api/document-imports/${data.job.id}/${current.id}?open=1`} target="_blank" rel="noreferrer"><FileText className="mr-2 h-4 w-4" />Original PDF</a></Button>
        </div>
        {current.status === "duplicate" && <div className="mt-5"><p>This exact PDF is already imported. Its record and catalogue items have been reused.</p><Button className="mt-3" asChild><Link href={withSlug(recordHref(current))}>Open existing record</Link></Button></div>}
        {!review && current.status !== "duplicate" && <div className="mt-6"><p className="mb-3 text-sm">{current.error_message || "Read this PDF to extract its details. Nothing is added to the catalogue until you approve the import."}</p><Button disabled={!!busy} onClick={() => run("Reading PDF…", async () => { await api(`/api/document-imports/${data.job.id}/${current.id}`, { action: "extract", retry: true }); await load(data.job.id); })}>Read PDF</Button>{["uploaded", "error"].includes(current.status) && <div className="mt-4"><Label htmlFor="retry-pdf">Upload the original PDF again if its upload was interrupted</Label><Input id="retry-pdf" className="mt-2" type="file" accept="application/pdf,.pdf" disabled={!!busy} onChange={(e) => { if (e.target.files?.[0]) void retryUpload(e.target.files[0]); e.target.value = ""; }} /></div>}</div>}
        {review && <>
          {committed && <section className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"><h3 className="font-semibold">{current.setup_completed_at && !gaps.length ? "Import setup complete" : "Complete setup before using this booking"}</h3><p className="mt-1 text-sm">Catalogue items are saved and can be reused. Finish the linked recipe and inventory details, then review the booking before sending or starting work.</p>
            <ul className="mt-3 space-y-2 text-sm">{gaps.filter((g) => g.kind !== "review").map((g, i) => <li key={i}><Link className="underline underline-offset-2" href={withSlug(g.href)} target="_blank">{g.message}</Link></li>)}</ul>
            <div className="mt-4 flex flex-wrap gap-2"><Button asChild size="sm"><Link href={withSlug(recordHref(current))}>Open {current.target_table === "quotes" ? "quote" : "order"}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              {!current.setup_completed_at && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("Checking setup…", async () => { await api("/api/document-imports/readiness", { documentId: current.id }); await load(data.job.id); setNotice("Setup complete. You can now continue through the normal booking workflow. Imported communications remain paused until you enable them in Import history."); })}>Recheck and complete setup</Button>}
            </div></section>}
          {!!current.extraction.warnings?.length && <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><h3 className="font-semibold">Check the original PDF</h3><ul className="mt-2 list-disc space-y-1 pl-5">{current.extraction.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div>}
          <fieldset disabled={readonly} className="mt-6"><legend className="text-base font-semibold">Branch and record type</legend><div className="mt-3 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="import-region">Branch *</Label><select id="import-region" className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={review.region_id} onChange={(e) => setReview({ ...review, reviewed: false, region_id: e.target.value })}><option value="">Choose branch</option>{data.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            {current.target_table === "orders" && <div><Label htmlFor="import-mode">Use this order for</Label><select id="import-mode" className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={review.mode} onChange={(e) => setReview({ ...review, reviewed: false, mode: e.target.value as any })}><option value="draft">Upcoming work — save pending setup and confirmation</option><option value="historical">History only — completed, no new production tasks</option></select></div>}</div></fieldset>
          {[...new Set(fieldsForTarget(current.target_table).map((f) => f.group))].map((group) => <fieldset key={group} disabled={readonly} className="mt-7"><legend className="text-base font-semibold">{group}</legend><div className="mt-3 grid gap-4 sm:grid-cols-2">{fieldsForTarget(current.target_table).filter((f) => f.group === group).map((field) => {
            const source = current.extraction.fields[field.key]; const missing = !review.fields[field.key] && "required" in field;
            return <div key={field.key} className="min-w-0"><Label htmlFor={`import-${field.key}`}>{field.label}{"required" in field ? " *" : ""}</Label>
              {field.key === "equipment_return_method" ? <select id={`import-${field.key}`} value={review.fields[field.key] || ""} onChange={(e) => updateField(field.key, e.target.value)} className="mt-1 h-11 w-full rounded-md border bg-background px-3"><option value="">Choose return method</option><option value="driver_same_day">Our driver — same day</option><option value="driver_next_day">Our driver — next day</option><option value="waiter">Waiter returns it</option><option value="none">Client returns it / nothing to return</option></select> : <Input id={`import-${field.key}`} className={`mt-1 ${missing ? "border-amber-500" : ""}`} type={field.type} step={field.type === "number" ? "any" : undefined} value={review.fields[field.key] || ""} onChange={(e) => updateField(field.key, e.target.value)} aria-describedby={`import-${field.key}-source`} />}
              <p id={`import-${field.key}-source`} className={`mt-1 break-words text-xs ${missing ? "text-amber-800" : "text-muted-foreground"}`}>{missing ? "Missing from the PDF — fill this in." : source?.value != null ? `${source.page ? `Page ${source.page} · ` : ""}${source.confidence < .8 ? "Check this match · " : ""}${source.evidence || "Extracted from PDF"}` : "Not found in PDF; add if needed."}</p><p className="mt-1 text-xs text-muted-foreground">Saves to {fieldDestination(current.target_table, field.key)}</p>
            </div>;
          })}</div></fieldset>)}
          <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">Dishes, services and equipment</h3><Button type="button" variant="outline" size="sm" disabled={readonly} onClick={() => setReview({ ...review, reviewed: false, items: [...review.items, documentLineSchema.parse({ kind: "menu", name: "" })] })}><Plus className="mr-2 h-4 w-4" />Add item</Button></div><p className="mt-2 text-sm text-muted-foreground">Your company uses item prices {data.pricingIncludesVat ? "including" : "excluding"} VAT. Exact catalogue names are linked automatically. Check matches below. New dishes and equipment become reusable items when you create the record; existing catalogue prices stay unchanged.</p>
            <div className="mt-4 divide-y rounded-lg border">{review.items.map((line, i) => <fieldset key={i} disabled={readonly} className="min-w-0 p-4"><legend className="sr-only">Item {i + 1}</legend><div className="flex items-start justify-between gap-2"><h4 className="break-words text-sm font-semibold">{i + 1}. {line.name || "New item"}</h4><Button type="button" variant="ghost" size="sm" aria-label={`Remove item ${i + 1}`} onClick={() => setReview({ ...review, reviewed: false, items: review.items.filter((_, idx) => idx !== i) })}><X className="h-4 w-4" /></Button></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`line-kind-${i}`}>Type</Label><select id={`line-kind-${i}`} className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={line.kind} onChange={(e) => updateLine(i, { kind: e.target.value, catalogue_id: null })}><option value="menu">Dish / menu item</option><option value="equipment">Equipment</option><option value="service">Service / other charge</option></select></div><div><Label htmlFor={`line-name-${i}`}>Name</Label><Input id={`line-name-${i}`} value={line.name} onChange={(e) => updateLine(i, { name: e.target.value })} /></div><div className="sm:col-span-2"><Label htmlFor={`line-match-${i}`}>Catalogue match</Label><select id={`line-match-${i}`} className="mt-1 h-10 w-full max-w-full rounded-md border bg-background px-3 text-sm" value={line.catalogue_id || ""} onChange={(e) => updateLine(i, { catalogue_id: e.target.value || null })}><option value="">Create reusable catalogue item on import</option>{data.catalogue.filter((c) => c.kind === (line.kind === "equipment" ? "equipment" : "menu")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                {([ ["quantity", "Quantity"], ["unit_price", "Unit price"], ["line_total", "Line total"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`line-${key}-${i}`}>{label} *</Label><Input id={`line-${key}-${i}`} type="number" step="any" min="0" value={line[key] ?? ""} onChange={(e) => updateLine(i, { [key]: e.target.value === "" ? null : Number(e.target.value) })} /></div>)}
                <div><Label htmlFor={`line-category-${i}`}>Category</Label><Input id={`line-category-${i}`} value={line.category} onChange={(e) => updateLine(i, { category: e.target.value })} /></div>
                {!line.catalogue_id && line.kind === "equipment" && <><div><Label htmlFor={`line-stock-${i}`}>Physical quantity you own *</Label><Input id={`line-stock-${i}`} type="number" min="0" step="1" value={line.owned_quantity ?? ""} onChange={(e) => updateLine(i, { owned_quantity: e.target.value === "" ? null : Number(e.target.value) })} /><p className="mt-1 text-xs text-muted-foreground">Do not copy the order quantity unless it is also your actual stock.</p></div><div><Label htmlFor={`line-clean-${i}`}>Cleaning minutes per item</Label><Input id={`line-clean-${i}`} type="number" min="0" value={line.cleaning_minutes ?? ""} onChange={(e) => updateLine(i, { cleaning_minutes: e.target.value === "" ? null : Number(e.target.value) })} /><label className="mt-2 flex items-center gap-2 text-sm"><Checkbox checked={line.requires_cleaning} onCheckedChange={(v) => updateLine(i, { requires_cleaning: !!v })} />Requires cleaning</label></div></>}
                {!line.catalogue_id && line.kind === "menu" && ([ ["prep_time_minutes", "Preparation minutes"], ["cook_time_minutes", "Cooking minutes"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`line-${key}-${i}`}>{label}</Label><Input id={`line-${key}-${i}`} type="number" min="0" value={line[key] ?? ""} onChange={(e) => updateLine(i, { [key]: e.target.value === "" ? null : Number(e.target.value) })} /></div>)}
              </div><p className="mt-2 break-words text-xs text-muted-foreground">{line.page ? `Page ${line.page}: ` : ""}{line.evidence || line.description || "Added during review"}</p>
            </fieldset>)}</div>
          </section>
          {!!review.unmatched.length && <fieldset disabled={readonly} className="mt-8"><legend className="text-base font-semibold">Details without a direct match</legend><p className="mt-2 text-sm text-muted-foreground">Choose where each detail belongs. These details will be preserved for the team.</p><div className="mt-3 space-y-4">{review.unmatched.map((fact, i) => <div key={i} className="rounded-lg border p-3"><p className="break-words text-sm"><strong>{fact.label}:</strong> {fact.value}</p><Label htmlFor={`fact-${i}`} className="mt-2 block">Save to</Label><select id={`fact-${i}`} className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={fact.destination} onChange={(e) => setReview({ ...review, reviewed: false, unmatched: review.unmatched.map((v, idx) => idx === i ? { ...v, destination: e.target.value as any } : v) })}><option value="notes">Booking notes</option>{current.target_table === "orders" && <><option value="kitchen_instructions">Kitchen instructions</option><option value="special_instructions">Delivery / service instructions</option><option value="dietary_requirements">Dietary requirements</option></>}</select></div>)}</div></fieldset>}
          {!committed && <div className="mt-8 space-y-4 border-t pt-5">
            {!!validation.errors.length && <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-semibold">Fill these details before creating the record</h3><ul className="mt-2 list-disc space-y-1 pl-5">{validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
            {!!validation.followUps.length && <div className="text-sm"><h3 className="font-semibold">Required setup before use</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{validation.followUps.map((v, i) => <li key={i}>{v}</li>)}</ul><p className="mt-2">A banner and readiness check will keep this booking out of production until setup is complete.</p></div>}
            <label className="flex items-start gap-3 text-sm"><Checkbox disabled={!!busy} checked={review.reviewed} onCheckedChange={(v) => setReview({ ...review, reviewed: !!v })} /><span>I checked the customer, event, item matches and amounts against the original PDF.</span></label>
            <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!!busy} onClick={() => run("Saving corrections…", async () => { await api(`/api/document-imports/${data.job.id}/${current.id}`, { action: "save", version: current.version, review }); await load(data.job.id); setNotice("Corrections saved. You can return to this review later."); })}>Save corrections</Button><Button disabled={!!busy || !review.reviewed || validation.errors.length > 0} onClick={() => run("Creating record and catalogue items…", async () => { await api(`/api/document-imports/${data.job.id}/${current.id}`, { action: "commit", version: current.version, review }); await load(data.job.id); setNotice("Record and catalogue items created. Complete setup before sending or starting work."); })}><CheckCircle2 className="mr-2 h-4 w-4" />Create {current.target_table === "quotes" ? "quote" : "order"} and catalogue items</Button></div>
          </div>}
        </>}
      </section>}
    </div>}
    {!data && jobs.length > 0 && <section><h2 className="text-lg font-semibold">Recent PDF imports</h2><ul className="mt-3 divide-y rounded-xl border bg-card">{jobs.map((job) => <li key={job.id}><button disabled={!!busy} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted" onClick={() => run("Loading import…", async () => { await load(job.id); onJobChange?.(job.id); })}><span className="min-w-0 break-all text-sm font-medium">{job.source_filename}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</span><ArrowRight className="h-4 w-4 shrink-0" /></button></li>)}</ul></section>}
  </div>;
}
