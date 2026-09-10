import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { Brain, BookOpen, Database, Edit3, ExternalLink, FileUp, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { useAuth } from "@/contexts/AuthContext";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalHeader, PortalShell, PageWorkbench } from "@/components/portal/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";

type BrainSource = {
  id: string;
  name: string;
  source_type: string;
  source_url?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  metadata?: { characters?: number; chunks?: number; pages?: number; original_filename?: string; last_resynced_at?: string; last_fetched_at?: string; page_title?: string | null; fetched_url?: string; roles?: string[]; role_pack?: string; sync_mode?: string };
};

const ROLE_SCOPE_OPTIONS = [
  { value: "all", label: "All roles", roles: [] as string[] },
  { value: "owner-admin", label: "Owner and admins", roles: ["owner", "company_admin", "admin", "region_admin", "sales_admin"] },
  { value: "kitchen", label: "Kitchen", roles: ["kitchen_manager", "kitchen_staff"] },
  { value: "shopping", label: "Shopping", roles: ["shopping", "shopping_staff"] },
  { value: "driver", label: "Driver", roles: ["driver"] },
  { value: "cleaning", label: "Cleaning", roles: ["cleaning_manager", "cleaning_staff"] },
  { value: "waiter", label: "Waiter", roles: ["waiter"] },
  { value: "client", label: "Client", roles: ["client"] },
  { value: "staff", label: "General staff", roles: ["staff"] },
  { value: "platform", label: "Platform admin", roles: ["super_admin"] },
];
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function RoleScopeCheckboxes({ value, onChange, disabled, compact = false, allowPlatform = true }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean; compact?: boolean; allowPlatform?: boolean }) {
  const toggle = (scope: string) => {
    if (scope === "all") return onChange(["all"]);
    const next = value.filter((item) => item !== "all").includes(scope)
      ? value.filter((item) => item !== "all" && item !== scope)
      : [...value.filter((item) => item !== "all"), scope];
    onChange(next.length ? next : ["all"]);
  };
  const visibleOptions = ROLE_SCOPE_OPTIONS.filter((option) => option.value === "all" || allowPlatform || option.value !== "platform");
  const allRolesLabel = allowPlatform ? "All roles" : "All company roles";
  const selectedLabel = value.includes("all") ? allRolesLabel : visibleOptions.filter((option) => value.includes(option.value)).map((option) => option.label).join(", ");
  const options = <div className={cn("grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/50", compact ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2")}><label className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200", compact && "border border-brand-primary/20 bg-white dark:bg-slate-900")}><input type="checkbox" checked={value.includes("all")} onChange={() => toggle("all")} disabled={disabled} />{allRolesLabel}</label>{visibleOptions.filter((option) => option.value !== "all").map((option) => <label key={option.value} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300", compact && "border border-slate-200/80 bg-white dark:border-slate-700 dark:bg-slate-900")}><input type="checkbox" checked={value.includes(option.value)} onChange={() => toggle(option.value)} disabled={disabled} />{option.label}</label>)}</div>;
  if (compact) return <details className="group"><summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm marker:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><span className="flex min-w-0 items-center gap-2"><span className="font-medium">{selectedLabel || "Choose roles"}</span>{value.length > 1 && <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">{value.length} selected</span>}</span><span className="text-xs font-medium text-slate-500 group-open:text-brand-primary">Change</span></summary><div className="mt-2">{options}</div></details>;
  return options;
}

function AiBrainNav() {
  const { profile, user } = useAuth() as any;
  const isPlatformAdmin = [profile?.role, user?.role]
    .map(String)
    .includes(UserRole.SUPER_ADMIN);
  return isPlatformAdmin ? <PlatformNav /> : <AdminNav />;
}

function useIsPlatformAdmin(): boolean {
  const { profile, user } = useAuth() as any;
  return [profile?.role, user?.role]
    .map(String)
    .includes(UserRole.SUPER_ADMIN);
}

function useCanManageBrainSources(): boolean {
  const { profile } = useAuth() as any;
  return [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN].includes(String(profile?.role) as UserRole);
}

function useCanManageRoleScopedSources(): boolean {
  const { profile } = useAuth() as any;
  return [UserRole.SUPER_ADMIN, UserRole.OWNER].includes(String(profile?.role) as UserRole);
}

export default function ProtectedAiBrainPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN]}>
      <AiBrainPage />
    </ProtectedRoute>
  );
}

function AiBrainPage() {
  const { toast } = useToast();
  const isPlatformAdmin = useIsPlatformAdmin();
  const canManageSources = useCanManageBrainSources();
  const canManageRoleScopedSources = useCanManageRoleScopedSources();
  const accentText = isPlatformAdmin ? "text-slate-700 dark:text-slate-200" : "text-brand-primary";
  const [sources, setSources] = useState<BrainSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<BrainSource | null>(null);
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [roleScopes, setRoleScopes] = useState<string[]>(["all"]);
  const [websiteName, setWebsiteName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteRoleScopes, setWebsiteRoleScopes] = useState<string[]>(["all"]);

  const handlePdfSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setPdfFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      event.target.value = "";
      setPdfFile(null);
      toast({ title: "PDF required", description: "Choose a file with a .pdf extension.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      event.target.value = "";
      setPdfFile(null);
      toast({ title: "PDF is too large", description: "Upload a PDF smaller than 20 MB.", variant: "destructive" });
      return;
    }
    setPdfFile(file);
  };

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/knowledge");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load brain sources");
      setAvailabilityMessage(payload.available === false ? payload.message || "Approved assistant knowledge is waiting for the latest workspace update." : null);
      setSources(payload.sources || []);
    } catch (cause: any) {
      setError(cause?.message || "Could not load brain sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSources(); }, [loadSources]);

  const resetForm = () => {
    setEditingSource(null);
    setName("");
    setSourceUrl("");
    setContent("");
    setPdfFile(null);
    setRoleScopes(["all"]);
  };

  const editSource = async (source: BrainSource) => {
    try {
      const response = await fetch(`/api/chat/knowledge?sourceId=${encodeURIComponent(source.id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load source");
      setEditingSource(source);
      setName(payload.source.name || "");
      setSourceUrl(payload.source.source_url || "");
      setContent(payload.content || "");
      const sourceRoles = payload.source.metadata?.roles || [];
      setRoleScopes(sourceRoles.length ? ROLE_SCOPE_OPTIONS.filter((option) => option.roles.length && option.roles.some((role) => sourceRoles.includes(role))).map((option) => option.value) : ["all"]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause: any) {
      toast({ title: "Could not load source", description: cause?.message || "Try again.", variant: "destructive" });
    }
  };

  const saveSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || (!content.trim() && !pdfFile)) return;
    setSaving(true);
    try {
      const selectedRoles = canManageRoleScopedSources && !roleScopes.includes("all") ? [...new Set(roleScopes.flatMap((scope) => ROLE_SCOPE_OPTIONS.find((option) => option.value === scope)?.roles || []))] : [];
      const metadata = !editingSource && selectedRoles.length ? { roles: selectedRoles } : undefined;
      const request = editingSource || !pdfFile
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: editingSource?.id, name, sourceUrl, content, sourceType: editingSource?.source_type || "text", ...(metadata ? { metadata } : {}) }) }
        : (() => { const form = new FormData(); form.append("name", name); form.append("sourceUrl", sourceUrl); form.append("roles", JSON.stringify(selectedRoles)); form.append("file", pdfFile); return { body: form }; })();
      const response = await fetch("/api/chat/knowledge", { method: editingSource ? "PATCH" : "POST", ...request });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save source");
      const wasEditing = !!editingSource;
      resetForm();
      toast({ title: wasEditing ? "Knowledge source updated" : "Knowledge source added", description: `${payload.chunks} searchable chunk${payload.chunks === 1 ? "" : "s"} created.` });
      await loadSources();
    } catch (cause: any) {
      toast({ title: "Could not save source", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addWebsiteSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!websiteUrl.trim()) return;
    setSaving(true);
    try {
      const selectedRoles = canManageRoleScopedSources && !websiteRoleScopes.includes("all") ? [...new Set(websiteRoleScopes.flatMap((scope) => ROLE_SCOPE_OPTIONS.find((option) => option.value === scope)?.roles || []))] : [];
      const response = await fetch("/api/chat/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "web", name: websiteName, sourceUrl: websiteUrl, metadata: { roles: selectedRoles } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not fetch website");
      setWebsiteName("");
      setWebsiteUrl("");
      setWebsiteRoleScopes(["all"]);
      toast({ title: "Website source added", description: `${payload.chunks} searchable chunk${payload.chunks === 1 ? "" : "s"} created from the public page.` });
      await loadSources();
    } catch (cause: any) {
      toast({ title: "Could not add website", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const seedRolePacks = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/chat/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset: "role-packs" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load role packs");
      toast({ title: payload.count ? "Role PDFs synchronized" : "Role PDFs already available", description: payload.count ? `${payload.createdCount || 0} added and ${payload.updatedCount || 0} converted to separate role PDF sources.` : "The existing role-specific sources were kept; no duplicates were created." });
      await loadSources();
    } catch (cause: any) {
      toast({ title: "Could not load role packs", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resync = async (sourceId?: string) => {
    setResyncing(sourceId || "all");
    try {
      const response = await fetch("/api/chat/knowledge", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sourceId ? { sourceId } : {}) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not resync sources");
      toast({ title: "Knowledge resynced", description: `${sourceId ? "Source" : "All sources"} embeddings refreshed.` });
      await loadSources();
    } catch (cause: any) {
      toast({ title: "Resync failed", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setResyncing(null);
    }
  };

  const deleteSource = async (source: BrainSource) => {
    if (!window.confirm(`Delete "${source.name}"? Its indexed chunks will also be removed.`)) return;
    setDeleting(source.id);
    try {
      const response = await fetch("/api/chat/knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: source.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not delete source");
      if (editingSource?.id === source.id) resetForm();
      toast({ title: "Source deleted", description: "The source and its searchable chunks were removed." });
      await loadSources();
    } catch (cause: any) {
      toast({ title: "Could not delete source", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>AI brain - CateringMS</title></Head>
      <AiBrainNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader variant="hero" appearance={isPlatformAdmin ? "dark" : "brand"} title="AI brain" icon={Brain} subtitle="Give the assistant approved company knowledge while live operational data stays in the database and is fetched per user role." meta={<><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"><ShieldCheck className="h-3.5 w-3.5" /> {isPlatformAdmin ? "Platform context" : "Tenant-scoped knowledge"}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">Phase 2 navigation ready</span></>} />
          <PageWorkbench />
          <div className={cn("mb-6 rounded-2xl border px-4 py-3 text-sm leading-6", isPlatformAdmin ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" : "border-brand-primary/20 bg-brand-primary/5 text-slate-700 dark:text-slate-300")}>
            <span className="font-semibold">{isPlatformAdmin ? "Platform knowledge scope: " : "Company knowledge scope: "}</span>
            {isPlatformAdmin ? "You can manage global product guidance used by platform administrators. Company-specific knowledge remains inside each company workspace." : canManageRoleScopedSources ? "You can add policies, procedures, FAQs, manuals, and role-specific guidance for this company only. Platform-wide guidance is managed centrally by a platform administrator." : "You can add company-wide policies, FAQs, manuals, and operational facts. Role-specific guides, page and section context, and role PDFs are managed by the company owner."}
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {[
              [Database, "Live context", "Orders, stock, assignments, invoices, and notifications are read at question time."],
              [BookOpen, "Indexed knowledge", "Policies, FAQs, recipes, procedures, and approved business guidance."],
              [ShieldCheck, "Role boundaries", "Every answer is scoped to the signed-in user and company; the assistant does not invent records."],
            ].map(([Icon, title, description]) => {
              const IconComponent = Icon as typeof Database;
              return <Card key={title as string} className="border-slate-200/80 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80"><CardContent className="p-5"><IconComponent className={cn("mb-3 h-5 w-5", accentText)} /><p className="font-semibold text-slate-950 dark:text-white">{title as string}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{description as string}</p></CardContent></Card>;
            })}
          </div>

          <div className="space-y-6">
            {canManageSources ? <div className="grid items-start gap-6 xl:grid-cols-2">
            <Card className="border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
              <CardHeader><CardTitle className="flex items-center gap-2">{editingSource ? <Edit3 className={cn("h-5 w-5", accentText)} /> : <Plus className={cn("h-5 w-5", accentText)} />}{editingSource ? "Update approved knowledge" : "Add approved knowledge"}</CardTitle></CardHeader>
      <CardContent>
                <form className="space-y-4" onSubmit={saveSource}>
                  <div className="space-y-2"><Label htmlFor="brain-name">Source name</Label><Input id="brain-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cancellation policy" maxLength={160} required /></div>
                  <div className="space-y-2"><Label htmlFor="brain-url">Reference URL <span className="font-normal text-slate-400">(optional)</span></Label><Input id="brain-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." type="url" /><p className="text-xs text-slate-500">For text and PDFs this records the approved original reference. Use the separate Website source panel below when the page itself should be fetched and indexed.</p></div>
              {canManageRoleScopedSources ? <div className="space-y-2"><Label>Who can use this context?</Label><RoleScopeCheckboxes value={roleScopes} onChange={setRoleScopes} disabled={!!editingSource || saving} allowPlatform={isPlatformAdmin} /><p className="text-xs text-slate-500">{isPlatformAdmin ? "Select platform administrators or shared platform guidance." : "Select one or multiple company role groups. Platform administrator scope is managed centrally."}</p></div> : <div className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-800 dark:text-slate-100">Company-wide context.</span> This information is available to the company’s permitted assistant users. The owner manages role-specific page and section guidance.</div>}
                   <div className="space-y-2"><Label htmlFor="brain-pdf">PDF document <span className="font-normal text-slate-400">(optional)</span></Label><Input id="brain-pdf" type="file" accept="application/pdf,.pdf" disabled={!!editingSource || saving} onChange={handlePdfSelection} /><p className="text-xs text-slate-500">Upload a text-based PDF up to 20 MB. The server checks the type, size, readability, and extracted content before indexing.</p>{pdfFile && <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"><FileUp className="h-3.5 w-3.5" />{pdfFile.name} ({Math.ceil(pdfFile.size / 1024)} KB)</p>}</div>
                   <div className="space-y-2"><Label htmlFor="brain-content">Content {pdfFile && <span className="font-normal text-slate-400">(not needed for PDF)</span>}</Label><Textarea id="brain-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write the policy, FAQ, procedure, or other approved guidance here..." className="min-h-56" maxLength={200000} required={!pdfFile} /><p className="text-xs text-slate-500">The server checks readability, suspicious instructions, credentials, private keys, unsafe markup, size, and embedding completion before the source becomes searchable.</p><p className="text-xs text-amber-700 dark:text-amber-300">Upload only approved company information. Automated checks cannot confirm whether business facts are true, so review the source before saving.</p></div>
                  <div className="flex flex-wrap gap-2"><Button type="submit" variant={isPlatformAdmin ? "secondary" : "default"} disabled={saving || !!availabilityMessage || !name.trim() || (!content.trim() && !pdfFile)}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingSource ? <Edit3 className="mr-2 h-4 w-4" /> : pdfFile ? <FileUp className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{editingSource ? "Update source" : pdfFile ? "Upload PDF" : "Add source"}</Button>{editingSource && <><Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button><Button type="button" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => void deleteSource(editingSource)} disabled={deleting === editingSource.id}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete source</Button></>}</div>
              {canManageRoleScopedSources && <div className="border-t border-slate-200 pt-4 dark:border-slate-800"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role PDFs</p><p className="mt-1 text-xs leading-5 text-slate-500">{isPlatformAdmin ? "Replace grouped starter sources with separate platform role PDF sources." : "Load separate company operating guides for owner, admin, kitchen, shopping, driver, cleaning, waiter, staff, and client roles."}</p><Button type="button" variant="outline" className="mt-3" onClick={() => void seedRolePacks()} disabled={saving}><BookOpen className="mr-2 h-4 w-4" />{isPlatformAdmin ? "Replace with role PDFs" : "Load company role PDFs"}</Button></div>}
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
              <CardHeader className="border-b border-slate-200/80 pb-4 dark:border-slate-800">
                <CardTitle className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary"><ExternalLink className="h-4 w-4" /></span><span><span className="block">Add website source</span><span className="mt-1 block text-sm font-normal leading-5 text-slate-500">Index one public help page and keep it available to selected roles.</span></span></CardTitle>
              </CardHeader>
              <CardContent className="pt-5 [&>p:last-child]:hidden">
                <form className="space-y-5" onSubmit={addWebsiteSource}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="website-name">Source name <span className="font-normal text-slate-400">(optional)</span></Label><Input id="website-name" value={websiteName} onChange={(event) => setWebsiteName(event.target.value)} placeholder="Public cancellation policy" maxLength={160} /></div>
                    <div className="space-y-2"><Label htmlFor="website-url">Public page URL</Label><Input id="website-url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com/help/cancellations" type="url" required /></div>
                  </div>
                  {canManageRoleScopedSources ? <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                    <div><Label>Access scope</Label><p className="mt-1 text-xs text-slate-500">Choose who can use this page in chat. You can select more than one role.</p></div>
                  <RoleScopeCheckboxes value={websiteRoleScopes} onChange={setWebsiteRoleScopes} disabled={saving} compact allowPlatform={isPlatformAdmin} />
                  </div> : <div className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-800 dark:text-slate-100">Company-wide website context.</span> Role-specific website access is configured by the company owner.</div>}
                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Only public HTML is fetched. Website content can be refreshed later from Company sources.</p><Button type="submit" className="shrink-0" variant={isPlatformAdmin ? "secondary" : "default"} disabled={saving || !!availabilityMessage || !websiteUrl.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}Fetch and index</Button></div>
                </form>
                <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">This is a separate one-page website source. Only public HTML is fetched; scripts, styles, local/private addresses, and oversized pages are rejected. Each source gets its own “Refetch &amp; resync” control so later website changes can be pulled independently.</p>
              </CardContent>
            </Card>

            </div> : <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"><CardContent className="p-5"><p className="font-semibold text-amber-950 dark:text-amber-100">Owner-managed AI Brain</p><p className="mt-1 text-sm leading-6 text-amber-900/80 dark:text-amber-200/80">Company administrators can view this company’s indexed knowledge, but only the company owner can add, edit, upload, resync, delete, or load role-specific guidance here. You can still manage approved live-data access from the AI Access page.</p></CardContent></Card>}

            <Card id="approved-sources" data-chat-section="platform.ai-brain.approved-sources" className="border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
              <CardHeader id="source-sync-status" data-chat-section="platform.ai-brain.sync-status" className="flex flex-row items-center justify-between space-y-0"><CardTitle className="flex items-center gap-2"><BookOpen className={cn("h-5 w-5", accentText)} /> {isPlatformAdmin ? "Platform sources" : "Company sources"}</CardTitle><div className="flex gap-2">{canManageRoleScopedSources && <Button variant="outline" size="sm" onClick={() => void resync()} disabled={!!resyncing || loading}><RefreshCw className={`mr-2 h-4 w-4 ${resyncing === "all" ? "animate-spin" : ""}`} />Resync all</Button>}<Button variant="outline" size="sm" onClick={() => void loadSources()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div></CardHeader>
              <CardContent>
                <p className="mb-4 text-xs leading-5 text-slate-500">Website sources are fetched again when you use their resync control; text and PDF sources only regenerate embeddings from their stored content.</p>
                {availabilityMessage && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"><p className="font-semibold">Knowledge sources are not connected yet</p><p className="mt-1 leading-6">{availabilityMessage} The assistant will continue using approved built-in guidance and navigation until this workspace update is applied.</p></div>}
                {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
                {!error && loading && <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading sources...</div>}
                {!error && !availabilityMessage && !loading && sources.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No approved sources yet. Add policies and procedures or load the starter role packs.</div>}
                <div id="failed-sources" data-chat-section="platform.ai-brain.failed-sources" className="space-y-3">
                  {sources.map((source) => {
                    const roleScoped = (source.metadata?.roles?.length || 0) > 0 || !!source.metadata?.role_pack;
                    const canManageSource = canManageSources && (canManageRoleScopedSources || !roleScoped);
                    return (
                    <div key={source.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-950 dark:text-white">{source.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{source.source_type} - {source.status}</p>
                        </div>
                        <span className="text-xs text-slate-500">{new Date(source.updated_at).toLocaleDateString()}</span>
                      </div>
                      {source.source_url && <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-600 hover:underline"><span className="truncate">{source.source_url}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>}
                      {source.metadata?.original_filename && <p className="mt-1 truncate text-xs text-slate-500">File: {source.metadata.original_filename}{source.metadata.pages ? ` • ${source.metadata.pages} pages` : ""}</p>}
                      <p className="mt-1 text-xs text-slate-400">{source.metadata?.last_resynced_at ? `Last synced ${new Date(source.metadata.last_resynced_at).toLocaleString()}` : "Not resynced yet"}{source.metadata?.roles?.length ? ` • ${source.metadata.roles.join(", ")}` : ""}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!canManageSource && <span className="text-xs font-medium text-slate-500">{roleScoped ? "Owner-managed role guidance" : "View only"}</span>}
                        {canManageSource && <Button variant="ghost" size="sm" onClick={() => void editSource(source)}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Edit</Button>}
                        {canManageSource && <Button variant="ghost" size="sm" onClick={() => void resync(source.id)} disabled={!!resyncing || !!deleting}>
                          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${resyncing === source.id ? "animate-spin" : ""}`} />Resync embeddings
                        </Button>}
                        {canManageSource && <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
                          onClick={() => void deleteSource(source)}
                          disabled={!!resyncing || deleting === source.id}
                        >
                          {deleting === source.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                          {deleting === source.id ? "Deleting..." : "Delete"}
                        </Button>}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </PortalShell>
      </div>
    </>
  );
}
