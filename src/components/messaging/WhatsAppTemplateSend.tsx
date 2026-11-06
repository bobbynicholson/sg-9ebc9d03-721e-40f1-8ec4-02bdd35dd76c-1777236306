import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { WHATSAPP_AUTOMATIONS, type WhatsAppAutomationKey } from "@/lib/whatsapp/automations";

type EntityType = "lead" | "quote" | "order";
type TemplateStatus = "APPROVED" | "IN_REVIEW" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "MISSING" | "NOT_SET_UP";

const TEMPLATE_KEYS: Record<EntityType, WhatsAppAutomationKey[]> = {
  lead: ["whatsapp_lead_followup", "whatsapp_lead_details", "whatsapp_lead_chase"],
  quote: ["whatsapp_quote_sent", "whatsapp_quote_chase", "whatsapp_quote_accepted"],
  order: [
    "whatsapp_order_update",
    "whatsapp_event_week",
    "whatsapp_event_day_morning",
    "whatsapp_order_on_the_way",
    "whatsapp_event_arrived",
    "whatsapp_order_delivered",
  ],
};

const STATUS_LABEL: Record<TemplateStatus, string> = {
  APPROVED: "Approved",
  IN_REVIEW: "In review",
  PENDING: "Pending review",
  REJECTED: "Rejected",
  PAUSED: "Paused by Meta",
  DISABLED: "Disabled by Meta",
  MISSING: "Not found in WhatsApp Manager",
  NOT_SET_UP: "Not set up",
};

interface Props {
  entityType: EntityType;
  entityId: string;
  companyId?: string | null;
  recipientName?: string | null;
  onSent?: () => void;
  className?: string;
}

interface TemplateChoice {
  key: WhatsAppAutomationKey;
  label: string;
  templateName: string;
  language: string;
  status: TemplateStatus;
}

function withCompany(path: string, companyId?: string | null) {
  if (!companyId) return path;
  return `${path}?companyId=${encodeURIComponent(companyId)}`;
}

export function WhatsAppTemplateSend({ entityType, entityId, companyId, recipientName, onSent, className }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<TemplateChoice[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [sending, setSending] = useState(false);
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const settingsResponse = await fetch(withCompany("/api/admin/whatsapp/settings", companyId));
      const settings = await settingsResponse.json().catch(() => ({}));
      if (!settingsResponse.ok) throw new Error(settings?.error || "Could not load WhatsApp settings.");
      if (!settings.connected) {
        setConnected(false);
        setChoices([]);
        setLoaded(true);
        return;
      }

      const templatesResponse = await fetch(withCompany("/api/admin/whatsapp/templates", companyId));
      const templateData = await templatesResponse.json().catch(() => ({})) as {
        error?: string;
        templates?: Array<{ name: string; status: string; language: string }>;
      };
      if (!templatesResponse.ok) throw new Error(templateData?.error || "Could not check template status with Meta.");

      const allowedKeys = new Set(TEMPLATE_KEYS[entityType]);
      const nextChoices = WHATSAPP_AUTOMATIONS.filter((item) => allowedKeys.has(item.key)).map((item) => {
        const setting = settings.automations?.[item.key];
        const templateName = String(setting?.templateName || "");
        const language = String(setting?.language || "en");
        const found = (templateData.templates || []).find((template) =>
          template.name === templateName && template.language === language,
        );
        const status = (found?.status || (templateName ? "MISSING" : "NOT_SET_UP")) as TemplateStatus;
        return { key: item.key, label: item.label, templateName, language, status };
      });
      setConnected(true);
      setChoices(nextChoices);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load WhatsApp templates.");
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [companyId, entityType]);

  useEffect(() => {
    if (open && !loaded && !loading) void loadTemplates();
  }, [open, loaded, loading, loadTemplates]);

  const approvedChoices = choices.filter((choice) => choice.status === "APPROVED" && choice.templateName);
  const templatesInReview = choices.some((choice) => choice.status === "IN_REVIEW" || choice.status === "PENDING");
  const templatesNotSetUp = choices.length > 0 && choices.every((choice) => choice.status === "NOT_SET_UP");
  const selected = approvedChoices.find((choice) => choice.key === selectedKey);

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const response = await fetch(withCompany("/api/admin/whatsapp/send", companyId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record", entityType, entityId, key: selected.key }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Try again.");
      toast({ title: "WhatsApp queued", description: "The approved template will be sent through your business number shortly." });
      setSelectedKey("");
      setOpen(false);
      onSent?.();
    } catch (cause) {
      toast({ title: "WhatsApp not sent", description: cause instanceof Error ? cause.message : "Try again.", variant: "destructive" });
      if (cause instanceof Error && /approval|review|template|Meta/i.test(cause.message)) {
        setLoaded(false);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={className}>
          <Send className="h-3.5 w-3.5" /> Send template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(90vw,22rem)] p-3">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Business WhatsApp</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {recipientName ? `Send an approved template to ${recipientName}.` : "Send an approved template through your connected business number."}
            </p>
          </div>

          {loading ? (
            <p role="status" className="text-sm text-slate-600">Checking templates with Meta…</p>
          ) : error ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-rose-700">{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadTemplates()}>Try again</Button>
            </div>
          ) : connected === false ? (
            <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">Connect your business number in Admin → WhatsApp before sending templates.</p>
          ) : loaded ? (
            <>
              {choices.length > 0 ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-700">Choose a message</span>
                  <select
                    value={selectedKey}
                    onChange={(event) => setSelectedKey(event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                  >
                    <option value="">Select a template</option>
                    {choices.map((choice) => (
                      <option key={choice.key} value={choice.key} disabled={choice.status !== "APPROVED" || !choice.templateName}>
                        {choice.label} · {STATUS_LABEL[choice.status] || choice.status.toLowerCase().replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">No templates are set up for this type of record yet. Set them up in Admin → WhatsApp.</p>
              )}
              {templatesInReview && approvedChoices.length === 0 && (
                <p className="text-xs text-slate-600">Meta has not approved these templates yet. Sending becomes available as soon as one is approved.</p>
              )}
              {templatesNotSetUp && (
                <p className="text-xs text-slate-600">Add these templates from Admin → WhatsApp before sending them here.</p>
              )}
              <Button type="button" size="sm" className="w-full" disabled={!selected || sending} onClick={() => void send()}>
                <Send className="h-3.5 w-3.5" /> {sending ? "Queueing…" : "Send through business WhatsApp"}
              </Button>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
