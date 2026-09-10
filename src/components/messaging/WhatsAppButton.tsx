/**
 * WhatsAppButton - the single way to send a WhatsApp message from
 * anywhere in the admin tool.
 *
 * Behaviour:
 *   - Renders as a button. Click opens a small popover.
 *   - Popover lets the operator pick a template (chips), tweak the
 *     message in a textarea, then hit "Send via WhatsApp" which opens
 *     the right deep-link for the platform (mobile -> wa.me, desktop
 *     -> web.whatsapp.com/send so we skip the download nudge).
 *   - Hides cleanly when the phone is missing or looks like a SA
 *     landline - no point firing a chat that will never deliver.
 *     Pass `forceShow` to override the landline filter (useful for
 *     non-SA office numbers where our heuristic does not apply).
 *
 * Two flavours:
 *   - `kind="client"` - shows the client template catalog.
 *   - `kind="staff"`  - shows the staff template catalog.
 *
 * Used by:
 *   /admin/leads        (client lead follow-up)
 *   /admin/quotes       (client quote chase)
 *   /admin/orders       (client event-week / day-of)
 *   /admin/clients      (client follow-up)
 *   /admin/tracking     (client delay / arrived)
 *   /admin/driver-management (staff)
 *   /admin/kitchen-staff     (staff)
 *   /admin/users             (staff - where mobile is captured)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageCircle, Send } from "lucide-react";
import { buildWhatsAppUrl, isLikelyMobile } from "@/lib/whatsapp";
import { useAuth } from "@/contexts/AuthContext";
import { useTemplateOverrides } from "@/hooks/useTemplateOverrides";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  /** Visual sizing - maps to shadcn Button sizes. */
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
  /**
   * When true, render the button greyed out and replace the popover
   * with a "Client has opted out of WhatsApp comms" notice. Lets admin
   * see at a glance that the channel is disabled and why, instead of
   * silently hiding the button. Has no effect for kind="staff".
   */
  optedOut?: boolean;
  /**
   * clients.id for the recipient - when provided (and kind="client"),
   * the button auto-fetches profiles.whatsapp_opt_in via the
   * clients.user_id link and respects the opt-out state without the
   * call site having to thread it through. Pre-signup leads with no
   * profile row are treated as not-opted-out (default true).
   */
  clientId?: string | null;
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
  "welcome_login", "welcome_no_login",
  "shift_confirm", "job_assigned", "pickup_ready", "general_check_in", "schedule_change",
];

export function WhatsAppButton(props: Props) {
  const {
    phone, forceShow = false,
    size = "sm", variant = "outline", className,
    label = "WhatsApp",
    defaultTemplate, onSent,
    optedOut = false,
    clientId,
  } = props;

  const hasPhone = Boolean(phone?.trim());
  const normalisedPhone = phone ? phone.replace(/\D/g, "") : "";
  const phoneIsUsable = hasPhone && (forceShow || isLikelyMobile(phone));
  const phoneUnavailableReason = !normalisedPhone
    ? "Add a valid phone number before opening WhatsApp."
    : "This number does not look like a WhatsApp mobile number.";
  const { toast } = useToast();

  // Auto-resolve opt-out from the recipient's profile when given a
  // clientId. Two single-row queries; cached in component state for
  // the lifetime of the mount. Errors / missing rows fall back to
  // "not opted out" so we don't accidentally hide the button just
  // because the profile fetch failed.
  const [autoOptedOut, setAutoOptedOut] = useState(false);
  useEffect(() => {
    if (props.kind !== "client" || !clientId) {
      setAutoOptedOut(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: clientRow, error: clientRowError } = await supabase
        .from("clients")
        .select("user_id")
        .eq("id", clientId)
        .maybeSingle();
      if (clientRowError) {
        console.error("[WhatsAppButton] clients fetch failed:", clientRowError);
      }
      const userId = (clientRow as any)?.user_id;
      if (cancelled || !userId) return;
      const { data: profileRow, error: profileRowError } = await supabase
        .from("profiles")
        .select("whatsapp_opt_in")
        .eq("id", userId)
        .maybeSingle();
      if (profileRowError) {
        console.error("[WhatsAppButton] profiles fetch failed:", profileRowError);
      }
      if (cancelled) return;
      setAutoOptedOut((profileRow as any)?.whatsapp_opt_in === false);
    })();
    return () => { cancelled = true; };
  }, [clientId, props.kind]);

  const isOptedOut = props.kind === "client" && (optedOut || autoOptedOut);

  // Pull companyId off the auth context so the renderer can layer on
  // the company's customised templates. Prewarm the override cache
  // on mount; the version counter forces the rendered template to
  // re-compute once the cache is hot, so the first open of the
  // popover after a fresh login picks up the latest customisation.
  const { profile } = useAuth() as any;
  const companyId: string | null = profile?.company_id ?? null;
  // Tenant slug for the portal-login link the client templates
  // append. Pulled from the URL first (every admin page lives at
  // /[slug]/admin/...) and falls back to the auth profile join.
  const router = useRouter();
  const companySlug: string | null =
    (typeof router.query.company_slug === "string" && router.query.company_slug)
    || profile?.company_slug
    || profile?.companies?.slug
    || null;
  const { version: overridesVersion } = useTemplateOverrides(companyId);
  // Wave 24: tenant-currency aware so the {total} interpolation in
  // client templates renders in the right symbol for non-ZAR tenants.
  const tenantCurrency = useTenantCurrency(companyId);

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
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // Track whether the operator has hand-edited the message so changing
  // templates does not blow away their words.
  const [edited, setEdited] = useState(false);

  // Render the picked template against the latest context whenever the
  // popover is open and the operator has not started typing.
  // overridesVersion is part of the dep list so a customisation saved
  // in another tab takes effect on the next render.
  const renderedTemplate = useMemo(() => {
    if (props.kind === "client") {
      return renderClientWhatsApp(pickedKey as ClientWhatsAppKind, {
        ...props.ctx,
        companyId,
        companySlug,
        currencyCode: tenantCurrency.code,
      });
    }
    return renderStaffWhatsApp(pickedKey as StaffWhatsAppKind, { ...props.ctx, companyId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.kind, props.ctx, pickedKey, companyId, companySlug, overridesVersion, tenantCurrency.code]);

  // Sync template -> textarea while the operator has not edited it.
  // Effect runs whenever the picked template, the rendered string or
  // the popover state changes; the `edited` guard prevents wiping a
  // message the operator typed by hand.
  useEffect(() => {
    if (open && !edited) {
      setMessage(renderedTemplate);
    }
  }, [open, edited, renderedTemplate]);

  const handleSend = (event?: React.MouseEvent<HTMLAnchorElement>) => {
    if (sendingRef.current) {
      event?.preventDefault();
      return;
    }
    // The textarea is seeded from an effect when the popover opens. If the
    // operator clicks immediately, React may not have committed that effect
    // yet even though the template is already available. Always fall back to
    // the rendered template so a fast click can never look like a dead button.
    const body = message.trim() ? message : renderedTemplate;
    if (!body.trim()) {
      event?.preventDefault();
      toast({
        title: "WhatsApp message is empty",
        description: "Add a message before opening WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    sendingRef.current = true;
    setSending(true);
    const url = buildWhatsAppUrl(phone, body);
    if (!url) {
      event?.preventDefault();
      toast({
        title: "Could not open WhatsApp",
        description: "Add a valid WhatsApp mobile number and try again.",
        variant: "destructive",
      });
      sendingRef.current = false;
      setSending(false);
      return;
    }

    // Let the browser perform the native anchor navigation. This is more
    // reliable than window.open in embedded/local Chromium and still opens
    // the exact URL built from the current textarea contents.
    toast({
      title: "WhatsApp opened",
      description: "Review the pre-filled message and press Send in WhatsApp.",
    });
    onSent?.(pickedKey);
    // Do not unmount the anchor in the same click event. Chromium can cancel
    // a native target=_blank navigation when the clicked node disappears
    // synchronously (the popover close used to make the action look dead).
    // Keep it mounted long enough for the browser to dispatch the link, then
    // close the composer.
    window.setTimeout(() => {
      setOpen(false);
      setEdited(false);
    }, 250);
    // The action is a browser launch rather than a network send. Keep a
    // short synchronous click lock so double-clicks cannot open duplicate
    // WhatsApp tabs, while still allowing a retry after a blocked popup.
    window.setTimeout(() => {
      sendingRef.current = false;
      setSending(false);
    }, 900);
  };

  const labels: Record<string, string> =
    props.kind === "client" ? CLIENT_WHATSAPP_LABELS : STAFF_WHATSAPP_LABELS;

  if (!hasPhone) return null;

  if (!phoneIsUsable) {
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled
        className={`gap-1.5 opacity-60 ${className ?? ""}`}
        title={phoneUnavailableReason}
      >
        <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
        {label || "WhatsApp unavailable"}
      </Button>
    );
  }

  // Opted-out branch: render the same trigger so the layout doesn't
  // jump, but visibly grey it out and pop a notice instead of the
  // composer. Admins see at a glance that the channel is disabled
  // for this client and why - silent hiding would just confuse.
  if (isOptedOut) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size={size}
            variant={variant}
            className={`gap-1.5 opacity-50 cursor-not-allowed ${className ?? ""}`}
            title="Client has opted out of WhatsApp comms"
          >
            <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
            {label || null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] p-3">
          <p className="text-sm font-semibold text-slate-900 mb-1">
            WhatsApp comms off
          </p>
          <p className="text-xs text-slate-600 leading-snug">
            This client has opted out of WhatsApp updates from their profile page.
            Reach them by email or phone instead - or ask them to flip the toggle on.
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        size={size}
        variant={variant}
        aria-label={label || "Open WhatsApp message composer"}
        aria-expanded={open}
        className={`gap-1.5 ${className ?? ""}`}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen && !edited) setMessage(renderedTemplate);
        }}
      >
        <MessageCircle className="w-3.5 h-3.5 text-brand-primary" />
        {label || null}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="WhatsApp message composer"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-brand-primary" />
              <p className="text-sm font-semibold text-slate-900">WhatsApp message</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Close
            </button>
          </div>

          {/* Template chips - picking one re-renders the message body. */}
          <div className="flex flex-wrap gap-1">
            {templateKeys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setPickedKey(k);
                  // Switching template after the user has typed should
                  // overwrite their text - otherwise the chip click
                  // does nothing visible. This is the common case (they
                  // changed their mind about which message to send).
                  setEdited(false);
                }}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  pickedKey === k
                    ? "bg-brand-primary text-white border-brand-primary/80"
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
            Opens WhatsApp with the message pre-filled. You hit send. Nothing leaves until you do.
          </p>

          <Button
            asChild
            className="w-full h-9 bg-brand-primary hover:bg-brand-primary/90 gap-1.5"
          >
            <a
              href={buildWhatsAppUrl(phone, message.trim() ? message : renderedTemplate) || "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Send current message via WhatsApp"
              aria-disabled={sending}
              tabIndex={sending ? -1 : 0}
              onClick={(event) => {
                if (sending) {
                  event.preventDefault();
                  return;
                }
                handleSend(event);
              }}
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? "Opening WhatsApp…" : "Send via WhatsApp"}
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
