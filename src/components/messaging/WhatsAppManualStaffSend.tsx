import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getTemplateDefinition, renderTemplate } from "@/lib/messageTemplates/registry";

type StaffMessageKey =
  | "whatsapp_staff_shift_confirm"
  | "whatsapp_staff_schedule_change"
  | "whatsapp_staff_check_in"
  | "whatsapp_staff_welcome_no_login";

const WHATSAPP_SEND_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

interface Props {
  messageKey: StaffMessageKey;
  recipientName: string;
  recipientPhone?: string | null;
  variables?: Record<string, string | null | undefined>;
  buttonLabel: string;
  iconOnly?: boolean;
  className?: string;
}

export function WhatsAppManualStaffSend({
  messageKey,
  recipientName,
  recipientPhone,
  variables,
  buttonLabel,
  iconOnly = false,
  className,
}: Props) {
  const { user, profile, company } = useAuth();
  const [open, setOpen] = useState(false);
  const definition = getTemplateDefinition(messageKey);
  const variablesJson = JSON.stringify(variables || {});
  const initialMessage = useMemo(() => {
    if (!definition) return "";
    const examples = Object.fromEntries(definition.variables.map((variable) => [variable.name, variable.example]));
    return renderTemplate(definition.defaultBody, {
      ...examples,
      first_name: recipientName.trim().split(/\s+/)[0] || "there",
      staff_name: recipientName,
      from_name: profile?.full_name || company?.company_name || "Your manager",
      company_name: company?.company_name || "Your company",
      ...JSON.parse(variablesJson),
    });
  }, [company?.company_name, definition, profile?.full_name, recipientName, variablesJson]);
  const [message, setMessage] = useState(initialMessage);
  const role = String(profile?.active_role || profile?.role || user?.active_role || user?.role || "");
  const href = buildWhatsAppUrl(recipientPhone || "", message.trim());

  useEffect(() => {
    if (open) setMessage(initialMessage);
  }, [initialMessage, open]);

  if (!WHATSAPP_SEND_ROLES.has(role)) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={className}
          aria-label={iconOnly ? `${buttonLabel} for ${recipientName}` : undefined}
          title={iconOnly ? buttonLabel : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className={iconOnly ? "sr-only" : ""}>{buttonLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(90vw,24rem)] p-3">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{definition?.label || buttonLabel}</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {recipientPhone
                ? `For ${recipientName}. WhatsApp opens with the message ready for you to review and send.`
                : `Add a mobile number for ${recipientName} to open WhatsApp.`}
            </p>
          </div>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            aria-label={`Message to ${recipientName}`}
            className="text-sm"
          />
          {href && message.trim() ? (
            <Button asChild size="sm" className="w-full gap-1.5">
              <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
              </a>
            </Button>
          ) : (
            <Button type="button" size="sm" className="w-full gap-1.5" disabled>
              <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
