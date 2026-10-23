import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import { leadWhatsAppConfig, orderWhatsAppConfig, type WhatsAppLead, type WhatsAppOrder } from "@/lib/whatsappContexts";

function WorkflowWhatsAppButton({ config, className }: {
  config: ReturnType<typeof leadWhatsAppConfig>;
  className?: string;
}) {
  const { profile, company } = useAuth();
  return <WhatsAppButton
    kind="client"
    {...config}
    ctx={{ ...config.ctx, fromName: profile?.full_name || null, companyName: company?.company_name || null }}
    className={className}
    showWhenUnavailable
  />;
}

export function LeadWhatsAppButton({ lead, className }: { lead: WhatsAppLead; className?: string }) {
  return <WorkflowWhatsAppButton config={leadWhatsAppConfig(lead)} className={className} />;
}

export function OrderWhatsAppButton({ order, className }: { order: WhatsAppOrder; className?: string }) {
  return <WorkflowWhatsAppButton config={orderWhatsAppConfig(order)} className={className} />;
}
