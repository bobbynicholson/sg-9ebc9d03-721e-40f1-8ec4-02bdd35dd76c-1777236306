/**
 * WhatsAppButton -- the single way to send a WhatsApp message from
 * anywhere in the admin tool.
 *
 * Behaviour:
 *   - Renders as a button. Click opens a small popover.
 *   - Popover lets the operator pick a template (chips), tweak the
 *     message in a textarea, then hit "Send via WhatsApp" which opens
 *     the right deep-link for the platform (mobile -> wa.me, desktop
 *     -> web.whatsapp.com/send so we skip the download nudge).
 *   - Hides cleanly when the phone is missing or looks like a SA
 *     landline -- no point firing a chat that will never deliver.
 *     Pass `forceShow` to override the landline filter (useful for
 *     non-SA office numbers where our heuristic does not apply).
 *
 * Two flavours:
 *   - `kind="client"` -- shows the client template catalog.
 *   - `kind="staff"`  -- shows the staff template catalog.
 *
 * Used by:
 *   /admin/leads        (client lead follow-up)
 *   /admin/quotes       (client quote chase)
 *   /admin/orders       (client event-week / day-of)
 *   /admin/clients      (client follow-up)
 *   /admin/tracking     (client delay / arrived)
 *   /admin/driver-management (staff)
 *   /admin/kitchen-staff     (staff)
 *   /admin/users             (staff -- where mobile is captured)
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageCircle, Send } from "lucide-react";
import { isLikelyMobile, openWhatsApp } from "@/lib/whatsapp";
import {
  CLIENT_WHATSAPP_LABELS,
  STAFF_WHATSAPP_LABELS,
  renderClientWhatsApp,
  renderStaffWhatsApp,
  type ClientWhatsAppContext,
  type ClientWhatsAppKind,
  type StaffWhatsAppContext,
  type StaffWhatsAppKind,
} from "@/lib/whatsappTemplates";

type ButtonSize = "sm" | "default" | "lg" | "icon";
type ButtonVariant = "default" | "outline" | "ghost" | "secondary";

interface BaseProps {
  phone: string | null | undefined;
  /** Bypass the mobile heuristic. Use for non-SA numbers. */
  forceShow?: boolean;
  /** Visual sizing -- maps to shadcn Button sizes. */
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Tailwind extras for the trigger button. */
  className?: string;
  /** Defaults to "WhatsApp". Pass "" to render the icon-only chip. */
  label?: string;
  /** Default template selected when the popover opens. */
  defaultTemplate?: ClientWhatsAppKind | StaffWhatsAppKind;
  /** Called after the chat is opened (analytics / "marked as touched"). */
  onSent?: (templateKey: string) => void;
}

interface ClientProps extends BaseProps {
  kind: "client";
  ctx: ClientWhatsAppContext;
  /** Trim the template list down to the most relevant kinds. */
  templates?: ClientWhatsAppKind[];
}

interface StaffProps extends BaseProps {
  kind: "staff";
  ctx: StaffWhatsAppContext;
  templates?: StaffWhatsAppKind[];
}

type Props = ClientProps | StaffProps;

const DEFAULT_CLIENT_TEMPLATES: ClientWhatsAppKind[] = [
  "lead_followup", "quote_sent", "quote_chase", "quote_accepted",
  "event_week", "event_day_morning", "event_arrived", "delay_alert",
];

const DEFAULT_STAFF_TEMPLATES: StaffWhatsAppKind[] = [
  "shift_confirm", "job_assigned", "pickup_ready", "general_check_in", "schedule_change",
];

export function WhatsAppButton(props: Props) {
  const {
    phone, forceShow = false,
    size = "sm", variant = "outline", className,
    label = "WhatsApp",
    defaultTemplate, onSent,
  } = props;

  const showButton = !!phone && (forceShow || isLikelyMobile(phone));

  const templateKeys = useMemo<string[]>(() => {
    if (props.kind === "client") {
      return props.templates ?? DEFAULT_CLIENT_TEMPLATES;
    }
    return props.templates ?? DEFAULT_STAFF_TEMPLATES;
  }, [props.kind, "templates" in props ? props.templates : null]);

  const [open, setOpen] = useState(false);
  const [pickedKey, setPickedKey] = useState<string>(
    defaultTemplate ?? templateKeys[0],
  );
  const [message, setMessage] = useState<string>("");
  // Track whether the operator has hand-edited the message so changing
  // templates does not blow away their words.
  const [edited, setEdited] = useState(false);

  // Render the picked template against the latest context whenever the
  // popover is open and the operator has not started typing.
  const renderedTemplate = useMemo(() => {
    if (props.kind === "client") {
      return renderClientWhatsApp(pickedKey as ClientWhatsAppKind, props.ctx);
    }
    return renderStaffWhatsApp(pickedKey as StaffWhatsAppKind, props.ctx);
  }, [props.kind, props.ctx, pickedKey]);

  // Sync template -> textarea while the operator has not edited it.
  // Effect runs whenever the picked template, the rendered string or
  // the popover state changes; the `edited` guard prevents wiping a
  // message the operator typed by hand.
  useEffect(() => {
    if (open && !edited) {
      setMessage(renderedTemplate);
    }
  }, [open, edited, renderedTemplate]);

  const handleSend = () => {
    const ok = openWhatsApp(phone, message || renderedTemplate);
    if (ok) {
      onSent?.(pickedKey);
      setOpen(false);
      // Reset edited flag for the next open.
      setEdited(false);
    }
  };

  const labels: Record<string, string> =
    props.kind === "client" ? CLIENT_WHATSAPP_LABELS : STAFF_WHATSAPP_LABELS;

  if (!showButton) return null;

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) {
        // Re-seed message from template each time the popover opens
        // unless the operator was mid-edit.
        if (!edited) setMessage(renderedTemplate);
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size={size}
          variant={variant}
          className={`gap-1.5 ${className ?? ""}`}
        >
          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
          {label || null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-semibold text-slate-900">WhatsApp message</p>
        </div>

        {/* Template chips -- picking one re-renders the message body. */}
        <div className="flex flex-wrap gap-1">
          {templateKeys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPickedKey(k);
                // Switching template after the user has typed should
                // overwrite their text -- otherwise the chip click
                // does nothing visible. This is the common case (they
                // changed their mind about which message to send).
                setEdited(false);
              }}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                pickedKey === k
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {labels[k]}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => {
            setEdited(true);
            setMessage(e.target.value);
          }}
          rows={6}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs leading-5"
        />

        <p className="text-[10px] text-slate-500 leading-snug">
          Opens WhatsApp with the message pre-filled. You hit send -- nothing leaves until you do.
        </p>

        <Button
          type="button"
          onClick={handleSend}
          className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          Send via WhatsApp
        </Button>
      </PopoverContent>
    </Popover>
  );
}
