/**
 * Quote-specific wrapper around SendEmailDialog.
 *
 * Triggered by the Send button on /admin/quotes for a draft quote.
 * Pre-populates the composer with the resolved quote-ready template
 * (tenant override -> global default -> hardcoded fallback) and posts
 * directly to /api/send-email on confirm so the operator's edits ride
 * through verbatim. Stamps quotes.sent_at + flips the status to 'sent'
 * after a confirmed successful delivery.
 */
import { useEffect, useState } from "react";
import { SendEmailDialog } from "./SendEmailDialog";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";
import { formatQuoteSubject, fmtMoney } from "@/lib/email/subjectFormatters";
import { buildPublicQuoteUrl } from "@/services/publicQuoteService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/observability";

export interface QuoteSendDialogQuote {
  id: string;
  quote_number?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  total?: number | null;
  total_amount?: number | null;
  currency?: string | null;
  event_name?: string | null;
  quote_name?: string | null;
  user_id?: string | null;
  /** TIGHTEN I.111: public token used to build the /q/{token} client
   *  view link that goes into the email body. Required for the link
   *  to render; without it the body falls back to a no-link variant. */
  public_token?: string | null;
  /** TIGHTEN I.128 (2026-06-03): include the live guest count + event
   *  date + booking-update flag so the email body can be specific and
   *  accurate. Bobby caught "edited to 30 guests but the email said
   *  28" - the dialog was opening with the post-save figure but the
   *  body template never referenced guest_count, so old emails the
   *  client had in their inbox stayed visually misleading. Including
   *  it in the body makes the latest send unambiguous about what
   *  changed. */
  guest_count?: number | null;
  event_date?: string | null;
  /** True when this quote already has a linked order (i.e. the client
   *  already accepted). The body copy switches from "Here's your
   *  quote" to "I've updated your booking". */
  is_converted?: boolean;
  /** True when this quote was already sent to the client before (status
   *  was past 'draft' / sent_at was set on a prior send). Drives the
   *  REVISED-quote template instead of the new-quote one, even when the
   *  client hasn't accepted yet. */
  already_sent?: boolean;
}

export interface QuoteSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tenant company id. Required to resolve the template + post the
   *  send. */
  companyId: string;
  /** The quote being sent. Null when the dialog is closed. */
  quote: QuoteSendDialogQuote | null;
  /** Tenant display name to use in the body / subject. When null the
   *  dialog self-fetches from companies.company_name (TIGHTEN I.111
   *  defensive: /admin/quotes/new wasn't passing this so the body said
   *  "Your Catering Company" on every quote). */
  tenantName?: string | null;
  /** Other quotes for the same client that the operator can bundle
   *  into the same email (e.g. on-site vs off-site options). The
   *  parent should filter to the same client_email and exclude the
   *  primary quote. */
  availableQuotes?: QuoteSendDialogQuote[];
  onSent?: (primary: QuoteSendDialogQuote, secondary?: QuoteSendDialogQuote) => void;
}

// TIGHTEN I.111: form defaults like quote_name="Quote" / event_name=""
// leak into the email as "Thanks for letting X quote on Quote." -
// nonsense. Treat these literal strings as missing so the template
// falls through to the no-event-name variant.
const PLACEHOLDER_EVENT_NAMES = new Set([
  "", "quote", "your event", "n/a", "tbd", "tbc", "untitled",
]);
function cleanEventName(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_EVENT_NAMES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function QuoteSendDialog({
  open,
  onOpenChange,
  companyId,
  quote,
  tenantName,
  availableQuotes,
  onSent,
}: QuoteSendDialogProps) {
  const { toast } = useToast();
  const [resolved, setResolved] = useState<{ subject: string; body: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [secondQuote, setSecondQuote] = useState<QuoteSendDialogQuote | null>(null);
  // TIGHTEN I.111: dialog self-fetches the tenant name when the
  // parent didn't pass one. /admin/quotes/new historically passed
  // tenantName={null} which made every quote-send email read "Your
  // Catering Company" instead of the actual catering business.
  const [fetchedTenantName, setFetchedTenantName] = useState<string | null>(null);
  // TIGHTEN I.115: tenant slug for the /q/{token} URL. Without it the
  // production link goes to the apex domain which doesn't serve the
  // app cleanly. Self-fetch alongside the tenant name.
  const [fetchedSlug, setFetchedSlug] = useState<string | null>(null);
  // Operator template override. "auto" lets the dialog decide between
  // the first-time and revised wording from isRevised below; the
  // operator can force either template instead (e.g. send the
  // first-time wording again, or use the revised wording on a quote
  // that was technically never sent). Resets to "auto" on close.
  const [templateChoice, setTemplateChoice] =
    useState<"auto" | "email_quote_sent" | "email_quote_revised">("auto");

  const total = Number(quote?.total ?? quote?.total_amount ?? 0);
  // Strip placeholder defaults from the event label so the body doesn't
  // read "Thanks for letting X quote on Quote."
  const cleanedEvent = cleanEventName(quote?.event_name) ?? cleanEventName(quote?.quote_name);
  const eventLabel = cleanedEvent || "your event";
  const firstName = String(quote?.client_name || "there").split(" ")[0] || "there";
  const tn = (tenantName || fetchedTenantName || "Your Catering Company").trim();
  const currency = quote?.currency || "ZAR";
  // TIGHTEN I.111: use the shared fmtMoney helper so the body and
  // subject render the same shape ("R 3 602" / "$3,602"). Previously
  // built "ZAR 3601.71" with no symbol or separator.
  const totalLabel = fmtMoney(total, currency) || `${currency} ${total.toFixed(2)}`;
  const quoteUrl =
    quote?.public_token && typeof window !== "undefined"
      ? buildPublicQuoteUrl(quote.public_token, fetchedSlug)
      : null;

  // Self-fetch company_name + slug on first open. TIGHTEN I.115:
  // always fetch slug regardless of whether the parent passed
  // tenantName - the slug is required to build a working production
  // URL via the tenant-rewrite chain.
  useEffect(() => {
    if (!open || !companyId) return;
    if (fetchedTenantName && fetchedSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("companies")
          .select("company_name, slug")
          .eq("id", companyId)
          .maybeSingle();
        if (cancelled) return;
        const row = data as any;
        if (row?.company_name && !tenantName) {
          setFetchedTenantName(String(row.company_name).trim());
        }
        if (row?.slug) setFetchedSlug(String(row.slug).trim());
      } catch (e) {
        console.warn("[QuoteSendDialog] company fetch failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId, tenantName, fetchedTenantName, fetchedSlug]);

  // TIGHTEN I.128 (2026-06-03): pull the latest figures off the quote
  // prop. Re-resolve whenever they change so the body never carries
  // a stale guest count or total. Bobby caught the dialog showing a
  // 28-guest email body after he'd already saved at 30 guests.
  const guestCount = Number(quote?.guest_count ?? 0);
  const eventDateLabel = quote?.event_date
    ? new Date(String(quote.event_date)).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const isConverted = !!quote?.is_converted;
  // "Revised" = already sent before (re-send after edits) OR converted
  // (booking update). Either way it's NOT a fresh first-time quote, so it
  // uses the "Revised quote" template, not "Quote just sent". isConverted
  // alone missed the common case: a sent-but-not-yet-accepted quote being
  // re-sent (Pic 63 - it wrongly used the new-quote wording).
  const isRevised = isConverted || !!quote?.already_sent;
  // The template the dialog would pick on its own...
  const autoTemplateType = isRevised ? "email_quote_revised" : "email_quote_sent";
  // ...and the one actually used: the operator's override wins over auto.
  const effectiveTemplateType =
    templateChoice === "auto" ? autoTemplateType : templateChoice;
  const effectiveIsRevised = effectiveTemplateType === "email_quote_revised";

  // Second-quote derived values (only computed when one is selected).
  const secondTotal = Number(secondQuote?.total ?? secondQuote?.total_amount ?? 0);
  const secondCurrency = secondQuote?.currency || currency;
  const secondCleanedEvent = secondQuote
    ? (cleanEventName(secondQuote.event_name) ?? cleanEventName(secondQuote.quote_name))
    : null;
  const secondTotalLabel = secondQuote
    ? (fmtMoney(secondTotal, secondCurrency) || `${secondCurrency} ${secondTotal.toFixed(2)}`)
    : "";
  const secondGuestCount = Number(secondQuote?.guest_count ?? 0);
  const secondEventDateLabel = secondQuote?.event_date
    ? new Date(String(secondQuote.event_date)).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const secondQuoteUrl =
    secondQuote?.public_token && typeof window !== "undefined"
      ? buildPublicQuoteUrl(secondQuote.public_token, fetchedSlug)
      : null;

  useEffect(() => {
    if (!open || !quote || !companyId) {
      setResolved(null);
      return;
    }

    // When a second quote is bundled, skip the template resolver:
    // no tenant template supports two-quote bodies. Build the fallback
    // directly with both quotes and return early.
    if (secondQuote) {
      setResolved({
        subject: formatQuoteSubject({
          eventName: cleanedEvent,
          tenantName: tn,
          total,
          quoteNumber: quote.quote_number || quote.id,
          currencyCode: currency,
        }),
        body: buildFallbackBody({
          firstName,
          tenantName: tn,
          eventName: cleanedEvent,
          quoteNumber: quote.quote_number || quote.id,
          amount: totalLabel,
          quoteUrl,
          guestCount: guestCount > 0 ? guestCount : null,
          eventDateLabel,
          isConverted,
          secondQuoteData: {
            quoteNumber: secondQuote.quote_number || secondQuote.id,
            amount: secondTotalLabel,
            quoteUrl: secondQuoteUrl,
            guestCount: secondGuestCount > 0 ? secondGuestCount : null,
            eventDateLabel: secondEventDateLabel,
            eventName: secondCleanedEvent,
          },
        }),
      });
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);
    (async () => {
      try {
        const result = await resolveEmailTemplate({
          companyId,
          templateType: effectiveTemplateType,
          variables: {
            first_name: firstName,
            client_name: quote.client_name || "there",
            tenant_name: tn,
            event_name: eventLabel,
            quote_number: quote.quote_number || quote.id,
            amount: totalLabel,
            company_name: tn,
            quote_url: quoteUrl || "",
            // TIGHTEN I.128: now passes the current guest count + event
            // date so templates can substitute them. The Spit Braai
            // tenant explicitly wants the booking-update email to read
            // "30 guests on 6 June" so the client sees what changed.
            guest_count: guestCount > 0 ? String(guestCount) : "",
            event_date: eventDateLabel || "",
          },
          // Fallback when no tenant override exists: use the SAME registry
          // default the Templates tab shows for this template, so the
          // composer's starting text matches what the operator edits there
          // (resolveEmailTemplate substitutes the {{tags}} below). Only
          // when the quote has no public link (no quoteUrl) do we drop to
          // buildFallbackBody, which has the "see the attached PDF" wording
          // the link-less registry default lacks.
          fallback: (() => {
            const regKey = effectiveTemplateType;
            const regDef = TEMPLATE_REGISTRY.find((t) => t.key === regKey);
            if (regDef && quoteUrl) {
              return {
                subject: regDef.defaultSubject || formatQuoteSubject({
                  eventName: cleanedEvent, tenantName: tn, total, quoteNumber: quote.quote_number || quote.id, currencyCode: currency,
                }),
                bodyHtml: regDef.defaultBody,
              };
            }
            return {
              subject: formatQuoteSubject({
                eventName: cleanedEvent,
                tenantName: tn,
                total: total,
                quoteNumber: quote.quote_number || quote.id,
                currencyCode: currency,
              }),
              bodyHtml: buildFallbackBody({
                firstName,
                tenantName: tn,
                eventName: cleanedEvent,
                quoteNumber: quote.quote_number || quote.id,
                amount: totalLabel,
                quoteUrl: quoteUrl,
                guestCount: guestCount > 0 ? guestCount : null,
                eventDateLabel,
                isConverted,
              }),
            };
          })(),
        });
        if (!cancelled) {
          setResolved({ subject: result.subject, body: result.bodyHtml });
        }
      } catch (e) {
        console.warn("[QuoteSendDialog] template resolve failed:", e);
        if (!cancelled) {
          setResolved({
            subject: formatQuoteSubject({
              eventName: cleanedEvent,
              tenantName: tn,
              total,
              quoteNumber: quote.quote_number || quote.id,
              currencyCode: currency,
            }),
            body: buildFallbackBody({
              firstName,
              tenantName: tn,
              eventName: cleanedEvent,
              quoteNumber: quote.quote_number || quote.id,
              amount: totalLabel,
              quoteUrl,
              guestCount: guestCount > 0 ? guestCount : null,
              eventDateLabel,
              isConverted,
            }),
          });
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote?.id, companyId, tn, quoteUrl, total, guestCount, eventDateLabel, isConverted, effectiveTemplateType, secondQuote?.id]);

  if (!quote) return null;

  // Operator-facing template picker. Lets them choose which wording goes
  // out instead of being locked to the auto choice. Editing the actual
  // template content is a separate admin screen (link below the body).
  const templateOptions: Array<{ key: "auto" | "email_quote_sent" | "email_quote_revised"; label: string }> = [
    { key: "auto", label: `Auto (${autoTemplateType === "email_quote_revised" ? "Revised" : "First-time"})` },
    { key: "email_quote_sent", label: "First-time send" },
    { key: "email_quote_revised", label: "Revised quote" },
  ];
  const templatePicker = (
    <div className="border rounded-md p-3 bg-slate-50 space-y-1.5">
      <p className="text-sm font-medium text-slate-700">Email template</p>
      <p className="text-xs text-slate-500">
        Which wording to send. Auto picks for you based on whether this quote went out before.
        Edit the wording itself in Settings (link under the message).
      </p>
      <div className="flex flex-wrap gap-2">
        {templateOptions.map((opt) => {
          const active = templateChoice === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTemplateChoice(opt.key)}
              className={
                "px-3 py-1.5 rounded-md text-sm border transition " +
                (active
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const secondQuotePicker =
    availableQuotes && availableQuotes.length > 0 ? (
      <div className="border rounded-md p-3 bg-slate-50 space-y-1.5">
        <p className="text-sm font-medium text-slate-700">Add a second quote to this email</p>
        <p className="text-xs text-slate-500">
          Useful when offering on-site and off-site options together.
        </p>
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={secondQuote?.id || ""}
          onChange={(e) => {
            const picked = availableQuotes.find((q) => q.id === e.target.value) ?? null;
            setSecondQuote(picked);
          }}
        >
          <option value="">- none -</option>
          {availableQuotes.map((q) => {
            const lbl =
              cleanEventName(q.event_name) ??
              cleanEventName(q.quote_name) ??
              q.quote_number ??
              q.id;
            return (
              <option key={q.id} value={q.id}>
                {q.quote_number ? `${q.quote_number} - ` : ""}
                {lbl}
              </option>
            );
          })}
        </select>
      </div>
    ) : null;

  return (
    <SendEmailDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSecondQuote(null);
          setTemplateChoice("auto");
        }
        onOpenChange(o);
      }}
      title="Send quote to client"
      description={resolving ? "Loading template..." : "Review and edit the email before sending."}
      defaultTo={quote.client_email || ""}
      defaultSubject={resolved?.subject || ""}
      defaultBody={resolved?.body || ""}
      attachmentFilename={
        secondQuote
          ? `Quote-${quote.quote_number || quote.id}.pdf + Quote-${secondQuote.quote_number || secondQuote.id}.pdf`
          : quote.quote_number
          ? `Quote-${quote.quote_number}.pdf`
          : "Quote.pdf"
      }
      sendLabel="Send quote"
      extraTopContent={<>{templatePicker}{secondQuotePicker}</>}
      templateEditHref="/admin/email-templates?tab=templates"
      templateEditLabel={effectiveIsRevised ? '"Revised quote" template' : '"Quote just sent" template'}
      onSend={async (payload) => {
        try {
          const response = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              to: payload.to,
              subject: payload.subject,
              body: payload.body,
              quoteId: quote.id,
              quoteId2: secondQuote?.id || null,
              attachQuotePdf: payload.attachPdf,
              variables: {
                clientName: quote.client_name || "there",
                companyName: tn,
                quoteNumber: quote.quote_number || quote.id,
                totalAmount: totalLabel,
                // TIGHTEN I.111: forward quote_url so any single-brace
                // {quoteUrl} tokens in tenant-saved bodies render too.
                quoteUrl: quoteUrl || "",
              },
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data?.success === false) {
            return {
              success: false as const,
              error: {
                message: data?.error || "Failed to send quote.",
                fix_link: data?.fix_link,
              },
            };
          }
          // Stamp sent_at + flip status on both quotes.
          const now = new Date().toISOString();
          const stampIds = [quote.id, secondQuote?.id].filter(Boolean) as string[];
          await Promise.allSettled(
            stampIds.map((id) =>
              supabase
                .from("quotes")
                .update({ status: "sent", sent_at: now })
                .eq("id", id)
                .is("sent_at", null)
            )
          );
          toast({
            title: "Quote sent",
            description: secondQuote
              ? `Sent ${quote.quote_number || "quote"} + ${secondQuote.quote_number || "second quote"} to ${payload.to}.`
              : `Sent to ${payload.to}.`,
          });
          onSent?.(quote, secondQuote ?? undefined);
          return { success: true } as const;
        } catch (err: any) {
          // TIGHTEN I.98: route quote-send failures through Sentry.
          // Quote send is money-touching - silent failures hide outbox
          // / template / provider bugs the operator needs to see.
          captureException(err, {
            level: "error",
            tags: {
              op: "quote.send",
              companyId: companyId || "(unknown)",
              quoteId: quote?.id || "(unknown)",
            },
          });
          return {
            success: false as const,
            error: { message: err?.message || "Send failed unexpectedly." },
          };
        }
      }}
    />
  );
}

/**
 * TIGHTEN I.111 / I.128: shared fallback body builder. Two flavours:
 *
 *  - initial quote send: "Your quote QT-XXX is ready - total X. View
 *    and accept here."
 *  - booking update on a converted quote: "I've updated your booking.
 *    The new details are: N guests on <date>, new total X. The order
 *    page below already reflects the change - no action needed unless
 *    you'd like to discuss."
 *
 * Both flavours embed the magic link so the client can click through
 * to the polished /q/{token} (or order page) without digging out a
 * PDF attachment.
 */
function buildOptionBlock(opt: {
  quoteNumber: string;
  amount: string;
  quoteUrl: string | null;
  guestCount: number | null;
  eventDateLabel: string | null;
  eventName: string | null;
  label: string;
}): string[] {
  const details: string[] = [];
  if (opt.guestCount && opt.guestCount > 0)
    details.push(`${opt.guestCount} guest${opt.guestCount === 1 ? "" : "s"}`);
  if (opt.eventDateLabel) details.push(opt.eventDateLabel);

  const heading = opt.eventName
    ? `${opt.label} - ${opt.quoteNumber} (${opt.eventName})`
    : `${opt.label} - ${opt.quoteNumber}`;

  const block: string[] = [heading, `  ${details.join(" - ")}`];
  if (opt.quoteUrl) {
    block.push(`  View this quote: ${opt.quoteUrl}`);
  }
  return block;
}

function buildFallbackBody(input: {
  firstName: string;
  tenantName: string;
  eventName: string | null;
  quoteNumber: string;
  amount: string;
  quoteUrl: string | null;
  guestCount: number | null;
  eventDateLabel: string | null;
  isConverted: boolean;
  secondQuoteData?: {
    quoteNumber: string;
    amount: string;
    quoteUrl: string | null;
    guestCount: number | null;
    eventDateLabel: string | null;
    eventName: string | null;
  };
}): string {
  const {
    firstName, tenantName, eventName, quoteNumber, amount, quoteUrl,
    guestCount, eventDateLabel, isConverted, secondQuoteData,
  } = input;

  const lines: string[] = [`Hi ${firstName},`, ""];

  if (secondQuoteData) {
    // Two-option path: operator is sending on-site + off-site (or any
    // two alternatives) in one email.
    lines.push("Thanks for the opportunity to quote you. I've put together two options:");
    lines.push("");
    lines.push(...buildOptionBlock({
      quoteNumber,
      amount,
      quoteUrl,
      guestCount,
      eventDateLabel,
      eventName,
      label: "Option 1",
    }));
    lines.push("");
    lines.push(...buildOptionBlock({
      quoteNumber: secondQuoteData.quoteNumber,
      amount: secondQuoteData.amount,
      quoteUrl: secondQuoteData.quoteUrl,
      guestCount: secondQuoteData.guestCount,
      eventDateLabel: secondQuoteData.eventDateLabel,
      eventName: secondQuoteData.eventName,
      label: "Option 2",
    }));
    lines.push("");
    lines.push("Reply to this email if you'd like to chat through either option.");
  } else if (isConverted) {
    // Booking-update path. Bobby's call: when the operator edits a
    // converted quote (live order in flight), the email must read as
    // an UPDATE, not a fresh quote ask. The client already accepted.
    const details: string[] = [];
    if (guestCount && guestCount > 0) details.push(`${guestCount} guest${guestCount === 1 ? "" : "s"}`);
    if (eventDateLabel) details.push(eventDateLabel);
    const detailsLine = details.join(" - ");

    const eventPhrase = eventName ? ` for your ${eventName}` : "";
    lines.push(`I've updated your booking${eventPhrase} (${quoteNumber}). The latest details are:`);
    lines.push("");
    lines.push(`  ${detailsLine}`);
    lines.push("");
    if (quoteUrl) {
      lines.push("Your live order page is up to date:");
      lines.push(quoteUrl);
      lines.push("");
      lines.push("No action needed - the changes are already booked in. Reply if you'd like to walk through anything.");
    } else {
      lines.push("Reply if you'd like to walk through anything.");
    }
  } else {
    // Initial-send path (single quote).
    const details: string[] = [];
    if (guestCount && guestCount > 0) details.push(`${guestCount} guest${guestCount === 1 ? "" : "s"}`);
    if (eventDateLabel) details.push(eventDateLabel);
    const detailsLine = details.join(" - ");

    lines.push(`Thanks for the opportunity to quote you. Your quote ${quoteNumber} is ready:`);
    lines.push("");
    lines.push(`  ${detailsLine}`);
    if (quoteUrl) {
      lines.push("");
      lines.push("View the quote here:");
      lines.push(quoteUrl);
      lines.push("");
      lines.push("Or reply to this email if you'd like to chat through it first.");
    } else {
      lines.push("");
      lines.push("Have a look at the attached PDF and reply with any tweaks, or let us know you're happy to go ahead.");
    }
  }

  lines.push("");
  lines.push("Thanks,");
  lines.push(tenantName);
  return lines.join("\n");
}
