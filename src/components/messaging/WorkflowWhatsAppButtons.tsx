import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import { leadWhatsAppConfig, orderWhatsAppConfig, type WhatsAppLead, type WhatsAppOrder } from "@/lib/whatsappContexts";

function WorkflowWhatsAppButton({ config, className, label, compactOnMobile, iconOnly }: {
  config: ReturnType<typeof leadWhatsAppConfig>;
  className?: string;
  label?: string;
  compactOnMobile?: boolean;
  iconOnly?: boolean;
}) {
  const { profile, company } = useAuth();
  return <WhatsAppButton
    kind="client"
    {...config}
    ctx={{ ...config.ctx, fromName: profile?.full_name || null, companyName: company?.company_name || null }}
    className={className}
    label={label}
    compactOnMobile={compactOnMobile}
    iconOnly={iconOnly}
    showWhenUnavailable
  />;
}

export function LeadWhatsAppButton({ lead, className, label = "Open WhatsApp chat", compactOnMobile, iconOnly }: { lead: WhatsAppLead; className?: string; label?: string; compactOnMobile?: boolean; iconOnly?: boolean }) {
  return <WorkflowWhatsAppButton config={leadWhatsAppConfig(lead)} className={className} label={label} compactOnMobile={compactOnMobile} iconOnly={iconOnly} />;
}

export function OrderWhatsAppButton({ order, className, label = "Open WhatsApp chat", compactOnMobile }: { order: WhatsAppOrder; className?: string; label?: string; compactOnMobile?: boolean }) {
  return <WorkflowWhatsAppButton config={orderWhatsAppConfig(order)} className={className} label={label} compactOnMobile={compactOnMobile} />;
}
