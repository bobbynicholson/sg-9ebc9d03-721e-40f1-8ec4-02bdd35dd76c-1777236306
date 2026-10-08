/**
 * "Email client" drawer for the Email button on leads, quotes and orders.
 *
 * Wraps the shared MessageComposer (review-before-send, direct send through
 * the platform, Gmail / Outlook / copy, WhatsApp) with a template picker:
 *   - any page-specific suggestions the caller passes (e.g. the lead's
 *     usual reply for its stage)
 *   - "We're fully booked" - registry template email_fully_booked, using
 *     the company's own edited wording when they have saved one
 *   - "Blank email"
 * Picking a template refills subject + body; the operator can edit
 * everything before sending.
 */
import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { MessageComposer, type ContextRow } from "@/components/messaging/MessageComposer";
import { resolveTemplate } from "@/services/messageTemplateService";

export interface ClientEmailOption {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export interface ClientEmailDrawerProps {
  title: string;
  contextLabel: string;
  contextRows: ContextRow[];
  recipient: { name: string; email: string | null; phone?: string | null; clientId?: string | null };
  companyId: string | null;
  fromName: string;
  /** Template variables ({{first_name}}, {{event_date}} ...). */
  vars: {
    first_name: string;
    client_name: string;
    tenant_name?: string;
    event_name: string;
    event_date: string;
    guest_count?: string | number | null;
  };
  /** Page-specific templates shown first in the picker. */
  extraOptions?: ClientEmailOption[];
  /** Which option to start on (defaults to the first). */
  defaultOptionId?: string;
  quoteId?: string | null;
  orderId?: string | null;
  onSent?: () => void;
  onClose: () => void;
}

export function ClientEmailDrawer(props: ClientEmailDrawerProps) {
  const { companyId, fromName, vars } = props;
  const [fullyBooked, setFullyBooked] = useState<ClientEmailOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await resolveTemplate({
        companyId,
        key: "email_fully_booked",
        ctx: {
          first_name: vars.first_name,
          client_name: vars.client_name,
          tenant_name: vars.tenant_name || fromName || "",
          company_name: vars.tenant_name || "",
          from_name: fromName || "the team",
          event_name: vars.event_name,
          event_date: vars.event_date,
          guest_count: vars.guest_count ?? "",
        },
      }).catch(() => null);
      if (!cancelled && resolved) {
        setFullyBooked({ id: "fully_booked", label: "Tell them we're fully booked", subject: resolved.subject, body: resolved.body });
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, fromName, vars.first_name, vars.client_name, vars.tenant_name, vars.event_name, vars.event_date, vars.guest_count]);

  const options = useMemo<ClientEmailOption[]>(() => {
    const list: ClientEmailOption[] = [...(props.extraOptions || [])];
    if (fullyBooked) list.push(fullyBooked);
    list.push({
      id: "blank",
      label: "Write my own",
      subject: "",
      body: `Hi ${vars.first_name || "there"},\n\n\n\nBest,\n${fromName || "the team"}`,
    });
    return list;
  }, [props.extraOptions, fullyBooked, vars.first_name, fromName]);

  const [selected, setSelected] = useState<string>(props.defaultOptionId || "");
  const current = options.find((o) => o.id === selected) || options[0];

  return (
    // Re-mounting on a new template choice refills subject + body even after
    // the operator has typed (the composer stops auto-filling once edited).
    <MessageComposer
      key={current?.id || "none"}
      icon={<Mail className="w-5 h-5 text-brand-primary" />}
      title={props.title}
      subtitle="Choose a ready-made message below, change anything you like, then send."
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Start from:</span>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelected(o.id)}
              className={`rounded-full border px-3 py-1 text-xs ${current?.id === o.id ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
      contextLabel={props.contextLabel}
      contextRows={props.contextRows}
      recipient={props.recipient}
      template={{ subject: current?.subject || "", body: current?.body || "" }}
      fromName={fromName}
      directEmail={companyId ? { companyId, quoteId: props.quoteId ?? null, orderId: props.orderId ?? null } : undefined}
      footerHint={'Change the wording of "We\'re fully booked" for everyone under Settings > Messages > Templates.'}
      onSent={() => props.onSent?.()}
      onClose={props.onClose}
    />
  );
}
