/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrderClientChatPanel } from "@/components/chat/OrderClientChatPanel";

interface Props {
  orderId: string;
  companyId: string | null;
  adminUserId: string | null;
  clientId: string | null;
  orderLabel: string | null;
}

// CLI-J: admin-side wrapper for OrderClientChatPanel. Resolves the
// client's auth.users id (clients.user_id) so the staff -> client
// notification fan-out has a recipient. When the client has never
// signed up (user_id is null on the row) we still let the admin
// post; the notification simply skips.
export function OrderMessagesTab({
  orderId,
  companyId,
  adminUserId,
  clientId,
  orderLabel,
}: Props) {
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setClientUserId(null);
      setLoadingClient(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingClient(true);
      const { data, error } = await supabase
        .from("clients")
        .select("user_id")
        .eq("id", clientId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[OrderMessagesTab] could not resolve client.user_id:", error);
        setClientUserId(null);
      } else {
        setClientUserId((data as any)?.user_id || null);
      }
      setLoadingClient(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!companyId || !adminUserId) {
    return (
      <p className="text-sm text-slate-500">
        You need to be signed in to a tenant to view messages.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!loadingClient && !clientUserId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          This client hasn't signed up to the portal yet, so they won't see in-app messages until they do. Existing messages are still logged here for the audit trail.
        </p>
      )}
      <OrderClientChatPanel
        companyId={companyId}
        orderId={orderId}
        userId={adminUserId}
        senderRole="admin"
        orderLabel={orderLabel}
        clientUserId={clientUserId}
        maxHeight="360px"
      />
    </div>
  );
}
