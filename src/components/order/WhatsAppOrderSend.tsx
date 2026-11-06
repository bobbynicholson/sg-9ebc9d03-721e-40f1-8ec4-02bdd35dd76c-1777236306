/**
 * Sends one approved WhatsApp message about this order through the company's
 * business account, so it is logged. Template approval is shown on demand.
 */
import { WhatsAppTemplateSend } from "@/components/messaging/WhatsAppTemplateSend";

export function WhatsAppOrderSend({ orderId, companyId, onSent }: { orderId: string; companyId: string; onSent: () => void }) {
  return (
    <div className="pb-3">
      <WhatsAppTemplateSend entityType="order" entityId={orderId} companyId={companyId} onSent={onSent} />
    </div>
  );
}
