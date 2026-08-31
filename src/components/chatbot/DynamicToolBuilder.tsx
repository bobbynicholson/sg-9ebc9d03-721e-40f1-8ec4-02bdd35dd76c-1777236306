import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type RoleDetail = { label: string; description: string; managedByCompany: boolean };
type SourceColumn = { name: string; type: string };
type Source = { table: string; companyScoped: boolean; columns: SourceColumn[] };
type Tool = {
  id: string;
  name: string;
  description: string;
  table_name: string;
  operation: "count" | "list" | "sum" | "average";
  selected_columns: string[];
  metric_column: string | null;
  audience_scope: "platform" | "company" | "current_user";
  user_scope_column: string | null;
  filters: Array<{ column: string; operator: string; value?: string }>;
  row_limit: number;
  roles: string[];
  keywords: string[];
  enabled: boolean;
};

const NUMERIC_TYPES = new Set(["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"]);
const EMPTY_FORM = {
  name: "",
  description: "",
  tableName: "",
  operation: "count" as Tool["operation"],
  selectedColumns: [] as string[],
  metricColumn: "",
  audienceScope: "company" as "company" | "current_user",
  userScopeColumn: "",
  filters: [] as Array<{ column: string; operator: string; value: string }>,
  rowLimit: 25,
  roles: [] as string[],
  keywords: "",
};

function title(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DynamicToolBuilder({ isPlatformAdmin, roleDetails }: { isPlatformAdmin: boolean; roleDetails: Record<string, RoleDetail> }) {
  const { toast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/tools");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load custom tools");
      setSources(payload.sources || []);
      setTools(payload.tools || []);
      setAvailabilityMessage(payload.available === false ? payload.message || "Custom assistant tools are waiting for the latest workspace update." : null);
    } catch (cause: any) {
      setError(cause?.message || "Could not load custom tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedSource = useMemo(() => sources.find((source) => source.table === form.tableName), [form.tableName, sources]);
  const numericColumns = useMemo(() => selectedSource?.columns.filter((column) => NUMERIC_TYPES.has(column.type)) || [], [selectedSource]);
  const assignableRoles = useMemo(() => Object.entries(roleDetails)
    .filter(([role, detail]) => isPlatformAdmin ? role === "super_admin" : detail.managedByCompany && role !== "super_admin")
    .sort((left, right) => left[1].label.localeCompare(right[1].label)), [isPlatformAdmin, roleDetails]);

  const chooseSource = (tableName: string) => {
    setForm((current) => ({ ...current, tableName, selectedColumns: [], metricColumn: "", userScopeColumn: "", filters: [] }));
  };

  const toggleColumn = (column: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      selectedColumns: checked
        ? [...new Set([...current.selectedColumns, column])].slice(0, 12)
        : current.selectedColumns.filter((item) => item !== column),
    }));
  };

  const toggleRole = (role: string, checked: boolean) => {
    setForm((current) => ({ ...current, roles: checked ? [...new Set([...current.roles, role])] : current.roles.filter((item) => item !== role) }));
  };

  const createTool = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/chat/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          roles: isPlatformAdmin ? ["super_admin"] : form.roles,
          audienceScope: isPlatformAdmin ? "platform" : form.audienceScope,
          keywords: form.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create tool");
      setTools((current) => [...current, payload.tool].sort((left, right) => left.name.localeCompare(right.name)));
      setForm(EMPTY_FORM);
      setShowBuilder(false);
      toast({ title: "Assistant tool created", description: "It is available for the selected roles on their next question." });
    } catch (cause: any) {
      toast({ title: "Could not create assistant tool", description: cause?.message || "Check the fields and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleTool = async (tool: Tool, enabled: boolean) => {
    setBusyTool(tool.id);
    try {
      const response = await fetch("/api/chat/tools", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tool.id, enabled }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update tool");
      setTools((current) => current.map((item) => item.id === tool.id ? { ...item, enabled } : item));
    } catch (cause: any) {
      toast({ title: "Could not update assistant tool", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setBusyTool(null);
    }
  };

  const removeTool = async (tool: Tool) => {
    if (!window.confirm(`Remove “${tool.name}”?`)) return;
    setBusyTool(tool.id);
    try {
      const response = await fetch(`/api/chat/tools?id=${encodeURIComponent(tool.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not remove tool");
      setTools((current) => current.filter((item) => item.id !== tool.id));
      toast({ title: "Assistant tool removed" });
    } catch (cause: any) {
      toast({ title: "Could not remove assistant tool", description: cause?.message || "Try again.", variant: "destructive" });
    } finally {
      setBusyTool(null);
    }
  };

  return (
    <section id="custom-live-tools" className="mt-6 scroll-mt-20">
      <Card className="border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-brand-primary" /><p className="font-semibold text-slate-950 dark:text-white">{isPlatformAdmin ? "Platform owner / admin tool builder" : "Company tool builder"}</p></div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Build a read-only tool from an approved data source, choose its result, and assign the roles that may use it.</p>
            </div>
            <Button type="button" onClick={() => setShowBuilder((current) => !current)}><Plus className="mr-2 h-4 w-4" />{showBuilder ? "Close builder" : "Create tool"}</Button>
          </div>

          {error && <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}<button type="button" onClick={() => void load()} className="ml-3 font-semibold underline">Retry</button></div>}
          {availabilityMessage && <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{availabilityMessage} The approved role access controls above are still available.</div>}
          {loading && <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading custom tools...</div>}

          {showBuilder && !loading && <div className="space-y-5 border-b border-slate-200 bg-slate-50/60 px-5 py-5 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="tool-name">Tool name</Label><Input id="tool-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Platform user count" /></div>
              <div className="space-y-2"><Label htmlFor="tool-keywords">Question phrases</Label><Input id="tool-keywords" value={form.keywords} onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value }))} placeholder="how many users, user count, platform users" /><p className="text-[11px] text-slate-500">Separate phrases with commas.</p></div>
            </div>
            <div className="space-y-2"><Label htmlFor="tool-description">What this tool answers</Label><Input id="tool-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Counts all user accounts currently listed on the platform" /></div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Data source</Label><Select value={form.tableName} onValueChange={chooseSource}><SelectTrigger><SelectValue placeholder={`Choose from ${sources.length} sources`} /></SelectTrigger><SelectContent>{sources.map((source) => <SelectItem key={source.table} value={source.table}>{title(source.table)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Result type</Label><Select value={form.operation} onValueChange={(value) => setForm((current) => ({ ...current, operation: value as Tool["operation"], selectedColumns: [], metricColumn: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="count">Count records</SelectItem><SelectItem value="list">List records</SelectItem><SelectItem value="sum">Add a number field</SelectItem><SelectItem value="average">Average a number field</SelectItem></SelectContent></Select></div>
            </div>

            {selectedSource && form.operation === "list" && <div className="space-y-2"><Label>Fields to return</Label><div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-3">{selectedSource.columns.map((column) => <label key={column.name} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"><Checkbox checked={form.selectedColumns.includes(column.name)} onCheckedChange={(checked) => toggleColumn(column.name, checked === true)} /><span>{title(column.name)}</span><span className="text-[10px] text-slate-400">{column.type}</span></label>)}</div><p className="text-[11px] text-slate-500">Choose up to 12 fields. Secret and credential fields are never offered.</p></div>}

            {selectedSource && ["sum", "average"].includes(form.operation) && <div className="space-y-2"><Label>Number field</Label><Select value={form.metricColumn} onValueChange={(value) => setForm((current) => ({ ...current, metricColumn: value }))}><SelectTrigger><SelectValue placeholder="Choose a number field" /></SelectTrigger><SelectContent>{numericColumns.map((column) => <SelectItem key={column.name} value={column.name}>{title(column.name)}</SelectItem>)}</SelectContent></Select></div>}

            {!isPlatformAdmin && <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Record scope</Label><Select value={form.audienceScope} onValueChange={(value) => setForm((current) => ({ ...current, audienceScope: value as "company" | "current_user", userScopeColumn: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company">Whole company</SelectItem><SelectItem value="current_user">Only the signed-in user</SelectItem></SelectContent></Select></div>{form.audienceScope === "current_user" && selectedSource && <div className="space-y-2"><Label>User field</Label><Select value={form.userScopeColumn} onValueChange={(value) => setForm((current) => ({ ...current, userScopeColumn: value }))}><SelectTrigger><SelectValue placeholder="Choose the user identifier" /></SelectTrigger><SelectContent>{selectedSource.columns.filter((column) => column.type === "uuid" && (column.name === "user_id" || column.name.endsWith("_id"))).map((column) => <SelectItem key={column.name} value={column.name}>{title(column.name)}</SelectItem>)}</SelectContent></Select></div>}</div>}

            {selectedSource && <div className="space-y-3"><div className="flex items-center justify-between"><Label>Fixed filters</Label><Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, filters: [...current.filters, { column: "", operator: "equals", value: "" }].slice(0, 5) }))} disabled={form.filters.length >= 5}><Plus className="mr-1 h-3.5 w-3.5" />Add filter</Button></div>{form.filters.map((filter, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"><Select value={filter.column} onValueChange={(value) => setForm((current) => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { ...item, column: value } : item) }))}><SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger><SelectContent>{selectedSource.columns.map((column) => <SelectItem key={column.name} value={column.name}>{title(column.name)}</SelectItem>)}</SelectContent></Select><Select value={filter.operator} onValueChange={(value) => setForm((current) => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { ...item, operator: value } : item) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equals">Equals</SelectItem><SelectItem value="not_equals">Does not equal</SelectItem><SelectItem value="is_empty">Is empty</SelectItem><SelectItem value="is_not_empty">Is not empty</SelectItem></SelectContent></Select><Input value={filter.value} disabled={["is_empty", "is_not_empty"].includes(filter.operator)} onChange={(event) => setForm((current) => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} placeholder="Value" /><Button type="button" variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, filters: current.filters.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}

            {!isPlatformAdmin && <div className="space-y-2"><Label>Roles allowed to use this tool</Label><div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-3">{assignableRoles.map(([role, detail]) => <label key={role} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"><Checkbox checked={form.roles.includes(role)} onCheckedChange={(checked) => toggleRole(role, checked === true)} /><span>{detail.label}</span></label>)}</div></div>}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center gap-2 text-xs text-slate-500"><Database className="h-4 w-4" />Read-only · scope checked on every question · maximum 100 returned rows</div><Button type="button" onClick={() => void createTool()} disabled={saving || !form.tableName}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create assistant tool</Button></div>
          </div>}

          {!loading && <div className="divide-y divide-slate-200 dark:divide-slate-800">{tools.map((tool) => <div key={tool.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900 dark:text-white">{tool.name}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800">{tool.operation}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{title(tool.table_name)}</span></div><p className="mt-1 text-sm text-slate-500">{tool.description || "Custom current-information tool"}</p><p className="mt-2 text-[11px] text-slate-400">Questions: {tool.keywords.join(", ")} · Roles: {tool.roles.map((role) => roleDetails[role]?.label || title(role)).join(", ")} · Scope: {title(tool.audience_scope)}</p></div><div className="flex items-center gap-2"><Switch checked={tool.enabled} disabled={busyTool === tool.id} onCheckedChange={(checked) => void toggleTool(tool, checked)} aria-label={`Toggle ${tool.name}`} /><Button type="button" variant="ghost" size="icon" disabled={busyTool === tool.id} onClick={() => void removeTool(tool)} aria-label={`Remove ${tool.name}`}>{busyTool === tool.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-rose-500" />}</Button></div></div>)}{!tools.length && <div className="px-5 py-8 text-center text-sm text-slate-500">No custom tools yet. Create one from any approved {isPlatformAdmin ? "platform" : "company"} data source.</div>}</div>}
        </CardContent>
      </Card>
    </section>
  );
}
