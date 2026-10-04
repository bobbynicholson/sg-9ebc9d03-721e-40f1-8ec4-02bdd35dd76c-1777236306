/* eslint-disable @typescript-eslint/no-explicit-any */
import { paymentGatewayService } from "@/services/paymentGatewayService";
/** Resolve the checkout version first. A gateway edit must not change an in-flight payment's tenant/account. */
export async function getCheckoutGatewayCredentials(admin: any, attempt: any, fallbackGatewayId?: string) {
  const versionId = String(attempt?.metadata?.gatewayVersionId || "");
  if (versionId) {
    const { data, error } = await admin.from("payment_gateway_credential_versions").select("*").eq("id", versionId).single();
    if (error) throw error;
    if (data.company_id !== attempt.company_id || data.provider !== attempt.provider ||
        data.gateway_id !== attempt.metadata.gatewayId) throw new Error("Checkout gateway version does not match company");
    return { gateway: { id: data.gateway_id, company_id: data.company_id, provider: data.provider, is_test: data.is_test },
      credentials: data.credentials as Record<string, string> };
  }
  const gatewayId = fallbackGatewayId || String(attempt?.metadata?.gatewayId || "");
  return gatewayId ? paymentGatewayService.getByIdWithCredentials(gatewayId, admin, true) : null;
}
