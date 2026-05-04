/**
 * MessageComposer -- shared compose form used inside ComposeDrawerHost.
 *
 * Same surface used by Quotes and Leads. The caller hands us:
 *   - a recipient (name + email; phone is optional, surfaced for
 *     context when the team is on a thin connection and might pivot
 *     to WhatsApp)
 *   - the suggested template (subject + body, computed by the caller
 *     from a status / kind helper)
 *   - context rows for the right-rail card ("This quote", "This lead")
 *   - an optional banner above the form (diary signal, lost-deal hint)
 *   - an optional controls slot above the form (sweetener offer
 *     picker, tone toggle, etc.)
 *
 * The composer owns:
 *   - subject + body local state
 *   - "auto template vs manual edit" tracking so updating the template
 *     externally doesn't blow away the operator's typed draft
 *   - the four send actions (Open in Gmail / Open in Outlook / Default
 *     mail app / Copy)
 *
 * UX rules are documented in /docs/ui-conventions.md.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, ExternalLink, Copy, Send } from "lucide-react";
import { composeEmail } from "@/lib/composeEmail";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import type { ClientWhatsAppContext, ClientWhatsAppKind, StaffWhatsAppContext, StaffWhatsAppKind } from "@/lib/whatsappTemplates";

export interface ComposerRecipient {
  name: string;
  email: string | null | undefined;
  phone?: string | null;
  /** clients.id -- threaded into WhatsAppButton so the opt-out gate
   *  resolves automatically when present. Optional; without it the
   *  button assumes the client has not opted out. */
  clientId?: string | null;
}

/**
 * Optional WhatsApp slot on the composer. When present, a fifth send
 * action sits next to Gmail / Outlook / mailto / Copy and the operator
 * can pivot to WhatsApp without losing what they have drafted. The
 * WhatsApp template catalog is independent of the email body so the
 * channel-appropriate wording shows up (short on WhatsApp, fuller on
 * email).
 */
export interface WhatsAppSlot {
  kind: "client";
  ctx: ClientWhatsAppContext;
  templates?: ClientWhatsAppKind[];
  defaultTemplate?: ClientWhatsAppKind;
}
export interface WhatsAppStaffSlot {
  kind: "staff";
  ctx: StaffWhatsAppContext;
  templates?: StaffWhatsAppKind[];
  defaultTemplate?: StaffWhatsAppKind;
}

export interface ComposerTemplate {
  subject: string;
  body: string;
}

export interface ContextRow {
  label: string;
  /** Raw value -- caller decides how it shows (e.g. formatted money). */
  value: React.ReactNode;
  /** Optional title attribute for hover, useful for truncated values. */
  title?: string;
  /** Visually emphasises the row -- used for totals. */
  emphasis?: boolean;
  /** Adds a divider above the row. */
  divider?: boolean;
}

export interface MessageComposerProps {
  /** Header icon, defaults to a Send paper-plane in emerald. */
  icon?: React.ReactNode;
  /** Required header copy. */
  title: string;
  subtitle?: string;
  /** Optional banner above the form (e.g. diary callout). */
  banner?: React.ReactNode;
  /** Optional control panel above the form (e.g. sweetener offer picker). */
  controls?: React.ReactNode;
  /** Right-rail card label (e.g. "This quote", "This lead"). */
  contextLabel: string;
  contextRows: ContextRow[];
  recipient: ComposerRecipient;
  template: ComposerTemplate;
  /** Sender's display name -- ends up in the body sign-off. */
  fromName?: string;
  /** Footer help line under the textarea. */
  footerHint?: string;
  /** Called after the operator picks a send channel so the caller can
   *  log a touch / mark as contacted. Optional. */
  onSent?: (channel: "gmail" | "outlook" | "mailto" | "clipboard" | "whatsapp") => void;
  /** Optional WhatsApp slot. When present + the recipient has a phone,
   *  a fifth send action appears next to the email channels. */
  whatsapp?: WhatsAppSlot | WhatsAppStaffSlot;
  /** Optional public-share URL. When present, a 'Copy public link'
   *  button is rendered next to the Copy action so the operator
   *  can drop the URL into the message body or paste into WhatsApp. */
  publicLink?: string | null;
  onClose: () => void;
}

export function MessageComposer({
  icon, title, subtitle, banner, controls,
  contextLabel, contextRows, recipient, template,
  fromName, footerHint, onSent, whatsapp, publicLink, onClose,
}: MessageComposerProps) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [copied, setCopied] = useState(false);
  // When the user has manually edited the body we stop re-rendering it
  // from the template -- otherwise the caller updating template (e.g.
  // sweetener tweaks) would wipe their wording.
  const [autoTemplate, setAutoTemplate] = useState(true);

  // Pick up new templates while the user hasn't started typing.
  useEffect(() => {
    if (!autoTemplate) return;
    setSubject(template.subject);
    setBody(template.body);
  }, [autoTemplate, template.subject, template.body]);

  // Reset to auto mode when the recipient changes (e.g. clicking a
  // different lead).
  useEffect(() => {
    setAutoTemplate(true);
    setSubject(template.subject);
    setBody(template.body);
    // Recipient identity is the trigger; templates change with the
    // caller's state so we avoid a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient.email, recipient.name]);

  const payload = {
    to: recipient.email || "",
    subject,
    body,
    fromName,
  };

  const handleSent = (channel: "gmail" | "outlook" | "mailto" | "clipboard" | "whatsapp") => {
    if (onSent) onSent(channel);
  };

  return (
    <>
      <div className="flex flex-col space-y-2 text-left">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          {icon ?? <Send className="w-5 h-5 text-emerald-600" />}
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {banner && <div className="mt-3">{banner}</div>}
      {controls && <div className="mt-3">{controls}</div>}

      {/* Two-column layout when the drawer is wide enough: the context
          card pins to the right rail; the composer takes the rest. */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(240px,300px)] gap-6 mt-4">
        <div className="space-y-4 min-w-0">
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
            <Input
              value={subject}
              onChange={(e) => { setAutoTemplate(false); setSubject(e.target.value); }}
              className="mt-1 h-11 text-base"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message</label>
            <textarea
              value={body}
              onChange={(e) => { setAutoTemplate(false); setBody(e.target.value); }}
              rows={20}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-3 text-sm leading-6 min-h-[420px]"
            />
            {footerHint && (
              <p className="text-[11px] text-slate-500 mt-1">{footerHint}</p>
            )}
          </div>
        </div>

        <Card className="border-0 shadow-sm bg-slate-50 xl:order-last order-first xl:sticky xl:top-2 xl:self-start">
          <CardContent className="py-4 px-4 text-xs space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              {contextLabel}
            </div>
            {contextRows.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className={
                  row.divider
                    ? "flex justify-between gap-3 border-t border-slate-200 pt-2"
                    : "flex justify-between gap-3"
                }
              >
                <span className="text-slate-500 flex-shrink-0">{row.label}</span>
                <span
                  className={
                    row.emphasis
                      ? "font-semibold text-slate-900 truncate"
                      : "font-medium text-slate-900 truncate"
                  }
                  title={row.title}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 mt-6">
        {/* Send actions -- email channels in a row, plus an optional
            WhatsApp pivot when the recipient has a mobile. WhatsApp
            uses its own short-form template catalog so the body that
            opens in the chat is channel-appropriate, not the long
            email body the operator has been editing above. */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="default"
            disabled={!recipient.email}
            onClick={() => {
              window.open(composeEmail.gmailUrl(payload), "_blank", "noopener");
              handleSent("gmail");
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <ExternalLink className="w-4 h-4" /> Open in Gmail
          </Button>
          <Button
            variant="outline"
            disabled={!recipient.email}
            onClick={() => {
              window.open(composeEmail.outlookUrl(payload), "_blank", "noopener");
              handleSent("outlook");
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Outlook
          </Button>
          <Button
            variant="outline"
            disabled={!recipient.email}
            onClick={() => {
              window.location.href = composeEmail.mailto(payload);
              handleSent("mailto");
            }}
            className="gap-2"
          >
            <Mail className="w-4 h-4" /> Default mail app
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await composeEmail.copyToClipboard(payload);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                handleSent("clipboard");
              }
            }}
            className="gap-2"
          >
            <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy"}
          </Button>
        </div>

        {/* Public share link. Optional -- only renders when the
            caller passed a publicLink string. Lets the operator
            paste the /q/[token] URL into the email body or share
            it via WhatsApp without leaving the drawer. */}
        {publicLink && (
          <div className="flex items-center justify-between gap-3 pt-2 text-xs">
            <p className="text-slate-500">
              Public quote link: <span className="font-mono text-slate-700">{publicLink}</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // ignore -- the URL is visible above for manual copy
                }
              }}
            >
              <Copy className="w-3.5 h-3.5" /> Copy public link
            </Button>
          </div>
        )}

        {/* WhatsApp pivot. Only shows when the caller passed a slot AND
            we have a phone number to send to. Renders full-width so it
            reads as an alternative channel, not a fifth email option. */}
        {whatsapp && recipient.phone && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Prefer WhatsApp? Pre-filled message in the green-tick app, you hit send.
              </p>
              {whatsapp.kind === "client" ? (
                <WhatsAppButton
                  kind="client"
                  phone={recipient.phone}
                  clientId={recipient.clientId || null}
                  ctx={whatsapp.ctx}
                  templates={whatsapp.templates}
                  defaultTemplate={whatsapp.defaultTemplate}
                  variant="outline"
                  size="sm"
                  label="Send on WhatsApp"
                  onSent={() => handleSent("whatsapp")}
                />
              ) : (
                <WhatsAppButton
                  kind="staff"
                  phone={recipient.phone}
                  ctx={whatsapp.ctx}
                  templates={whatsapp.templates}
                  defaultTemplate={whatsapp.defaultTemplate}
                  variant="outline"
                  size="sm"
                  label="Send on WhatsApp"
                  onSent={() => handleSent("whatsapp")}
                />
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 text-center">
          Direct send via your own SMTP / Gmail OAuth coming soon. Until then these four options keep the email looking like it came from you, not from us.
        </p>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}
