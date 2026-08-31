import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Database, Loader2, Save, ShieldCheck, Users } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { useAuth } from "@/contexts/AuthContext";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalHeader, PortalShell, PageWorkbench } from "@/components/portal/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";
import { DynamicToolBuilder } from "@/components/chatbot/DynamicToolBuilder";

type Policy = {
  role: string;
  liveDataEnabled: boolean;
  toolPolicies: Record<string, boolean>;
  source: "database" | "default";
  updatedAt?: string | null;
};

type ToolDefinition = {
  id: string;
  label: string;
  description: string;
  dataScope: string;
  category: string;
  roles: string[];
};

type RoleDetail = {
  label: string;
  description: string;
  managedByCompany: boolean;
};

function AiAccessNav() {
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

function AccessPage() {
  const { toast } = useToast();
  const isPlatformAdmin = useIsPlatformAdmin();
  const accentText = isPlatformAdmin ? "text-slate-700 dark:text-slate-200" : "text-brand-primary";
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [roleDetails, setRoleDetails] = useState<Record<string, RoleDetail>>({});
  const [toolDefinitions, setToolDefinitions] = useState<ToolDefinition[]>([]);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/access");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load AI access policies");
      setPolicies(payload.policies || []);
      setRoleDetails(payload.roleDetails || {});
      setToolDefinitions(payload.toolDefinitions || []);
      setNote(payload.note || "");
    } catch (cause: any) {
      setError(cause?.message || "Could not load AI access policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (role: string, liveDataEnabled: boolean) => {
    setSavingRole(role);
    try {
      const response = await fetch("/api/chat/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, liveDataEnabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update AI access");
      setPolicies((current) => current.map((item) => item.role === role ? payload.policy : item));
      toast({ title: "AI access updated", description: `${roleDetails[role]?.label || role} live-data access is now ${liveDataEnabled ? "on" : "off"}.` });
    } catch (cause: any) {
      toast({ title: "Could not update AI access", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setSavingRole(null);
    }
  };

  const updateTool = async (role: string, toolId: string, enabled: boolean) => {
    setSavingRole(`${role}:${toolId}`);
    try {
      const response = await fetch("/api/chat/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, toolId, liveDataEnabled: enabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update live-data tool");
      setPolicies((current) => current.map((item) => item.role === role ? { ...item, toolPolicies: { ...item.toolPolicies, [toolId]: payload.policy.enabled } } : item));
      toast({ title: "Live-data tool updated", description: `${toolDefinitions.find((tool) => tool.id === toolId)?.label || toolId} is now ${enabled ? "on" : "off"} for ${roleDetails[role]?.label || role}.` });
    } catch (cause: any) {
      toast({ title: "Could not update live-data tool", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>AI access - CateringMS</title></Head>
      <AiAccessNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="AI access"
            icon={ShieldCheck}
            subtitle="Control which user roles may receive approved live operational data in the assistant."
            appearance={isPlatformAdmin ? "dark" : "brand"}
            meta={<span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"><ShieldCheck className="h-3.5 w-3.5" /> {isPlatformAdmin ? "Platform context" : "Company-controlled"}</span>}
          />
          <PageWorkbench />

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin/ai-brain" className={cn("inline-flex items-center gap-2 text-sm font-medium hover:underline", accentText)}><ArrowLeft className="h-4 w-4" /> Back to AI brain</Link>
            <span className="text-xs text-slate-500">Changes apply to the next assistant question.</span>
          </div>

          <section id="live-data-access" data-chat-section="admin.ai-brain.access.live-tools" data-chat-section-label="Live data access" className="mb-6 scroll-mt-20">
            <div className="mb-4 grid gap-4 md:grid-cols-3">
              <Card className="border-slate-200/80 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80"><CardContent className="p-5"><Database className={cn("mb-3 h-5 w-5", accentText)} /><p className="font-semibold text-slate-950 dark:text-white">Approved data sources</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">Managers can use built-in tools or create read-only tools from approved tables and fields. Company and role boundaries are checked every time.</p></CardContent></Card>
              <Card className="border-slate-200/80 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80"><CardContent className="p-5"><Users className={cn("mb-3 h-5 w-5", accentText)} /><p className="font-semibold text-slate-950 dark:text-white">Role-specific scope</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">A driver sees assigned delivery context, a client sees their own bookings, and kitchen or shopping roles see their operating data.</p></CardContent></Card>
              <Card className="border-slate-200/80 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80"><CardContent className="p-5"><Save className={cn("mb-3 h-5 w-5", accentText)} /><p className="font-semibold text-slate-950 dark:text-white">Safe fallback</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">When access is off, the assistant can still use approved static knowledge and navigation, but must not answer from live records.</p></CardContent></Card>
            </div>

            {note && <div className={cn("mb-4 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-300", isPlatformAdmin ? "border border-slate-200 bg-slate-50" : "border border-brand-primary/20 bg-brand-primary/5")}>{note}</div>}
            {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}<button type="button" onClick={() => void load()} className="ml-3 font-semibold underline">Retry</button></div>}

            <Card className="border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
              <CardContent className="p-0">
                <div id="role-access-controls" data-chat-section="platform.ai-access.role-controls" className="border-b border-slate-200 px-5 py-4 dark:border-slate-800"><p className="font-semibold text-slate-950 dark:text-white">Role access controls</p><p className="mt-1 text-xs leading-5 text-slate-500">Company admins can control every company role here. Expand “Manage tools” to allow or restrict individual business-data scopes. Existing row-level access checks remain in force.</p></div>
                {loading ? <div className="flex items-center gap-2 px-5 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading access policies...</div> : <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {policies.map((policy) => {
                    const detail = roleDetails[policy.role];
                    const isPlatformRole = detail && !detail.managedByCompany;
                    const disabled = !!savingRole || !!isPlatformRole;
                    const roleTools = toolDefinitions.filter((tool) => tool.roles.includes(policy.role));
                    const isExpanded = !!expandedRoles[policy.role];
                    return <div key={policy.role} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-medium text-slate-950 dark:text-white">{detail?.label || policy.role}</p>{policy.source === "default" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Default</span>}</div><p className="mt-1 text-sm text-slate-500">{detail?.description || "Role-specific assistant access"}</p><p className="mt-1 text-[11px] text-slate-400">{isPlatformRole ? "Managed centrally" : policy.liveDataEnabled ? `${roleTools.filter((tool) => policy.toolPolicies?.[tool.id] !== false).length} approved live tools available` : "Static knowledge and navigation only"}</p></div>
                        <div className="flex items-center gap-3"><span className={cn("text-xs font-semibold", policy.liveDataEnabled ? accentText : "text-slate-500")}>{policy.liveDataEnabled ? "Live data on" : "Live data off"}</span><Switch checked={policy.liveDataEnabled} disabled={disabled} onCheckedChange={(checked) => void update(policy.role, checked)} aria-label={`Toggle live data for ${detail?.label || policy.role}`} /><button type="button" onClick={() => setExpandedRoles((current) => ({ ...current, [policy.role]: !isExpanded }))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" aria-expanded={isExpanded}>{isExpanded ? "Hide tools" : "Manage tools"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} /></button></div>
                      </div>
                      {isExpanded && <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 md:grid-cols-2">
                        {roleTools.map((tool) => {
                          const toolEnabled = policy.toolPolicies?.[tool.id] !== false;
                          const toolSaving = savingRole === `${policy.role}:${tool.id}`;
                          return <div key={tool.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/40"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{tool.label}</p><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-900 dark:text-slate-500">{tool.category}</span></div><p className="mt-0.5 text-xs leading-5 text-slate-500">{tool.description}</p><p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-700 dark:text-slate-200">Approved data:</span> {tool.dataScope}</p></div><Switch className="mt-0.5 shrink-0" checked={toolEnabled} disabled={disabled || toolSaving || !policy.liveDataEnabled} onCheckedChange={(checked) => void updateTool(policy.role, tool.id, checked)} aria-label={`Toggle ${tool.label} for ${detail?.label || policy.role}`} /></div>;
                        })}
                        {!roleTools.length && <p className="text-sm text-slate-500">No company-managed tools are available for this role.</p>}
                      </div>}
                    </div>;
                  })}
                </div>}
              </CardContent>
            </Card>
            <DynamicToolBuilder isPlatformAdmin={isPlatformAdmin} roleDetails={roleDetails} />
          </section>
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedAiAccessPage() {
  return <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN]}><AccessPage /></ProtectedRoute>;
}
