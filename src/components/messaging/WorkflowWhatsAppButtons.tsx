import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import { leadWhatsAppConfig, orderWhatsAppConfig, type WhatsAppLead, type WhatsAppOrder } from "@/lib/whatsappContexts";

function WorkflowWhatsAppButton({ config, className, label }: {
  config: ReturnType<typeof leadWhatsAppConfig>;
  className?: string;
  label?: string;
}) {
  const { profile, company } = useAuth();
  return <WhatsAppButton
    kind="client"
    {...config}
    ctx={{ ...config.ctx, fromName: profile?.full_name || null, companyName: company?.company_name || null }}
    className={className}
    label={label}
    showWhenUnavailable
  />;
}

export function LeadWhatsAppButton({ lead, className, label = "Open WhatsApp chat" }: { lead: WhatsAppLead; className?: string; label?: string }) {
  return <WorkflowWhatsAppButton config={leadWhatsAppConfig(lead)} className={className} label={label} />;
}

export function OrderWhatsAppButton({ order, className, label = "Open WhatsApp chat" }: { order: WhatsAppOrder; className?: string; label?: string }) {
  return <WorkflowWhatsAppButton config={orderWhatsAppConfig(order)} className={className} label={label} />;
}
