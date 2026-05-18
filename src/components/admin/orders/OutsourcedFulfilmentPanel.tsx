/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OutsourcedFulfilmentPanel - Wave 67 Phase D.
 *
 * Lives inside the order modal Details tab. Lists every
 * outsource_assignments row for this order with inline actions for
 * the operator:
 *   - Send request: opens mail / WhatsApp with magic-link pre-filled
 *   - Copy accept link: drops the magic-link onto the clipboard for
 *     pasting into any channel
 *   - Mark accepted manually: for "called Sarah, she said yes" flows
 *   - Set status: advance through en_route / on_site / completed
 *   - Cancel: void this assignment (for reassignment workflows)
 *   - Add provider: opens dialog to attach a new provider to this order
 *
 * Magic-link accept page: /p/accept/{token} (Phase D companion).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  HardHat,
  Plus,
  Mail,
  MessageCircle,
  Copy,
  Check,
  X as XIcon,
  Loader2,
  Pencil,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  outsourceAssignmentService,
  STATUS_TONE,
  type OutsourceAssignmentWithProvider,
  type OutsourceAssignmentStatus,
} from "@/services/outsourceAssignmentService";

interface Props {
  orderId: string;
  orderNumber: string | null;
  companyId: string;
  eventDate: string | null;
  eventTime: string | null;
  clientName: string | null;
  venueAddress: string | null;
  guestCount: number | null;
}

interface ProviderRow {
  id: string;
  provider_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  preferred_contact_channel: string;
  default_rate: number | null;
  default_rate_type: string;
  default_currency: string;
  provider_roles: string[];
}

const STATUS_OPTIONS: Array<{ value: OutsourceAssignmentStatus; label: string }> = [
  { value: "requested", label: "Requested" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "en_route", label: "On the way" },
  { value: "on_site", label: "On site" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function fmtMoney(n: number | undefined, currency = "ZAR"): string {
  if (n == null) return "";
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  } catch { return iso; }
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

export function OutsourcedFulfilmentPanel({
  orderId, orderNumber, companyId, eventDate, eventTime, clientName, venueAddress, guestCount,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<OutsourceAssignmentWithProvider[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [origin, setOrigin] = useState<string>("");

  // Wave 67.5 - multi-provider routing context. When the operator
  // clicks "Add candidate" on an existing requested assignment, we
  // open the add dialog scoped to that assignment's routing_group_id
  // so the new sibling shares the fulfilment slot. First-to-accept
  // auto-cancels the rest via DB trigger.
  const [addCandidateFor, setAddCandidateFor] = useState<OutsourceAssignmentWithProvider | null>(null);

  // Add-form state
  const [pickedProviderId, setPickedProviderId] = useState<string>("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");
  const [quotedCost, setQuotedCost] = useState<string>("");
  const [requiredOnSiteAt, setRequiredOnSiteAt] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const load = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [rows, providersRes] = await Promise.all([
        outsourceAssignmentService.listForOrder(orderId),
        (supabase as any)
          .from("outsource_providers")
          .select("id, provider_name, contact_person, email, phone, whatsapp_number, preferred_contact_channel, default_rate, default_rate_type, default_currency, provider_roles")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("provider_name", { ascending: true }),
      ]);
      setAssignments(rows);
      setProviders((providersRes?.data || []) as ProviderRow[]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orderId, companyId]);

  // Pre-fill the add dialog when a provider is picked: pull defaults
  // from the provider row so the operator doesn't re-type rate/desc.
  const pickedProvider = useMemo(
    () => providers.find((p) => p.id === pickedProviderId) || null,
    [pickedProviderId, providers],
  );
  useEffect(() => {
    if (!pickedProvider) return;
    if (!serviceDescription && pickedProvider.provider_roles?.length) {
      const role = pickedProvider.provider_roles[0].replace(/_/g, " ");
      setServiceDescription(
        `${role} for ${clientName || "this event"}${eventDate ? ` on ${fmtDate(eventDate)}` : ""}`,
      );
    }
    if (!quotedCost && pickedProvider.default_rate != null) {
      setQuotedCost(String(pickedProvider.default_rate));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedProviderId]);

  const openAdd = () => {
    setAddCandidateFor(null);
    setPickedProviderId("");
    setServiceDescription("");
    setScopeNotes("");
    setQuotedCost("");
    // Default on-site time = event_date + event_time when both set.
    if (eventDate && eventTime) {
      setRequiredOnSiteAt(`${eventDate}T${eventTime.slice(0, 5)}`);
    } else {
      setRequiredOnSiteAt("");
    }
    setAddOpen(true);
  };

  // Wave 67.5 - add an alternate provider to an existing requested
  // assignment. Pre-fills scope + on-site from the parent so the
  // operator only picks the new provider + tweaks cost if needed.
  const openAddCandidate = (parent: OutsourceAssignmentWithProvider) => {
    setAddCandidateFor(parent);
    setPickedProviderId("");
    setServiceDescription(parent.service_description);
    setScopeNotes(parent.scope_notes || "");
    setQuotedCost(String(parent.quoted_cost));
    setRequiredOnSiteAt(
      parent.required_on_site_at
        ? new Date(parent.required_on_site_at).toISOString().slice(0, 16)
        : (eventDate && eventTime ? `${eventDate}T${eventTime.slice(0, 5)}` : ""),
    );
    setAddOpen(true);
  };

  const handleAdd = async () => {
    if (!pickedProviderId) {
      toast({ title: "Pick a provider", variant: "destructive" });
      return;
    }
    if (!serviceDescription.trim()) {
      toast({ title: "Describe what you need from them", variant: "destructive" });
      return;
    }
    const cost = Number(quotedCost);
    if (!Number.isFinite(cost) || cost < 0) {
      toast({ title: "Enter a valid cost", variant: "destructive" });
      return;
    }
    setAddBusy(true);
    try {
      // Wave 67.5 - when adding a candidate to an existing
      // routing group, reuse the parent's routing_group_id (or mint
      // a new one if the parent doesn't have one yet, also bumping
      // the parent into the group). When starting fresh, pass
      // undefined so the new assignment stays a single.
      let routingGroupId: string | undefined;
      if (addCandidateFor) {
        if (addCandidateFor.routing_group_id) {
          routingGroupId = addCandidateFor.routing_group_id;
        } else {
          // Promote the parent into a new routing group first so the
          // DB trigger sees both rows as siblings.
          routingGroupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
            ? crypto.randomUUID()
            : "new";
          await (await fetch(`/api/admin/outsource-assignments/${addCandidateFor.id}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "set_routing_group", routingGroupId }),
          })).json().catch(() => null);
        }
      }

      const resp = await fetch("/api/admin/outsource-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          providerId: pickedProviderId,
          serviceDescription: serviceDescription.trim(),
          scopeNotes: scopeNotes.trim() || undefined,
          quotedCost: cost,
          requiredOnSiteAt: requiredOnSiteAt ? new Date(requiredOnSiteAt).toISOString() : undefined,
          rateType: pickedProvider?.default_rate_type,
          costCurrency: pickedProvider?.default_currency,
          routingGroupId,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        toast({ title: "Could not create", description: json?.error || "Try again", variant: "destructive" });
        return;
      }
      toast({ title: "Provider attached", description: pickedProvider?.provider_name });
      setAddOpen(false);
      void load();
    } finally {
      setAddBusy(false);
    }
  };

  const callAction = async (id: string, body: any) => {
    const resp = await fetch(`/api/admin/outsource-assignments/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) {
      toast({ title: "Action failed", description: json?.error || "Try again", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleMarkAccepted = async (a: OutsourceAssignmentWithProvider) => {
    if (await callAction(a.id, { action: "mark_accepted" })) {
      toast({ title: "Marked accepted", description: a.provider?.provider_name });
      void load();
    }
  };

  const handleSetStatus = async (a: OutsourceAssignmentWithProvider, status: OutsourceAssignmentStatus) => {
    if (await callAction(a.id, { action: "set_status", status })) {
      toast({ title: "Status updated", description: STATUS_TONE[status].label });
      void load();
    }
  };

  const handleCancel = async (a: OutsourceAssignmentWithProvider) => {
    const reason = window.prompt(`Cancel ${a.provider?.provider_name || "assignment"}? Optional reason:`, "");
    if (reason === null) return; // user dismissed
    if (await callAction(a.id, { action: "cancel", reason: reason || undefined })) {
      toast({ title: "Cancelled" });
      void load();
    }
  };

  const composedRequest = (a: OutsourceAssignmentWithProvider): { subject: string; body: string; link: string } => {
    const link = a.accept_token ? outsourceAssignmentService.buildAcceptLink(origin, a.accept_token) : "";
    const greeting = a.provider?.contact_person
      ? `Hi ${a.provider.contact_person.split(" ")[0]}`
      : a.provider?.provider_name
        ? `Hi ${a.provider.provider_name}`
        : "Hi there";
    const when = eventDate
      ? `${fmtDate(eventDate)}${eventTime ? ` at ${fmtTime(eventTime)}` : ""}`
      : "TBC";
    const where = venueAddress || "venue TBC";
    const guests = guestCount ? `${guestCount} guests` : "guest count TBC";
    const cost = fmtMoney(Number(a.quoted_cost), a.cost_currency);
    const subject = `Booking request: ${orderNumber || "event"} on ${fmtDate(eventDate)}`;
    const body = [
      greeting + ",",
      "",
      `We have a booking we'd love your help on:`,
      "",
      `${a.service_description}`,
      ``,
      `When: ${when}`,
      `Where: ${where}`,
      `Size: ${guests}`,
      `Agreed rate: ${cost} (${a.rate_type.replace(/_/g, " ")})`,
      "",
      a.scope_notes ? `Notes: ${a.scope_notes}\n` : "",
      `Tap to accept or decline (no login needed): ${link}`,
      "",
      "Thanks!",
    ].filter(Boolean).join("\n");
    return { subject, body, link };
  };

  const sendEmail = (a: OutsourceAssignmentWithProvider) => {
    const email = a.provider?.email;
    if (!email) {
      toast({ title: "No email on file", description: "Add one to the provider record first.", variant: "destructive" });
      return;
    }
    const { subject, body } = composedRequest(a);
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const sendWhatsApp = (a: OutsourceAssignmentWithProvider) => {
    const num = (a.provider?.whatsapp_number || a.provider?.phone || "").replace(/[^\d]/g, "");
    if (!num) {
      toast({ title: "No WhatsApp / phone on file", description: "Add one to the provider record first.", variant: "destructive" });
      return;
    }
    const { body } = composedRequest(a);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
  };

  const copyAcceptLink = async (a: OutsourceAssignmentWithProvider) => {
    const { link } = composedRequest(a);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Accept link copied", description: "Paste anywhere - SMS, email, WhatsApp." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="col-span-2 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <HardHat className="w-4 h-4 text-blue-600" />
            Outsourced fulfilment
            {assignments.length > 0 && (
              <span className="text-xs font-normal text-slate-500">({assignments.length})</span>
            )}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            External providers we&apos;ve asked to fulfil parts of this order. Send the magic-link, they tap accept - no login needed.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={openAdd}
          disabled={providers.length === 0}
          title={providers.length === 0 ? "Add a provider first via /admin/outsource-providers" : "Attach an outsource provider"}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add provider
        </Button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-xs text-slate-500 flex items-center gap-2 py-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-slate-500">
              No outsource providers attached yet.
              {providers.length === 0 && " Register one on /admin/outsource-providers first."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {assignments.map((a) => {
              const tone = STATUS_TONE[a.status];
              const channel = a.provider?.preferred_contact_channel || "email";
              return (
                <li key={a.id} className="rounded-md border border-slate-200 p-3 bg-slate-50/50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          {a.provider?.provider_name || "Provider"}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold ${tone.cls}`}>
                          {tone.label}
                        </span>
                        {a.manually_marked_accepted && (
                          <span className="text-[10px] text-slate-500" title="Operator marked this accepted on the provider's behalf">
                            (manual)
                          </span>
                        )}
                        {a.routing_group_id && (() => {
                          const groupSize = assignments.filter((x) => x.routing_group_id === a.routing_group_id).length;
                          if (groupSize < 2) return null;
                          // Wave 70.5 - if this row is the winner
                          // (accepted) in a routing group, badge it
                          // emerald so it's obvious it beat the
                          // others. Cancelled siblings get a muted
                          // slate badge so the chain is still
                          // visually traceable.
                          const isWinner = a.status === "accepted";
                          const isCancelledSibling = a.status === "cancelled";
                          const cls = isWinner
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : isCancelledSibling
                              ? "bg-slate-100 text-slate-500 border-slate-200"
                              : "bg-blue-50 text-blue-800 border-blue-200";
                          const label = isWinner
                            ? `Won (1 of ${groupSize})`
                            : `1 of ${groupSize}`;
                          return (
                            <span
                              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold ${cls}`}
                              title={`${groupSize} candidates in this routing group - first to accept wins; others auto-cancel`}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-xs text-slate-700 mt-1">{a.service_description}</p>
                      {a.scope_notes && (
                        <p className="text-[11px] text-slate-500 mt-0.5 italic">{a.scope_notes}</p>
                      )}
                      {/* Wave 70.5 - cancellation reason on cancelled
                          rows. When the DB trigger auto-cancels a
                          sibling because another provider accepted
                          first, decline_reason is set to the
                          standard "Another provider accepted first"
                          string. Surface it so operators don't have
                          to wonder why a row that was 'requested'
                          earlier is now greyed out. Falls back to
                          the operator's manual cancel reason if set. */}
                      {a.status === "cancelled" && (a as any).decline_reason && (() => {
                        const reason = (a as any).decline_reason as string;
                        const isAutoCancel = a.routing_group_id && /another provider accepted/i.test(reason);
                        if (isAutoCancel) {
                          // Find the sibling that won so we can name them.
                          const winner = assignments.find(
                            (x) => x.routing_group_id === a.routing_group_id && x.status === "accepted",
                          );
                          return (
                            <p className="text-[11px] mt-1 text-amber-700 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Auto-cancelled: {winner?.provider?.provider_name || "another provider"} accepted first.
                            </p>
                          );
                        }
                        return (
                          <p className="text-[11px] mt-1 text-rose-700">
                            Cancelled: {reason}
                          </p>
                        );
                      })()}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 flex-wrap">
                        <span className="tabular-nums">{fmtMoney(Number(a.quoted_cost), a.cost_currency)} <span className="text-slate-400">/ {a.rate_type.replace(/_/g, " ")}</span></span>
                        {a.required_on_site_at && (
                          <span className="tabular-nums">
                            on site {new Date(a.required_on_site_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {a.provider?.contact_person && (
                          <span>contact: {a.provider.contact_person}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Channel-aware request send - WhatsApp first when preferred */}
                      {channel === "whatsapp" || channel === "sms" ? (
                        <Button size="sm" variant="ghost" onClick={() => sendWhatsApp(a)} title="Send via WhatsApp">
                          <MessageCircle className="w-4 h-4 text-green-700" />
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => sendEmail(a)} title="Send via email">
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyAcceptLink(a)} title="Copy accept link">
                        <Copy className="w-4 h-4" />
                      </Button>
                      {a.status === "requested" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleMarkAccepted(a)}
                            title="Mark accepted on their behalf"
                            className="text-green-700 hover:text-green-800"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          {/* Wave 67.5 - add an alternate provider
                              to the same fulfilment slot. First to
                              accept wins; the others auto-cancel via
                              DB trigger. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAddCandidate(a)}
                            title="Add an alternate provider - first to accept wins"
                            className="text-blue-700 hover:text-blue-800"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {a.status !== "cancelled" && a.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancel(a)}
                          title="Cancel assignment"
                          className="text-rose-600 hover:text-rose-700"
                        >
                          <XIcon className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Status advance bar - shows after acceptance */}
                  {(a.status === "accepted" || a.status === "en_route" || a.status === "on_site") && (
                    <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Advance:</span>
                      {(["en_route", "on_site", "completed"] as OutsourceAssignmentStatus[])
                        .filter((s) => s !== a.status)
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleSetStatus(a, s)}
                            className="px-2 py-0.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px]"
                          >
                            {STATUS_TONE[s].label}
                          </button>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddCandidateFor(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addCandidateFor
                ? `Add alternate to ${addCandidateFor.provider?.provider_name || "this booking"}`
                : "Attach outsource provider"}
            </DialogTitle>
            <DialogDescription>
              {addCandidateFor
                ? "First provider to accept wins; the others auto-cancel. Useful when you need a fast response and want to ask two or three candidates at once."
                : `Pick who fulfils what for ${orderNumber || "this order"}. The provider gets a magic-link to accept or decline.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={pickedProviderId} onValueChange={setPickedProviderId}>
                <SelectTrigger><SelectValue placeholder="Pick from your registry..." /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => {
                    const rate = p.default_rate != null
                      ? ` · R${Number(p.default_rate).toLocaleString("en-ZA")} ${p.default_rate_type.replace(/_/g, " ")}`
                      : "";
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.provider_name}{rate}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>What you need from them</Label>
              <Textarea
                rows={2}
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                placeholder="e.g. Cook spit braai on-site for 43 pax"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Extra notes <span className="text-xs text-slate-400">(optional)</span></Label>
              <Textarea
                rows={2}
                value={scopeNotes}
                onChange={(e) => setScopeNotes(e.target.value)}
                placeholder="Equipment they need to bring, dress code, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Agreed cost (R)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={quotedCost}
                  onChange={(e) => setQuotedCost(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>On site at</Label>
                <Input
                  type="datetime-local"
                  value={requiredOnSiteAt}
                  onChange={(e) => setRequiredOnSiteAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addBusy} className="bg-blue-600 hover:bg-blue-700">
              {addBusy ? "Attaching..." : "Attach + mint accept link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
