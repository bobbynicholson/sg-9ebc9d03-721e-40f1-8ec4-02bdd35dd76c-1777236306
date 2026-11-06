/**
 * The extra sections on the WhatsApp page. All start closed.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { WhatsAppRules } from "@/lib/whatsapp/rules";
import { cn } from "@/lib/utils";

const MIGRATION_NOTE = "This will work once the WhatsApp database update has been applied.";

async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || "That didn't work. Try again.");
  return json as T;
}

export function RepliesLink({ query, href }: { query: string; href: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api<{ unreadConversations: number }>(`/api/admin/whatsapp/inbox${query}${query ? "&" : "?"}countOnly=1`)
      .then((json) => setUnread(json.unreadConversations || 0))
      .catch(() => undefined);
  }, [query]);

  return (
    <Card className="w-full">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            Replies {unread > 0 && <Badge className="bg-brand-primary text-white hover:bg-brand-primary">{unread} waiting</Badge>}
          </p>
          <p className="text-xs text-slate-500">Read and answer what clients send back.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={href}>Open replies</Link></Button>
      </CardContent>
    </Card>
  );
}

function HourField({ id, label, value, onChange, disabled }: { id: string; label: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" min={0} max={23} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

export function RulesSection({ rules, connected, changed, saving, onChange, onSave }: {
  rules: WhatsAppRules;
  connected: boolean;
  changed: boolean;
  saving: boolean;
  onChange: (patch: Partial<WhatsAppRules>) => void;
  onSave: () => void;
}) {
  return (
    <Card collapsible defaultOpen={false} collapseLabel="Sending rules" className="w-full">
      <CardHeader>
        <CardTitle className="text-sm">Sending rules</CardTitle>
        <CardDescription className="text-xs">Quiet hours, limits and timing, so clients aren't irritated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HourField id="wa-quiet-start" label="Quiet hours start (0-23)" value={rules.quietStartHour} disabled={!connected} onChange={(quietStartHour) => onChange({ quietStartHour })} />
          <HourField id="wa-quiet-end" label="Quiet hours end (0-23)" value={rules.quietEndHour} disabled={!connected} onChange={(quietEndHour) => onChange({ quietEndHour })} />
          <HourField id="wa-event-hour" label="On-the-day message hour" value={rules.eventDayHour} disabled={!connected} onChange={(eventDayHour) => onChange({ eventDayHour })} />
          <div>
            <Label htmlFor="wa-chase-days" className="text-xs">Enquiry follow-up after (days)</Label>
            <Input id="wa-chase-days" type="number" min={1} max={30} value={rules.leadChaseDays} disabled={!connected}
              onChange={(event) => onChange({ leadChaseDays: Number(event.target.value) })} />
          </div>
        </div>
        <div className="sm:w-1/2 lg:w-1/4">
          <Label htmlFor="wa-weekly" className="text-xs">Most automatic messages per week before booking</Label>
          <Input id="wa-weekly" type="number" min={0} max={20} value={rules.weeklyLimit} disabled={!connected}
            onChange={(event) => onChange({ weeklyLimit: Number(event.target.value) })} />
          <p className="pt-1 text-xs text-slate-500">0 means no limit.</p>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Only message clients who agreed</p>
            <p className="text-xs text-slate-500">When off, everyone gets your automatic messages except clients who opted out.</p>
          </div>
          <Switch checked={rules.requireConsent} disabled={!connected} aria-label="Only message clients who agreed"
            onCheckedChange={(requireConsent) => onChange({ requireConsent })} />
        </div>
        <p className="text-xs text-slate-500">
          Messages held back by quiet hours or the weekly limit go out later, but are skipped if they're still held after 2 days. On-the-day, on-the-way, arrival, delivery and order-ready messages ignore quiet hours. Follow-ups stop once the person replies.
        </p>
        <Button
          type="button"
          disabled={!changed || saving || !connected}
          title={!connected ? "Connect WhatsApp to save rules" : changed ? undefined : "Change a rule to save it"}
          onClick={onSave}
        >
          {saving ? "Saving..." : "Save sending rules"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ConsentClient { id: string; client_name: string | null; phone: string | null; mobile_number: string | null; whatsapp_opt_in: boolean | null }
type ConsentFilter = "all" | "agreed" | "not_asked" | "opted_out";
interface ConsentPage {
  canSave: boolean;
  clients: ConsentClient[];
  page: number;
  pageSize: number;
  matching: number;
  counts: { all: number; agreed: number; notAsked: number; optedOut: number };
}

const CONSENT_CHOICES = [[true, "Agreed"], [null, "Not asked"], [false, "Opted out"]] as const;

export function ConsentSection({ query }: { query: string }) {
  return (
    <Card collapsible lazyContent defaultOpen={false} collapseLabel="Client consent" className="w-full">
      <CardHeader>
        <CardTitle className="text-sm">Client consent</CardTitle>
        <CardDescription className="text-xs">See and record who agreed to WhatsApp messages.</CardDescription>
      </CardHeader>
      <ConsentList query={query} />
    </Card>
  );
}

function ConsentList({ query }: { query: string }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConsentFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ConsentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, page: String(page) });
      if (search.trim()) params.set("q", search.trim());
      if (page > 1) params.set("counts", "0");
      const joiner = query ? "&" : "?";
      const json = await api<ConsentPage>(`/api/admin/whatsapp/consent${query}${joiner}${params.toString()}`);
      setData((current) => ({ ...json, counts: json.counts || current?.counts || json.counts }));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your clients.");
    } finally {
      setLoading(false);
    }
  }, [query, search, filter, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const setConsent = async (clientId: string, agreed: boolean | null) => {
    setSaving(clientId);
    try {
      await api(`/api/admin/whatsapp/consent${query}`, { clientId, agreed });
      await load();
    } catch (e) {
      toast({ title: "WhatsApp", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const counts = data?.counts;
  const filters: Array<[ConsentFilter, string, number | undefined]> = [
    ["all", "All clients", counts?.all],
    ["agreed", "Agreed", counts?.agreed],
    ["not_asked", "Not asked", counts?.notAsked],
    ["opted_out", "Opted out", counts?.optedOut],
  ];
  const matching = data?.matching || 0;
  const firstShown = data && matching > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastShown = data ? Math.min(data.page * data.pageSize, matching) : 0;
  const lastPage = data ? Math.max(1, Math.ceil(matching / data.pageSize)) : 1;

  return (
      <CardContent className="space-y-3 py-5">
        <p className="text-xs text-slate-500">
          Mark who agreed to WhatsApp messages. A client who replies STOP is opted out automatically.
        </p>
        {data && !data.canSave && <p className="text-xs text-amber-700">{MIGRATION_NOTE} You can see your clients now, but consent can't be saved yet.</p>}

        <Input
          aria-label="Search clients"
          placeholder="Search by name or number"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter clients by consent">
          {filters.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              disabled={!!data && !data.canSave && value !== "all"}
              onClick={() => { setFilter(value); setPage(1); }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50",
                filter === value
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              {label}{typeof count === "number" ? ` (${count.toLocaleString("en-ZA")})` : ""}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-rose-700">
            <p>{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>Try loading again</Button>
          </div>
        )}
        {loading && !data && <p className="py-6 text-center text-sm text-slate-500">Loading clients...</p>}

        {data && (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.clients.map((client) => (
                <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900 dark:text-white">{client.client_name || "Unnamed client"}</span>
                    <span className="block text-xs text-slate-500">{client.mobile_number || client.phone || "No number"}</span>
                  </span>
                  <span className="flex gap-1" role="group" aria-label={`WhatsApp consent for ${client.client_name || "this client"}`}>
                    {CONSENT_CHOICES.map(([value, label]) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={client.whatsapp_opt_in === value ? "default" : "outline"}
                        className="h-7 text-xs"
                        aria-pressed={client.whatsapp_opt_in === value}
                        disabled={!data.canSave || saving === client.id}
                        title={data.canSave ? undefined : "Saving works once the database update is applied"}
                        onClick={() => void setConsent(client.id, value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </span>
                </li>
              ))}
              {data.clients.length === 0 && <li className="py-6 text-center text-xs text-slate-500">No clients match.</li>}
            </ul>

            {matching > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">
                  Showing {firstShown.toLocaleString("en-ZA")}-{lastShown.toLocaleString("en-ZA")} of {matching.toLocaleString("en-ZA")}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous page</Button>
                  <span className="text-xs text-slate-500">Page {page} of {lastPage.toLocaleString("en-ZA")}</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={page >= lastPage || loading} onClick={() => setPage(page + 1)}>Next page</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
  );
}

export interface MetaTemplate { name: string; status: string; language: string; category: string; variables: number }

export function BulkSection(props: BulkProps) {
  return (
    <Card collapsible lazyContent defaultOpen={false} collapseLabel="Bulk message" className="w-full">
      <CardHeader>
        <CardTitle className="text-sm">Bulk message</CardTitle>
        <CardDescription className="text-xs">Send one approved template to every client who agreed.</CardDescription>
      </CardHeader>
      <BulkBody {...props} />
    </Card>
  );
}

interface BulkProps {
  query: string;
  connected: boolean;
  templates: MetaTemplate[];
  templatesStatus: "idle" | "loading" | "loaded" | "error";
  templatesError: string | null;
  onLoadTemplates: () => void;
}

function BulkBody({ query, connected, templates, templatesStatus, templatesError, onLoadTemplates }: BulkProps) {
  const { toast } = useToast();
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (connected && templatesStatus === "idle") onLoadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  const approved = templates.filter((item) => item.status === "APPROVED" && item.variables <= 1);
  const template = approved.find((item) => `${item.name}|${item.language}` === choice) || null;
  const unusable = templates.filter((item) => item.status === "APPROVED" && item.variables > 1).length;
  const waiting = templates.filter((item) => item.status === "PENDING").length;
  const emptyLabel = !connected
    ? "Connect WhatsApp to see your templates"
    : templatesStatus === "loading" ? "Loading templates from Meta..."
    : templatesStatus === "error" ? "Couldn't load templates"
    : templatesStatus === "loaded" ? "No approved templates to use yet"
    : "Choose Load templates from Meta";

  const sendBulk = async () => {
    if (!template) return;
    setBusy(true);
    try {
      const target = { action: "bulk", templateName: template.name, language: template.language, variables: template.variables };
      const preview = await api<{ recipients: number }>(`/api/admin/whatsapp/send${query}`, { ...target, preview: true });
      if (preview.recipients === 0) {
        toast({ title: "Nobody to send to", description: "No clients with a number have agreed yet.", variant: "destructive" });
        return;
      }
      if (!window.confirm(`Send "${template.name}" to ${preview.recipients} client${preview.recipients === 1 ? "" : "s"} who agreed? This can't be undone, and Meta charges for these messages.`)) return;
      const result = await api<{ queued: number }>(`/api/admin/whatsapp/send${query}`, target);
      toast({ title: `${result.queued} message${result.queued === 1 ? "" : "s"} queued` });
    } catch (e) {
      toast({ title: "WhatsApp", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
      <CardContent className="space-y-3 py-5">
        <p className="text-xs text-slate-500">
          Only clients marked Agreed receive this, up to 500 at a time. The template can use one variable, the client's first name. Create marketing templates in Meta.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label htmlFor="wa-bulk-template" className="text-xs">Approved template</Label>
            <select
              id="wa-bulk-template"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">{approved.length ? "Choose a template" : emptyLabel}</option>
              {approved.map((item) => (
                <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} ({item.language})</option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!connected || templatesStatus === "loading"}
            title={connected ? undefined : "Connect WhatsApp first"}
            onClick={onLoadTemplates}
          >
            {templatesStatus === "loading" ? "Loading..." : "Load templates from Meta"}
          </Button>
          <Button
            type="button"
            disabled={!template || busy || !connected}
            title={!connected ? "Connect WhatsApp first" : !template ? "Choose a template first" : undefined}
            onClick={() => void sendBulk()}
          >
            {busy ? "Sending..." : "Send to clients who agreed"}
          </Button>
        </div>
        {!connected && (
          <p className="text-xs text-amber-700">Templates come from your Meta account, so they appear here once WhatsApp is connected.</p>
        )}
        {templatesError && <p className="text-xs text-rose-700">{templatesError}</p>}
        {connected && templatesStatus === "loaded" && (
          <p className="text-xs text-slate-500">
            {approved.length} template{approved.length === 1 ? "" : "s"} ready to use.
            {waiting > 0 ? ` ${waiting} still waiting for Meta approval.` : ""}
            {unusable > 0 ? ` ${unusable} use more than one variable, so they can't be sent in bulk.` : ""}
          </p>
        )}
      </CardContent>
  );
}
